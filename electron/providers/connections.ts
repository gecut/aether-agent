import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { execute } from "../core/process";
import { redact } from "../core/security";
import { Store } from "../core/store";
import { findBinary } from "./runtime";
import type { ConnectionStatus } from "../../shared/types";
export type OAuthProvider = ConnectionStatus["provider"];
const names = { codex: "Codex", antigravity: "Antigravity" };
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export function loginScript(
  binary: string,
  provider: OAuthProvider,
  cwd: string,
) {
  const args =
    provider === "codex" ? ["login"] : ["--mode", "plan", "--sandbox"];
  return `#!/bin/sh
# Official provider login; credentials remain in the provider's own store.
unset OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY GOOGLE_API_KEY CODEX_API_KEY CODEX_ACCESS_TOKEN
cd -- ${quote(cwd)} || exit 1
printf '%s\\n' ${quote(`Aether Code: ${names[provider]} sign-in. Complete the official onboarding and browser flow. Close this terminal when finished, then click Verify connection in Aether.`)}
${[binary, ...args].map(quote).join(" ")}
`;
}
export function classifyConnection(
  provider: OAuthProvider,
  text: string,
): ConnectionStatus {
  const message =
    redact(text).trim().slice(0, 1800) ||
    "The provider did not return a connection result.";
  return {
    provider,
    state:
      /not eligible|not.*available.*location|eligibility|unsupported.*region|permission_denied/i.test(
        message,
      )
        ? "blocked"
        : /not (?:logged|signed) in|authentication required|sign.in.*required|no.*credentials/i.test(
              message,
            )
          ? "signed-out"
          : "error",
    message,
    checkedAt: new Date().toISOString(),
  };
}
export class ProviderConnections {
  private checking = new Map<OAuthProvider, AbortController>();
  constructor(
    private store: Store,
    private launch: (file: string) => Promise<void>,
    private changed: () => void,
  ) {}
  status(provider: OAuthProvider) {
    return this.store.get<ConnectionStatus>("connection", provider);
  }
  private save(status: ConnectionStatus) {
    this.store.put("connection", status.provider, status);
    this.changed();
    return status;
  }
  async connect(provider: OAuthProvider) {
    const binary = await findBinary(
      provider === "antigravity" ? "agy" : "codex",
    );
    if (!binary)
      return this.save({
        provider,
        state: "unavailable",
        message: `Install the official ${names[provider]} CLI before signing in.`,
        checkedAt: new Date().toISOString(),
      });
    if (provider === "codex") {
      const status = await execute(binary, ["login", "status"], {
        timeoutMs: 10000,
      });
      if (status.code === 0 && /ChatGPT/i.test(status.stdout + status.stderr))
        return this.save({
          provider,
          state: "signed-in",
          message:
            "Already signed in with the Codex CLI. Your existing session was preserved.",
          checkedAt: new Date().toISOString(),
        });
    }
    const cwd = path.join(this.store.directory, "login-workspace");
    await mkdir(cwd, { recursive: true, mode: 0o700 });
    const directory = path.join(this.store.directory, "login");
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, `${provider}-${randomUUID()}.command`);
    await writeFile(file, loginScript(binary, provider, cwd), { mode: 0o700 });
    await this.launch(file);
    return this.save({
      provider,
      state: "awaiting-signin",
      message: `Complete ${names[provider]}'s onboarding and browser OAuth in the opened Terminal, then close it and click Verify connection. Credentials stay with the official CLI.`,
      checkedAt: new Date().toISOString(),
    });
  }
  async shutdown() {
    for (const controller of this.checking.values()) controller.abort();
    const deadline = Date.now() + 5000;
    while (this.checking.size && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 25));
  }
  async verify(provider: OAuthProvider, signal?: AbortSignal) {
    if (this.checking.has(provider))
      throw new Error(
        "A connection check is already running for this provider",
      );
    const controller = new AbortController();
    this.checking.set(provider, controller);
    signal = signal
      ? AbortSignal.any([signal, controller.signal])
      : controller.signal;
    try {
      const binary = await findBinary(
        provider === "antigravity" ? "agy" : "codex",
      );
      if (!binary)
        return this.save({
          provider,
          state: "unavailable",
          message: `The official ${names[provider]} CLI is not installed.`,
          checkedAt: new Date().toISOString(),
        });
      if (provider === "codex") {
        const result = await execute(binary, ["login", "status"], {
          timeoutMs: 10000,
          signal,
        });
        return this.save(
          result.code === 0
            ? {
                provider,
                state: "signed-in",
                message: redact((result.stdout + result.stderr).trim()),
                checkedAt: new Date().toISOString(),
              }
            : classifyConnection(provider, result.stdout + result.stderr),
        );
      }
      const cwd = path.join(this.store.directory, "login-workspace");
      await mkdir(cwd, { recursive: true, mode: 0o700 });
      const result = await execute(
        binary,
        [
          "--mode",
          "plan",
          "--sandbox",
          "--disable-slash-commands",
          "--print-timeout",
          "30s",
          "--output-format",
          "json",
          "-p",
          "Reply exactly AETHER_CONNECTION_OK. Do not use tools, read files, or change anything.",
        ],
        {
          cwd,
          timeoutMs: 45000,
          limit: 200000,
          signal,
          completeWhen: (line) => {
            try {
              const envelope = JSON.parse(line);
              return (
                envelope.status === "SUCCESS" || envelope.status === "ERROR"
              );
            } catch {
              return false;
            }
          },
        },
      );
      let envelope:
        { status?: string; response?: string; error?: string } | undefined;
      for (const line of result.stdout.trim().split("\n").reverse())
        try {
          envelope = JSON.parse(line);
          break;
        } catch {}
      if (
        result.code === 0 &&
        envelope?.status === "SUCCESS" &&
        envelope.response?.trim() === "AETHER_CONNECTION_OK"
      )
        return this.save({
          provider,
          state: "signed-in",
          message:
            "Official Antigravity CLI completed an authenticated model request using its own saved login.",
          checkedAt: new Date().toISOString(),
        });
      return this.save(
        classifyConnection(
          provider,
          envelope?.error ?? result.stderr + result.stdout,
        ),
      );
    } catch (error) {
      return this.save(classifyConnection(provider, String(error)));
    } finally {
      this.checking.delete(provider);
    }
  }
}
