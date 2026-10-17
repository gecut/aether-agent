import path from "node:path";
import { execute } from "../core/process";

export function runtimeArchiveError(stderr: string) {
  if (/no space left|not enough space|disk full/i.test(stderr))
    return "IDE setup ran out of disk space while unpacking. Free at least 1.5 GB and retry setup.";
  if (
    /permission denied|access is denied|operation not permitted/i.test(stderr)
  )
    return "IDE setup could not write its files. Check application data folder permissions and retry setup.";
  return `Could not extract the IDE runtime. Retry setup.${stderr ? " " + stderr.slice(-1000) : " The archive tool stopped without an error message."}`;
}

export async function runtimeTar(args: string[], signal?: AbortSignal) {
  // Finder-launched apps can inherit a different PATH from the user's terminal.
  const binary =
    process.platform === "win32"
      ? path.join(
          process.env.SystemRoot ?? "C:\\Windows",
          "System32",
          "tar.exe",
        )
      : "/usr/bin/tar";
  return execute(binary, args, {
    signal,
    timeoutMs: 600000,
    limit: 12_000_000,
    env: {
      COPYFILE_DISABLE: "1",
      ...(process.platform === "win32" ? {} : { PATH: "/usr/bin:/bin" }),
    },
  });
}
