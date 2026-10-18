import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import { execute } from "../core/process";
import { findBinary } from "../providers/runtime";
import type { Store } from "../core/store";
import type {
  GitHubConnection,
  GitHubRepository,
} from "../../shared/integrations";
const quote = (s: string) => "'" + s.replaceAll("'", "'\\''") + "'";
export function githubLoginScript(
  binary: string,
  cwd: string,
  platform = process.platform,
) {
  const args = [
    "auth",
    "login",
    "--hostname",
    "github.com",
    "--git-protocol",
    "https",
    "--web",
  ];
  if (platform === "win32") {
    const q = (s: string) => "'" + s.replaceAll("'", "''") + "'";
    const ps = `foreach($k in @('GH_TOKEN','GITHUB_TOKEN','GH_ENTERPRISE_TOKEN','GITHUB_ENTERPRISE_TOKEN')){[Environment]::SetEnvironmentVariable($k,$null,'Process')}; Set-Location -LiteralPath ${q(cwd)}; & ${q(binary)} ${args.map(q).join(" ")}; Read-Host 'Press Enter to close'`;
    return (
      "@echo off\r\npowershell.exe -NoProfile -EncodedCommand " +
      Buffer.from(ps, "utf16le").toString("base64") +
      "\r\n"
    );
  }
  return `#!/bin/sh\nset -e\nunset GH_TOKEN GITHUB_TOKEN GH_ENTERPRISE_TOKEN GITHUB_ENTERPRISE_TOKEN\ncd -- ${quote(cwd)}\n${[binary, ...args].map(quote).join(" ")}\n`;
}
export class GitHubIntegration {
  private busy = false;
  private closing = false;
  private controller = new AbortController();
  shutdown() {
    this.closing = true;
    this.controller.abort();
  }
  constructor(
    private store: Store,
    private launch: (file: string) => Promise<void>,
    private run = execute,
    private find = findBinary,
  ) {}
  status(): GitHubConnection {
    return (
      this.store.get("integration", "github") ?? {
        state: "signed-out",
        message: "Connect GitHub to browse and clone your repositories.",
      }
    );
  }
  private save(status: GitHubConnection) {
    if (!this.closing) this.store.put("integration", "github", status);
    return status;
  }
  async verify() {
    if (this.closing) throw new Error("Aether is closing.");
    if (this.busy) throw new Error("A GitHub check is already running.");
    this.busy = true;
    try {
      const gh = await this.find("gh");
      if (!gh)
        return this.save({
          state: "unavailable",
          message:
            "Install GitHub CLI from cli.github.com, then verify the connection.",
        });
      const result = await this.run(
        gh,
        ["api", "--hostname", "github.com", "user", "--jq", ".login"],
        { timeoutMs: 12000, limit: 16000, signal: this.controller.signal },
      );
      const login = result.stdout.trim();
      return this.save(
        result.code === 0 && /^[a-zA-Z0-9-]{1,39}$/.test(login)
          ? {
              state: "connected",
              login,
              message: `Connected as ${login}. Credentials stay in GitHub CLI.`,
              checkedAt: new Date().toISOString(),
            }
          : {
              state: "signed-out",
              message:
                "GitHub could not verify your account. Sign in or check your network, then verify again.",
              checkedAt: new Date().toISOString(),
            },
      );
    } catch {
      return this.save({
        state: "error",
        message:
          "GitHub connection check failed. Check your network and GitHub CLI sign-in.",
      });
    } finally {
      this.busy = false;
    }
  }
  async connect() {
    const status = await this.verify();
    if (status.state === "connected" || status.state === "unavailable")
      return status;
    if (this.closing) throw new Error("Aether is closing.");
    const gh = await this.find("gh");
    if (!gh) return status;
    const cwd = path.join(this.store.directory, "github-login");
    await mkdir(cwd, { recursive: true, mode: 0o700 });
    const suffix =
      process.platform === "win32"
        ? "cmd"
        : process.platform === "darwin"
          ? "command"
          : "sh";
    const file = path.join(cwd, `signin-${randomUUID()}.${suffix}`);
    await writeFile(file, githubLoginScript(gh, cwd), { mode: 0o700 });
    await this.launch(file);
    return this.save({
      state: "awaiting-signin",
      message:
        "Complete GitHub's official browser sign-in from Terminal, then click Verify GitHub.",
    });
  }
  async repositories(): Promise<GitHubRepository[]> {
    if ((await this.verify()).state !== "connected")
      throw new Error("Verify your GitHub connection first.");
    const gh = await this.find("gh");
    if (!gh) throw new Error("GitHub CLI is unavailable.");
    const result = await this.run(
      gh,
      [
        "repo",
        "list",
        "--limit",
        "50",
        "--json",
        "nameWithOwner,url,isPrivate",
      ],
      { timeoutMs: 15000, limit: 100000, signal: this.controller.signal },
    );
    if (result.code)
      throw new Error(
        "Could not load repositories. Check your GitHub permissions and connection.",
      );
    return z
      .array(
        z.object({
          nameWithOwner: z.string().max(300),
          url: z.string().regex(/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/),
          isPrivate: z.boolean(),
        }),
      )
      .max(50)
      .parse(JSON.parse(result.stdout));
  }
}
