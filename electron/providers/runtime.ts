import { access } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import os from "node:os";
export async function findBinary(name: string) {
  const candidates = [
    ...(process.env.PATH ?? "")
      .split(path.delimiter)
      .map((p) => path.join(p, name)),
    path.join("/opt/homebrew/bin", name),
    path.join("/usr/local/bin", name),
    path.join(os.homedir(), ".local/bin", name),
  ];
  if (name === "codex")
    candidates.push(
      "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
    );
  for (const candidate of candidates)
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {}
  return undefined;
}
