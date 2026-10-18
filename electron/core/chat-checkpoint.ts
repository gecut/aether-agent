import { createHash, randomUUID } from "node:crypto";
import { lstat, readFile, unlink } from "node:fs/promises";
import path from "node:path";
import { git, worktree, changed } from "./repository";
import { execute } from "./process";
import { inside, sensitive, redact, owned } from "./security";
import type { ChatCheckpoint, Project } from "../../shared/types";
import type { Store } from "./store";

type Saved = ChatCheckpoint & { workspace: string; projectId: string };
export async function checkpointChat(
  store: Store,
  project: Project,
  chatId: string,
): Promise<ChatCheckpoint> {
  const previous = store.get<Saved>("chat-checkpoint", chatId);
  const head = (await git(project.path, ["rev-parse", "HEAD"])).trim();
  if (
    (await git(project.path, ["diff", "--name-only", "--diff-filter=U"])).trim()
  )
    throw new Error(
      "Resolve Git merge conflicts before saving a message checkpoint.",
    );
  const respectMode =
    (
      await git(project.path, ["config", "--bool", "core.fileMode"]).catch(
        () => "true",
      )
    ).trim() !== "false";
  const modes = new Map(
    (await git(project.path, ["ls-files", "--stage", "-z"]))
      .split("\0")
      .filter(Boolean)
      .map((entry) => [
        entry.slice(entry.indexOf("\t") + 1),
        entry.slice(0, 6),
      ]),
  );
  const files = [...new Set(await changed(project.path))];
  if (files.length > 1000)
    throw new Error(
      "Checkpoint exceeds 1,000 changed files. Commit or reduce project changes first.",
    );
  const workspace =
    previous?.workspace ??
    path.join(store.directory, "worktrees", "chat-" + chatId);
  if (!previous) {
    await worktree(project.path, head, workspace);
    store.put("chat-checkpoint", chatId, {
      version: 1,
      workspace,
      projectId: project.id,
      commit: head,
      at: new Date().toISOString(),
      excluded: 0,
    } satisfies Saved);
  }
  const index = path.join(store.directory, "checkpoint-index-" + randomUUID());
  const run = async (args: string[], input?: string | Uint8Array) => {
    const result = await execute(
      "git",
      ["-c", "core.hooksPath=/dev/null", ...args],
      {
        cwd: workspace,
        input,
        timeoutMs: 30000,
        env: { GIT_INDEX_FILE: index },
      },
    );
    if (result.code)
      throw new Error(
        result.stderr.trim() || "Checkpoint Git operation failed",
      );
    return result.stdout.trim();
  };
  const pending: { file: string; mode: string; content?: Buffer }[] = [];
  const marks = index + ".marks";
  let excluded = 0,
    bytes = 0;
  try {
    await run(["read-tree", head]);
    for (const file of files) {
      if (
        sensitive(file) ||
        /(^|\/)(artifacts|release|coverage|userData|sessions|\.aether|\.codex|\.claude)(\/|$)/i.test(
          file,
        ) ||
        path.isAbsolute(file) ||
        file.split(/[\\/]/).includes("..")
      ) {
        excluded++;
        continue;
      }
      let info;
      try {
        info = await lstat(path.join(project.path, file));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        pending.push({ file, mode: "0" });
        continue;
      }
      if (!info.isFile() || info.size > 2_000_000) {
        excluded++;
        continue;
      }
      const content = await readFile(await inside(project.path, file));
      bytes += content.length;
      if (bytes > 20_000_000)
        throw new Error(
          "Checkpoint exceeds 20 MB. Commit or reduce project changes first.",
        );
      const text = content.toString("utf8");
      if (
        text.includes("\0") ||
        !Buffer.from(text).equals(content) ||
        redact(text) !== text
      ) {
        excluded++;
        continue;
      }
      pending.push({
        file,
        mode: respectMode
          ? info.mode & 0o111
            ? "100755"
            : "100644"
          : (modes.get(file) ?? "100644"),
        content,
      });
    }
    const blobs = pending.filter((item) => item.content !== undefined);
    if (blobs.length) {
      const data = blobs.flatMap((item, i) => [
        Buffer.from(`blob\nmark :${i + 1}\ndata ${item.content!.length}\n`),
        item.content!,
        Buffer.from("\n"),
      ]);
      data.push(Buffer.from("done\n"));
      await run(
        ["fast-import", "--quiet", "--done", `--export-marks=${marks}`],
        Buffer.concat(data),
      );
    }
    const hashes = new Map(
      blobs.length
        ? (await readFile(marks, "utf8"))
            .trim()
            .split("\n")
            .map((line) => {
              const [mark, hash] = line.split(" ");
              return [Number(mark.slice(1)), hash];
            })
        : [],
    );
    let at = 0;
    const updates = pending
      .map(
        (item) =>
          `${item.mode} ${item.content === undefined ? "0".repeat(head.length) : hashes.get(++at)}\t${item.file}\0`,
      )
      .join("");
    if (updates) await run(["update-index", "-z", "--index-info"], updates);
    const tree = await run(["write-tree"]);
    const parent = previous?.commit ?? head;
    const previousTree = await run(["rev-parse", parent + "^{tree}"]);
    const commit =
      tree === previousTree
        ? parent
        : await run([
            "-c",
            "user.name=Aether Code",
            "-c",
            "user.email=local@aether.invalid",
            "-c",
            "commit.gpgsign=false",
            "commit-tree",
            tree,
            "-p",
            parent,
            "-m",
            "Aether: conversation checkpoint",
          ]);
    await run(["update-ref", "refs/aether/checkpoints/" + chatId, commit]);
    const saved: Saved = {
      version: 1,
      commit,
      at: new Date().toISOString(),
      excluded,
      workspace,
      projectId: project.id,
    };
    store.put("chat-checkpoint", chatId, saved);
    return { version: 1, commit, sourceHead: head, at: saved.at, excluded };
  } finally {
    await unlink(index).catch(() => undefined);
    await unlink(marks).catch(() => undefined);
  }
}

