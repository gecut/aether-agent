import { spawn } from "node:child_process";
import { safeEnv } from "../core/security";
import { execute } from "../core/process";
import { findBinary } from "./runtime";
export async function launchProviderTerminal(
  file: string,
  openPath: (file: string) => Promise<string>,
  platform = process.platform,
) {
  if (platform === "darwin") {
    const result = await execute("/usr/bin/open", ["-a", "Terminal", file], {
      timeoutMs: 10000,
    });
    if (result.code)
      throw new Error(result.stderr || "Could not open Terminal");
    return;
  }
  if (platform === "win32") {
    const error = await openPath(file);
    if (error) throw new Error(error);
    return;
  }
  for (const [name, prefix] of [
    ["x-terminal-emulator", ["-e"]],
    ["gnome-terminal", ["--"]],
    ["konsole", ["-e"]],
    ["xterm", ["-e"]],
  ] as const) {
    const binary = await findBinary(name);
    if (!binary) continue;
    // Detach a terminal emulator only; script paths are created by ProviderConnections.
    await new Promise<void>((resolve, reject) => {
      const child = spawn(binary, [...prefix, "/bin/sh", file], {
        env: safeEnv(),
        detached: true,
        stdio: "ignore",
        shell: false,
      });
      child.once("error", reject);
      child.once("spawn", () => {
        child.unref();
        resolve();
      });
    });
    return;
  }
  throw new Error(
    "No desktop terminal found. Install x-terminal-emulator, GNOME Terminal, Konsole or xterm, then retry provider setup.",
  );
}
