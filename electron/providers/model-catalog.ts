import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";
import { findBinary } from "./runtime";
import { execute } from "../core/process";
import { redact, safeEnv } from "../core/security";
import type { ModelCatalog, ModelOption, ProviderId } from "../../shared/types";

const codexPage = z.object({
  data: z
    .array(
      z.object({
        id: z.string().max(100),
        model: z.string().max(100).optional(),
        displayName: z.string().max(200).optional(),
        description: z.string().max(2000).optional(),
        isDefault: z.boolean().optional(),
        defaultReasoningEffort: z.string().optional(),
        supportedReasoningEfforts: z
          .array(z.object({ reasoningEffort: z.string() }))
          .optional(),
      }),
    )
    .max(1000),
  nextCursor: z.string().nullable().optional(),
});

export function codexModels(
  binary: string,
  cwd: string,
): Promise<ModelOption[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      binary,
      [
        "--disable",
        "apps",
        "--disable",
        "plugins",
        "--disable",
        "hooks",
        "app-server",
        "--listen",
        "stdio://",
        "-c",
        "mcp_servers={}",
      ],
      { cwd, env: safeEnv(), shell: false, stdio: ["pipe", "pipe", "pipe"] },
    );
    const lines = createInterface({ input: child.stdout });
    let completed = false,
      bytes = 0;
    const models: ModelOption[] = [];
    const finish = (error?: Error) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      lines.close();
      child.stdin.end();
      child.kill("SIGTERM");
      const kill = setTimeout(() => child.kill("SIGKILL"), 1500);
      kill.unref();
      child.once("exit", () => clearTimeout(kill));
      if (error) reject(error);
      else resolve(models);
    };
    const send = (value: unknown) =>
      child.stdin.write(JSON.stringify(value) + "\n");
    const timer = setTimeout(
      () => finish(new Error("Codex model discovery timed out")),
      15000,
    );
    child.on("error", finish);
    child.on("exit", () => {
      if (!completed)
        finish(
          new Error("Codex model discovery closed before returning a catalog"),
        );
    });
    child.stderr.on("data", (data: Buffer) => {
      bytes += data.length;
      if (bytes > 2_000_000) finish(new Error("Model catalog exceeds limits"));
    });
    child.stdin.on("error", () => {});
    lines.on("line", (line) => {
      bytes += Buffer.byteLength(line);
      if (bytes > 2_000_000)
        return finish(new Error("Model catalog exceeds limits"));
      try {
        const message = JSON.parse(line);
        if (message.error && message.id)
          return finish(
            new Error(
              String(message.error.message ?? "Model discovery failed"),
            ),
          );
        if (message.id === 1) {
          send({ method: "initialized" });
          send({
            method: "model/list",
            id: 2,
            params: { limit: 100, includeHidden: false },
          });
        }
        if (message.id === 2) {
          const page = codexPage.parse(message.result);
          models.push(
            ...page.data.map((model) => ({
              provider: "codex" as const,
              id: model.model ?? model.id,
              name: model.displayName ?? model.model ?? model.id,
              description:
                model.description ?? "From the installed Codex runtime",
              source: "runtime" as const,
              reasoning:
                model.supportedReasoningEfforts?.map(
                  (value) => value.reasoningEffort,
                ) ?? [],
              defaultReasoning: model.defaultReasoningEffort,
              isDefault: model.isDefault,
            })),
          );
          if (page.nextCursor && models.length < 1000)
            send({
              method: "model/list",
              id: 2,
              params: {
                limit: 100,
                includeHidden: false,
                cursor: page.nextCursor,
              },
            });
          else finish();
        }
      } catch (error) {
        finish(error instanceof Error ? error : new Error(String(error)));
      }
    });
    send({
      method: "initialize",
      id: 1,
      params: {
        clientInfo: { name: "aether-model-catalog", version: "1.0.0" },
        capabilities: { experimentalApi: false },
      },
    });
  });
}

export class ModelDiscovery {
  private cache = new Map<ProviderId, { at: number; catalog: ModelCatalog }>();
  private pending = new Map<ProviderId, Promise<ModelCatalog>>();
  constructor(
    private cwd: string,
    private apiModels: () => Promise<string[]>,
  ) {}
  async list(provider: ProviderId, refresh = false): Promise<ModelCatalog> {
    const cached = this.cache.get(provider);
    if (!refresh && cached && Date.now() - cached.at < 300000)
      return cached.catalog;
    const pending = this.pending.get(provider);
    if (pending) return pending;
    const promise = this.discover(provider);
    this.pending.set(provider, promise);
    try {
      const catalog = await promise;
      this.cache.set(provider, { at: Date.now(), catalog });
      return catalog;
    } finally {
      this.pending.delete(provider);
    }
  }
  private async discover(provider: ProviderId): Promise<ModelCatalog> {
    const catalog: ModelCatalog = {
      provider,
      models: [],
      checkedAt: new Date().toISOString(),
      note: "Catalog entries do not guarantee account access. Access is checked when used.",
    };
    try {
      if (provider === "compatible")
        catalog.models = z
          .array(z.string().min(1).max(100))
          .max(1000)
          .parse(await this.apiModels())
          .map((id) => ({
            provider,
            id,
            name: id,
            description: "Reported by the configured API",
            source: "runtime",
            reasoning: [],
          }));
      else {
        const binary = await findBinary(
          provider === "antigravity" ? "agy" : provider,
        );
        if (provider === "claude") {
          catalog.models = ["sonnet", "opus", "haiku", "fable", "best"].map(
            (id) => ({
              provider,
              id,
              name: id[0].toUpperCase() + id.slice(1),
              description:
                "Official Claude Code alias; resolved by your installed runtime and account",
              source: "published",
              reasoning: [],
            }),
          );
          if (!binary)
            catalog.error =
              "Official aliases only. Install and connect Claude Code to use them.";
        } else if (!binary)
          throw new Error(
            "Install and connect this provider to discover its models",
          );
        else if (provider === "codex")
          catalog.models = await codexModels(binary, this.cwd);
        else if (provider === "antigravity") {
          const result = await execute(binary, ["models"], {
            cwd: this.cwd,
            timeoutMs: 10000,
            limit: 200000,
          });
          if (result.code)
            throw new Error(
              "Antigravity could not return its model catalog. Check connection eligibility.",
            );
          catalog.models = result.stdout
            .split("\n")
            .flatMap((line) => {
              const id = line.match(/^([\w.-]+)\t/)?.[1];
              return id
                ? [
                    {
                      provider,
                      id,
                      name: id,
                      description: line.slice(id.length).trim().slice(0, 500),
                      source: "runtime" as const,
                      reasoning: [],
                    },
                  ]
                : [];
            })
            .slice(0, 1000);
          if (!catalog.models.length)
            catalog.error =
              "The runtime returned no model IDs. Verify its connection in Settings.";
        }
      }
    } catch (error) {
      catalog.error =
        error instanceof z.ZodError
          ? "The provider returned an unsupported model catalog. Refresh or enter an exact model ID."
          : redact(String(error).replace(/^Error: /, ""));
    }
    return catalog;
  }
}
