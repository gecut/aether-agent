import { runCodingTeam } from "./collaboration";
import { findBinary } from "./runtime";
import { runtimePath } from "../core/environment";
import { antigravityText } from "./antigravity";
import { execute } from "../core/process";
import { redact } from "../core/security";
import type {
  CollaborationEvent,
  ModelConfig,
  ProviderId,
  ProviderInfo,
  Settings,
} from "../../shared/types";
export interface Invocation {
  config: ModelConfig;
  cwd: string;
  prompt: string;
  systemPrompt?: string;
  team?: { maxHelpers: number };
  onCollaboration?: (event: CollaborationEvent) => void;
  mode: "plan" | "code" | "review";
  signal: AbortSignal;
  timeoutMs: number;
  onOutput: (text: string) => void;
  apiUrl: string;
  apiKey?: string;
  /** Private, user-selected image paths for providers that support image input. */
  images?: string[];
}
export interface ProviderResult {
  text: string;
  sessionId?: string;
  usage?: Record<string, number>;
}
export interface Provider {
  id: ProviderId;
  diagnose(signal?: AbortSignal): Promise<ProviderInfo>;
  run(input: Invocation): Promise<ProviderResult>;
}
const names = {
  codex: "OpenAI Codex",
  claude: "Claude Code",
  antigravity: "Antigravity",
  compatible: "Compatible API",
};
const transientStreamFailure = (message: string) =>
  /stream disconnected|connection reset|econnreset|socket hang up|network error/i.test(
    message,
  );
const waitForReconnect = (signal: AbortSignal, milliseconds: number) =>
  new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds);
    const cancelled = () => {
      clearTimeout(timer);
      reject(new Error("Execution cancelled"));
    };
    signal.addEventListener("abort", cancelled, { once: true });
  });