// Compare immutable checkpoint blobs with current scoped project files without touching its index.
export async function matchesCheckpoint(
  root: string,
  commit: string,
  scopes: string[],
) {
  const respectMode =
    (
      await git(root, ["config", "--bool", "core.fileMode"]).catch(() => "true")
    ).trim() !== "false";
  const entries = (await git(root, ["ls-tree", "-r", "-z", commit]))
    .split("\0")
    .filter(Boolean);
  const tree = new Map(
    entries.map((entry) => {
      const split = entry.indexOf("\t");
      const [mode, , hash] = entry.slice(0, split).split(" ");
      return [entry.slice(split + 1), { mode, hash }];
    }),
  );
  const current = (
    await git(root, ["ls-files", "-co", "--exclude-standard", "-z"])
  )
    .split("\0")
    .filter(Boolean);
  const files = [...new Set([...tree.keys(), ...current])].filter(
    (file) => !sensitive(file) && owned(file, scopes),
  );
  if (files.length > 1000)
    throw new Error("Checkpoint comparison exceeds 1,000 scoped files");
  let bytes = 0;
  for (const file of files) {
    const expected = tree.get(file);
    let info;
    try {
      info = await lstat(path.join(root, file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        if (expected) return false;
        continue;
      }
      throw error;
    }
    if (!expected || !info.isFile() || info.size > 2_000_000) return false;
    if (
      respectMode &&
      expected.mode !== (info.mode & 0o111 ? "100755" : "100644")
    )
      return false;
    const content = await readFile(await inside(root, file));
    bytes += content.length;
    if (bytes > 20_000_000)
      throw new Error("Checkpoint comparison exceeds 20 MB");
    const hash = createHash(expected.hash.length === 64 ? "sha256" : "sha1")
      .update(`blob ${content.length}\0`)
      .update(content)
      .digest("hex");
    if (hash !== expected.hash) return false;
  }
  return true;
}
