import { spawn } from "node:child_process";
import { safeEnv, redact } from "./security";
export interface ProcessResult {
  code: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}
export interface ProcessOptions {
  cwd?: string;
  input?: string | Uint8Array;
  signal?: AbortSignal;
  timeoutMs?: number;
  onLine?: (line: string, stream: "stdout" | "stderr") => void;
  completeWhen?: (line: string) => boolean;
  env?: Record<string, string>;
  limit?: number;
}
export async function execute(
  binary: string,
  args: string[],
  options: ProcessOptions = {},
): Promise<ProcessResult> {
  if (options.signal?.aborted) throw new Error("Execution cancelled");
  return new Promise((resolve, reject) => {
    const start = Date.now();
    let stdout = "",
      stderr = "",
      pending = "",
      pendingError = "",
      bytes = 0,
      termination: string | undefined;
    const child = spawn(binary, args, {
      cwd: options.cwd,
      env: safeEnv(options.env),
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
    });
    let killTimer: NodeJS.Timeout | undefined;
    let completionTimer: NodeJS.Timeout | undefined;
    let completedCleanup = false;
    const kill = () => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch {}
      killTimer = setTimeout(() => {
        try {
          if (process.platform !== "win32" && child.pid)
            process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch {}
      }, 1500);
      killTimer.unref();
    };
    const cancel = () => {
      termination = "Execution cancelled";
      kill();
    };
    options.signal?.addEventListener("abort", cancel, { once: true });
    const timer = setTimeout(() => {
      termination = "Execution timed out";
      kill();
    }, options.timeoutMs ?? 600000);
    timer.unref();
    const consume = (data: Buffer, stream: "stdout" | "stderr") => {
      bytes += data.length;
      if (bytes > (options.limit ?? 4_000_000)) {
        if (!termination) {
          termination = "Output exceeded the 4 MB limit";
          kill();
        }
        return;
      }
      const text = data.toString();
      if (stream === "stdout") {
        stdout += text;
        pending += text;
        let i;
        while ((i = pending.indexOf("\n")) >= 0) {
          const line = redact(pending.slice(0, i));
          options.onLine?.(line, stream);
          if (!completionTimer && options.completeWhen?.(line)) {
            // Some CLI builds keep inherited pipes open after a terminal event.
            completionTimer = setTimeout(() => {
              completedCleanup = true;
              kill();
            }, 1500);
            completionTimer.unref();
          }
          pending = pending.slice(i + 1);
        }
      } else {
        stderr += text;
        pendingError += text;
        let i;
        while ((i = pendingError.indexOf("\n")) >= 0) {
          options.onLine?.(redact(pendingError.slice(0, i)), stream);
          pendingError = pendingError.slice(i + 1);
        }
      }
    };
    child.stdout.on("data", (data) => consume(data, "stdout"));
    child.stderr.on("data", (data) => consume(data, "stderr"));
    const cleanup = () => {
      clearTimeout(timer);
      clearTimeout(completionTimer);
      options.signal?.removeEventListener("abort", cancel);
    };
    child.on("error", (error) => {
      cleanup();
      if (killTimer) clearTimeout(killTimer);
      reject(error);
    });
    child.on("close", (code) => {
      cleanup();
      if (pending) options.onLine?.(redact(pending), "stdout");
      if (pendingError) options.onLine?.(redact(pendingError), "stderr");
      if (termination) reject(new Error(termination));
      else
        resolve({
          code: code ?? (completedCleanup ? 0 : 1),
          stdout: redact(stdout),
          stderr: redact(stderr),
          durationMs: Date.now() - start,
        });
    });
    child.stdin.on("error", () => {});
    child.stdin.end(options.input);
  });
}
