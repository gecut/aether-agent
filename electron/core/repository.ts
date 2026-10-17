import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { buildContext, type ContextOptions } from "./context";
import { execute } from "./process";
import { inside, sensitive, redact } from "./security";
import type { GitInfo, TestEvidence, TaskSpec } from "../../shared/types";
export async function git(
  cwd: string,
  args: string[],
  input?: string | Uint8Array,
) {
  const result = await execute(
    "git",
    ["-c", "core.hooksPath=/dev/null", ...args],
    { cwd, input, timeoutMs: 30000 },
  );
  if (result.code)
    throw new Error(result.stderr.trim() || "Git command failed");
  return result.stdout;
}
export async function inspect(cwd: string): Promise<GitInfo> {
  try {
    const [branch, status, diff, log, list, head] = await Promise.all([
      git(cwd, ["branch", "--show-current"]),
      git(cwd, ["status", "--short"]),
      git(cwd, ["diff", "HEAD", "--no-ext-diff", "--no-textconv"]),
      git(cwd, ["log", "-8", "--format=%h %s"]),
      git(cwd, ["ls-files", "-co", "--exclude-standard"]),
      git(cwd, ["rev-parse", "HEAD"]),
    ]);
    return {
      branch: branch.trim() || "detached",
      status,
      diff: redact(diff.slice(0, 300000)),
      log,
      files: list
        .split("\n")
        .filter(Boolean)
        .filter((f) => !sensitive(f))
        .slice(0, 500),
      head: head.trim(),
    };
  } catch {
    return {
      branch: "No commit yet",
      status: await git(cwd, ["status", "--short"]).catch(() => ""),
      diff: "",
      log: "",
      files: [],
      head: "",
    };
  }
}
export async function context(
  cwd: string,
  objective: string,
  options: ContextOptions = {},
) {
  let files: string[];
  try {
    files = (await git(cwd, ["ls-files", "-co", "--exclude-standard", "-z"]))
      .split("\0")
      .filter(Boolean);
  } catch {
    return "No Git index available. Open a Git repository with an initial commit to execute tasks.";
  }
  return buildContext(cwd, objective, files, options);
}
export async function readProjectFile(cwd: string, file: string) {
  if (sensitive(file))
    throw new Error("Sensitive or generated files are excluded");
  const target = await inside(cwd, file);
  const content = await readFile(target, "utf8");
  if (content.length > 200000 || content.includes("\0"))
    throw new Error("File is binary or exceeds preview limit");
  return redact(content);
}
export async function worktree(cwd: string, base: string, location: string) {
  await mkdir(path.dirname(location), { recursive: true });
  await git(cwd, ["worktree", "add", "--detach", location, base]);
  return location;
}
export async function diffRun(cwd: string, base: string) {
  return git(cwd, [
    "diff",
    base,
    "HEAD",
    "--binary",
    "--no-ext-diff",
    "--no-textconv",
  ]);
}
export async function changed(cwd: string) {
  return (await git(cwd, ["diff", "--name-only", "-z", "HEAD"]))
    .split("\0")
    .filter(Boolean)
    .concat(
      (await git(cwd, ["ls-files", "--others", "--exclude-standard", "-z"]))
        .split("\0")
        .filter(Boolean),
    );
}
export async function commitWorktree(cwd: string, message: string) {
  await git(cwd, ["add", "--all"]);
  if (!(await git(cwd, ["diff", "--cached", "--name-only"])).trim())
    return (await git(cwd, ["rev-parse", "HEAD"])).trim();
  await git(cwd, [
    "-c",
    "user.name=Aether Code",
    "-c",
    "user.email=local@aether.invalid",
    "-c",
    "core.hooksPath=/dev/null",
    "-c",
    "commit.gpgsign=false",
    "commit",
    "-m",
    message,
  ]);
  return (await git(cwd, ["rev-parse", "HEAD"])).trim();
}
export async function verify(
  cwd: string,
  command: TaskSpec["verification"],
  signal: AbortSignal,
  timeoutMs: number,
): Promise<TestEvidence[]> {
  if (command === "none") return [];
  const [binary, ...args] = command.split(" ");
  const result = await execute(binary, args, {
    cwd,
    signal,
    timeoutMs,
    limit: 1000000,
  });
  return [
    {
      command,
      exitCode: result.code,
      output: redact((result.stdout + "\n" + result.stderr).slice(-30000)),
      at: new Date().toISOString(),
      durationMs: result.durationMs,
    },
  ];
}