export class CLIProvider implements Provider {
  constructor(public id: "codex" | "claude" | "antigravity") {}
  async diagnose(signal?: AbortSignal, probe = true): Promise<ProviderInfo> {
    const binary = await findBinary(
      this.id === "antigravity" ? "agy" : this.id,
    );
    const base: ProviderInfo = {
      id: this.id,
      name: names[this.id],
      kind: binary ? "supported-cli" : "unavailable",
      installed: !!binary,
      authenticated: null,
      detail: binary
        ? "Installed; run a task to verify account and model access."
        : `Install ${this.id === "antigravity" ? "agy" : this.id} using official setup instructions.`,
      models: [""],
      capabilities: {
        planning: true,
        coding: this.id === "codex",
        streaming: true,
        cancellation: true,
      },
      verified: false,
    };
    if (!binary || !probe) return base;
    try {
      const version = await execute(binary, ["--version"], {
        timeoutMs: 4000,
        signal,
      });
      base.version = version.stdout.trim().slice(0, 120);
      if (this.id === "codex") {
        const auth = await execute(binary, ["login", "status"], {
          timeoutMs: 4000,
          signal,
        });
        base.authenticated = auth.code === 0;
        base.detail =
          redact((auth.stdout + auth.stderr).trim()) + " · CLI sandbox enabled";
      } else if (this.id === "antigravity") {
        base.detail =
          "Text-only chat, planning and review using a tool-free agent in an empty temporary workspace. Sign in with Google to enable account access. Coding uses Codex.";
      } else
        base.detail =
          "CLI installed. Read-only planning/review available; coding disabled until filesystem sandbox compatibility is verified.";
    } catch (error) {
      base.detail = String(error);
    }
    return base;
  }
  async run(input: Invocation): Promise<ProviderResult> {
    if (this.id === "antigravity") {
      if (input.mode === "code")
        throw new Error(
          "Antigravity supports text-only planning/review here. Choose Codex for sandboxed coding.",
        );
      const binary = await findBinary("agy");
      if (!binary)
        throw new Error("Set up Antigravity in Settings before using it.");
      return antigravityText(binary, input);
    }
    if (this.id === "claude" && input.mode === "code")
      throw new Error(
        "Claude coding is disabled until a strong local sandbox is configured. Use Codex for implementation.",
      );
    const binary = await findBinary(this.id);
    if (!binary) throw new Error(`${names[this.id]} is not installed`);
    if (this.id === "codex" && input.mode === "code" && input.team)
      return runCodingTeam(input, (single) => this.run(single));
    let args: string[];
    if (this.id === "codex") {
      args = [
        "exec",
        "--ignore-user-config",
        "--disable",
        "apps",
        "--disable",
        "plugins",
        "--disable",
        "hooks",
        "--disable",
        "browser_use",
        "--disable",
        "computer_use",
        "--disable",
        "image_generation",
        "--disable",
        "multi_agent",
        "--disable",
        "multi_agent_v2",
        "--json",
        "--color",
        "never",
        "--sandbox",
        input.mode === "code" ? "workspace-write" : "read-only",
        "--skip-git-repo-check",
        "--ephemeral",
        "-c",
        'approval_policy="never"',
        "-c",
        "sandbox_workspace_write.network_access=false",
        "-c",
        'shell_environment_policy.inherit="none"',
        "-c",
        `shell_environment_policy.set={PATH=${JSON.stringify(runtimePath())}}`,
        "-c",
        "mcp_servers={}",
        "-c",
        "features.multi_agent=false",
        "-c",
        "agents.enabled=false",
        "-c",
        `model_reasoning_effort="${input.config.reasoning}"`,
      ];
      if (input.config.model) args.push("--model", input.config.model);
      for (const image of input.images ?? []) args.push("--image", image);
      args.push("-");
    } else {
      args = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--tools",
        "",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--permission-mode",
        "plan",
      ];
      if (input.config.model) args.push("--model", input.config.model);
    }
    let text = "",
      sessionId: string | undefined,
      usage: Record<string, number> | undefined,
      errorMessage = "";
    let result;
    for (let attempt = 1; ; attempt++) {
      result = await execute(binary, args, {
        cwd: input.cwd,
        input: input.systemPrompt
          ? input.systemPrompt + "\n\n" + input.prompt
          : input.prompt,
        signal: input.signal,
        timeoutMs: input.timeoutMs,
        completeWhen: (line) => {
          try {
            const event = JSON.parse(line);
            return (
              event.type === "turn.completed" ||
              (this.id === "claude" &&
                event.type === "result" &&
                !event.is_error)
            );
          } catch {
            return false;
          }
        },
        onLine: (line, stream) => {
          if (stream === "stderr") {
            input.onOutput(line);
            return;
          }
          try {
            const event = JSON.parse(line);
            if (event.type === "thread.started") sessionId = event.thread_id;
            if (event.type === "error" || event.type === "turn.failed")
              errorMessage =
                event.message ?? event.error?.message ?? JSON.stringify(event);
            if (
              event.item?.type === "agent_message" &&
              event.type === "item.completed"
            )
              text = event.item.text;
            if (event.type === "turn.completed") usage = event.usage;
            if (this.id === "claude" && event.type === "result") {
              text = event.result ?? "";
              if (event.is_error) errorMessage = text;
            }
            const message =
              event.item?.text ??
              event.item?.aggregated_output ??
              event.item?.command ??
              event.event?.delta?.text ??
              (event.type === "result" ? event.result : undefined);
            input.onOutput(message ? `${event.type}: ${message}` : line);
          } catch (error) {
            if (!(error instanceof SyntaxError))
              errorMessage =
                error instanceof Error ? error.message : String(error);
            input.onOutput(line);
          }
        },
      });
      const failure = errorMessage || result.stderr;
      if (
        (result.code !== 0 || errorMessage) &&
        attempt < 3 &&
        transientStreamFailure(failure)
      ) {
        input.onOutput(
          `Reconnecting… ${attempt}/2 after a temporary provider stream interruption.`,
        );
        text = "";
        sessionId = undefined;
        usage = undefined;
        errorMessage = "";
        await waitForReconnect(input.signal, attempt * 500);
        continue;
      }
      break;
    }
    if (result.code !== 0 || errorMessage)
      throw new Error(
        redact(
          errorMessage ||
            result.stderr.slice(-4000) ||
            `Provider exited ${result.code}`,
        ),
      );
    if (!text.trim())
      throw new Error("Provider exited without a final response");
    return { text, sessionId, usage };
  }
}
export class CompatibleProvider implements Provider {
  id = "compatible" as const;
  constructor(
    private settings: () => Settings,
    private key: () => string | undefined,
  ) {}
  async diagnose(signal?: AbortSignal): Promise<ProviderInfo> {
    let models: string[] = [];
    let detail =
      "OpenAI-compatible chat API. Planning and review only; no file tools.";
    let connected = false;
    try {
      const response = await fetch(
        this.settings().apiUrl.replace(/\/$/, "") + "/models",
        {
          headers: this.key() ? { Authorization: "Bearer " + this.key() } : {},
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(4000)])
            : AbortSignal.timeout(4000),
        },
      );
      if (response.ok) {
        const body = (await response.json()) as { data?: { id: string }[] };
        models = (body.data ?? []).map((m) => m.id);
        connected = true;
      } else detail += ` HTTP ${response.status}.`;
    } catch {
      detail += " Endpoint unreachable.";
    }
    return {
      id: this.id,
      name: names[this.id],
      kind: "native-api",
      installed: connected,
      authenticated: connected,
      detail,
      models,
      capabilities: {
        planning: true,
        coding: false,
        streaming: true,
        cancellation: true,
      },
      verified: false,
    };
  }
  async run(input: Invocation): Promise<ProviderResult> {
    if (input.mode === "code")
      throw new Error(
        "Compatible API does not have coding tools. Select Codex as coding runtime.",
      );
    if (!input.config.model)
      throw new Error("Set a compatible API model ID in provider settings");
    const signal = AbortSignal.any([
      input.signal,
      AbortSignal.timeout(input.timeoutMs),
    ]);
    const response = await fetch(
      input.apiUrl.replace(/\/$/, "") + "/chat/completions",
      {
        method: "POST",
        signal,
        headers: {
          "Content-Type": "application/json",
          ...(input.apiKey ? { Authorization: "Bearer " + input.apiKey } : {}),
        },
        body: JSON.stringify({
          model: input.config.model,
          messages: [
            ...(input.systemPrompt
              ? [{ role: "system", content: input.systemPrompt }]
              : []),
            { role: "user", content: input.prompt },
          ],
          stream: true,
        }),
      },
    );
    if (!response.ok || !response.body)
      throw new Error(`Compatible API returned HTTP ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "",
      text = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.length > 100000)
          throw new Error("API stream frame exceeds limit");
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end).trim();
          buffer = buffer.slice(end + 1);
          if (!line.startsWith("data:") || line === "data: [DONE]") continue;
          const body = JSON.parse(line.slice(5));
          if (body.error)
            throw new Error(body.error.message ?? "API stream failed");
          const delta = body.choices?.[0]?.delta?.content;
          if (delta) {
            text += delta;
            input.onOutput(redact(delta));
            if (text.length > 1000000)
              throw new Error("API response exceeds limit");
          }
        }
      }
    } finally {
      await reader.cancel();
    }
    if (!text) throw new Error("Empty compatible API response");
    return { text: redact(text) };
  }
}
export class Registry {
  private providers: Map<ProviderId, Provider>;
  constructor(settings: () => Settings, key: () => string | undefined) {
    this.providers = new Map<ProviderId, Provider>([
      ...(["codex", "claude", "antigravity"] as const).map(
        (id) => [id, new CLIProvider(id)] as [ProviderId, Provider],
      ),
      ["compatible", new CompatibleProvider(settings, key)],
    ]);
  }
  get(id: ProviderId) {
    return this.providers.get(id)!;
  }
  async detect(): Promise<ProviderInfo[]> {
    const cli = await Promise.all(
      (["codex", "claude", "antigravity"] as const).map((id) =>
        (this.get(id) as CLIProvider).diagnose(undefined, false),
      ),
    );
    return [
      ...cli,
      {
        id: "compatible",
        name: "Compatible API",
        kind: "native-api",
        installed: false,
        authenticated: null,
        verified: false,
        detail: "Checking configured API endpoint in the background.",
        models: [],
        capabilities: {
          planning: true,
          coding: false,
          streaming: true,
          cancellation: true,
        },
      },
    ];
  }
  private checking?: Promise<ProviderInfo[]>;
  private diagnosticsAbort = new AbortController();
  shutdown() {
    this.diagnosticsAbort.abort();
  }
  diagnostics() {
    if (this.checking) return this.checking;
    this.checking = Promise.all(
      [...this.providers.values()].map((p) =>
        p.diagnose(this.diagnosticsAbort.signal),
      ),
    ).finally(() => {
      this.checking = undefined;
    });
    return this.checking;
  }
}
