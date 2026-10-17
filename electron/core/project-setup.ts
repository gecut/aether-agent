import { lstat, readFile, appendFile, realpath } from "node:fs/promises";
import path from "node:path";
import { git } from "./repository";
import { sensitive, redact } from "./security";

export async function excludeLocal(cwd: string, pattern: string) {
  const gitdir = await realpath(
    path.resolve(
      cwd,
      (await git(cwd, ["rev-parse", "--git-common-dir"])).trim(),
    ),
  );
  const target = path.join(gitdir, "info", "exclude");
  const info = await lstat(target).catch(() => undefined);
  if (info?.isSymbolicLink())
    throw new Error("Git exclude file must not be a symlink");
  const parent = await realpath(path.dirname(target));
  if (parent !== path.join(gitdir, "info"))
    throw new Error("Unsafe Git metadata path");
  const current = await readFile(target, "utf8").catch(() => "");
  if (!current.split("\n").includes(pattern))
    await appendFile(target, `\n${pattern}\n`);
}

const preparing = new Map<string, Promise<string>>();
export function prepareProject(cwd: string): Promise<string> {
  const pending = preparing.get(cwd);
  if (pending) return pending;
  const task = setup(cwd).finally(() => preparing.delete(cwd));
  preparing.set(cwd, task);
  return task;
}
async function setup(cwd: string) {
  let root = (
    await git(cwd, ["rev-parse", "--show-toplevel"]).catch(() => "")
  ).trim();
  if (!root) {
    if (await lstat(path.join(cwd, ".git")).catch(() => undefined))
      throw new Error(
        "Existing Git metadata is invalid; repair it before opening this project.",
      );
    await git(cwd, ["init", "--initial-branch=main"]);
    root = cwd;
  }
  root = await realpath(root);
  if (await git(root, ["rev-parse", "--verify", "HEAD"]).catch(() => ""))
    return root;
  if ((await git(root, ["diff", "--cached", "--name-only"])).trim())
    throw new Error(
      "This new repository already has staged files. Make its initial commit yourself; Aether preserved your index.",
    );
  for (const pattern of [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "*.p12",
    "*.pfx",
    "node_modules/",
    "dist/",
    "build/",
    ".DS_Store",
    ".agents/skills/",
  ])
    await excludeLocal(root, pattern);
  const files = (
    await git(root, ["ls-files", "--others", "--exclude-standard", "-z"])
  )
    .split("\0")
    .filter(Boolean);
  if (files.length > 10000)
    throw new Error(
      "Too many files for automatic Git setup. Add a .gitignore and reopen the project.",
    );
  for (const file of files) {
    const location = path.join(root, file);
    const stat = await lstat(location);
    const unsafe =
      /[\r\n]/.test(file) ||
      sensitive(file) ||
      !stat.isFile() ||
      stat.size > 5_000_000;
    const bytes = unsafe ? undefined : await readFile(location);
    const text = bytes?.toString("utf8") ?? "";
    if (
      unsafe ||
      /-----BEGIN .*PRIVATE KEY-----/.test(text) ||
      redact(text) !== text
    ) {
      await excludeLocal(
        root,
        "/" + file.replace(/[\n\r]/g, "").replace(/([*?\[\]\\ ])/g, "\\$1"),
      );
      continue;
    }
    // Stage the scanned bytes, rather than rereading a file that may change during setup.
    const blob = (
      await git(root, ["hash-object", "-w", "--stdin"], bytes!)
    ).trim();
    await git(root, [
      "update-index",
      "--add",
      "--cacheinfo",
      `${stat.mode & 0o111 ? "100755" : "100644"},${blob},${file}`,
    ]);
  }
  await git(root, [
    "-c",
    "user.name=Aether Code",
    "-c",
    "user.email=local@aether.invalid",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "--allow-empty",
    "-m",
    "Initialize project for Aether Code",
  ]);
  return root;
}
