import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { execute } from "../core/process";
import { redact } from "../core/security";
import { Store } from "../core/store";
import { findBinary } from "./runtime";
import { antigravityText } from "./antigravity";
import { defaults } from "../../shared/types";
import type { ConnectionStatus } from "../../shared/types";
export type OAuthProvider = ConnectionStatus["provider"];
const names = {
  codex: "Codex",
  antigravity: "Antigravity",
  claude: "Claude Code",
};
const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
export function loginScript(
  binary: string,
  provider: OAuthProvider,
  cwd: string,
  platform: NodeJS.Platform = process.platform,
  install = false,
) {
  const args =
    provider === "codex"
      ? ["login"]
      : provider === "claude"
        ? ["auth", "login"]
        : ["--mode", "plan", "--sandbox"];
  const messages = `Aether Code: ${names[provider]} setup. Complete official installation, onboarding and browser sign-in. Then verify in Aether.`;
  if (platform === "win32") {
    const psQuote = (text: string) => "'" + text.replaceAll("'", "''") + "'";
    const setup =
      provider === "codex"
        ? "& npm.cmd install --global @openai/codex; if($LASTEXITCODE){throw 'Codex installation failed'}"
        : `$installer=Join-Path ${psQuote(cwd)} 'vendor-install.cmd'; Invoke-WebRequest -Uri ${psQuote(provider === "claude" ? "https://claude.ai/install.cmd" : "https://antigravity.google/cli/install.cmd")} -OutFile $installer; & $env:ComSpec /d /c $installer; if($LASTEXITCODE){throw 'Provider installation failed'}`;
    const ps = `$ErrorActionPreference='Stop'; Set-Location -LiteralPath ${psQuote(cwd)}; foreach($k in @('OPENAI_API_KEY','ANTHROPIC_API_KEY','GEMINI_API_KEY','GOOGLE_API_KEY','CODEX_API_KEY','CODEX_ACCESS_TOKEN')){[Environment]::SetEnvironmentVariable($k,$null,'Process')}; Write-Host ${psQuote(messages)}; ${install ? setup + "; $env:PATH=[Environment]::GetEnvironmentVariable('PATH','Machine')+';'+[Environment]::GetEnvironmentVariable('PATH','User')+';'+(Join-Path $env:USERPROFILE '.local/bin'); " : ""}& ${psQuote(binary)} ${args.map(psQuote).join(" ")}; Read-Host 'Press Enter to close'`;
    return (
      "@echo off\r\npowershell.exe -NoProfile -EncodedCommand " +
      Buffer.from(ps, "utf16le").toString("base64") +
      "\r\n"
    );
  }
  const installer =
    provider === "codex"
      ? "npm install --global @openai/codex"
      : `curl -fsSL ${provider === "claude" ? "https://claude.ai/install.sh" : "https://antigravity.google/cli/install.sh"} | bash`;
  return `#!/bin/sh
# Official provider login; credentials remain in the provider's own store.
unset OPENAI_API_KEY ANTHROPIC_API_KEY GEMINI_API_KEY GOOGLE_API_KEY CODEX_API_KEY CODEX_ACCESS_TOKEN
set -e
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
cd -- ${quote(cwd)} || exit 1
${install ? installer : ""}
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
      provider === "antigravity" ? "agy" : provider,
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
    const suffix =
      process.platform === "win32"
        ? "cmd"
        : process.platform === "darwin"
          ? "command"
          : "sh";
    const file = path.join(directory, `${provider}-${randomUUID()}.${suffix}`);
    await writeFile(file, loginScript(binary, provider, cwd), { mode: 0o700 });
    await this.launch(file);
    return this.save({
      provider,
      state: "awaiting-signin",
      message: `Complete ${names[provider]}'s onboarding and browser OAuth in the opened Terminal, then close it and click Verify connection. Credentials stay with the official CLI.`,
      checkedAt: new Date().toISOString(),
    });
  }
  async setup(provider: OAuthProvider) {
    const binary = await findBinary(
      provider === "antigravity" ? "agy" : provider,
    );
    if (binary) return this.connect(provider);
    const cwd = path.join(this.store.directory, "login-workspace");
    const directory = path.join(this.store.directory, "login");
    await mkdir(cwd, { recursive: true, mode: 0o700 });
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const suffix =
      process.platform === "win32"
        ? "cmd"
        : process.platform === "darwin"
          ? "command"
          : "sh";
    const file = path.join(
      directory,
      `${provider}-setup-${randomUUID()}.${suffix}`,
    );
    await writeFile(
      file,
      loginScript(
        provider === "antigravity" ? "agy" : provider,
        provider,
        cwd,
        process.platform,
        true,
      ),
      { mode: 0o700 },
    );
    await this.launch(file);
    return this.save({
      provider,
      state: "awaiting-signin",
      message: `Install ${names[provider]} and complete sign-in in the opened terminal, then click Verify connection.`,
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
        provider === "antigravity" ? "agy" : provider,
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
      if (provider === "claude") {
        const result = await execute(binary, ["auth", "status", "--json"], {
          timeoutMs: 10000,
          signal,
        });
        let auth: { loggedIn?: boolean };
        try {
          auth = JSON.parse(result.stdout);
        } catch {
          auth = {};
        }
        return this.save(
          result.code === 0 && auth.loggedIn === true
            ? {
                provider,
                state: "signed-in",
                message: "Claude Code authenticated using its own saved login.",
                checkedAt: new Date().toISOString(),
              }
            : classifyConnection(
                provider,
                result.stderr || result.stdout || "Not signed in",
              ),
        );
      }
      const result = await antigravityText(binary, {
        config: { ...defaults.planner, provider: "antigravity" },
        prompt: "Reply exactly AETHER_CONNECTION_OK.",
        signal,
        timeoutMs: 45000,
        onOutput: () => {},
      });
      return this.save(
        result.text.trim() === "AETHER_CONNECTION_OK"
          ? {
              provider,
              state: "signed-in",
              message:
                "Antigravity completed an authenticated text-only model request.",
              checkedAt: new Date().toISOString(),
            }
          : classifyConnection(provider, result.text),
      );
    } catch (error) {
      return this.save(classifyConnection(provider, String(error)));
    } finally {
      this.checking.delete(provider);
    }
  }
}
