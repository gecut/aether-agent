import path from "node:path";
import os from "node:os";
export function executableDirectories(
  platform = process.platform,
  env = process.env,
  home = os.homedir(),
) {
  const p = platform === "win32" ? path.win32 : path.posix;
  const separator = platform === "win32" ? ";" : ":";
  const inherited = (env.PATH ?? env.Path ?? "")
    .split(separator)
    .filter(Boolean);
  const common = [
    p.join(home, ".local", "bin"),
    p.join(home, ".cargo", "bin"),
    p.join(home, ".bun", "bin"),
  ];
  if (platform === "win32") {
    for (const root of [
      env.LOCALAPPDATA,
      env.APPDATA,
      env.ProgramFiles,
      env["ProgramFiles(x86)"],
    ].filter(Boolean) as string[]) {
      common.push(
        root,
        p.join(root, "npm"),
        p.join(root, "Google", "antigravity-cli"),
        p.join(root, "nodejs"),
        p.join(root, "Git", "cmd"),
      );
    }
    if (env.SystemRoot)
      common.push(
        p.join(env.SystemRoot, "System32"),
        p.join(env.SystemRoot, "System32", "WindowsPowerShell", "v1.0"),
      );
  } else
    common.push(
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
    );
  return [...new Set([...inherited, ...common])].filter(p.isAbsolute);
}
export const runtimePath = () => executableDirectories().join(path.delimiter);
