import { access, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import os from "node:os";
import { executableDirectories } from "../core/environment";
let bundledRoot: string | undefined;
export function configureProviderRuntime(root: string) {
  bundledRoot = root;
}
export function binaryCandidates(
  name: string,
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
  root = bundledRoot,
) {
  if (!/^[a-z][a-z0-9-]*$/i.test(name))
    throw new Error("Invalid executable name");
  const p = platform === "win32" ? path.win32 : path.posix;
  const filename = platform === "win32" ? name + ".exe" : name;
  const candidates = [
    ...(root && name === "codex" ? [p.join(root, filename)] : []),
    ...executableDirectories(platform, env, home).map((directory) =>
      p.join(directory, filename),
    ),
  ];
  if (platform === "darwin" && name === "codex")
    candidates.push(
      "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex",
    );
  return candidates;
}
export async function findBinary(name: string) {
  for (const candidate of binaryCandidates(name)) {
    try {
      await access(candidate, constants.X_OK);
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {}
  }
  return undefined;
}
