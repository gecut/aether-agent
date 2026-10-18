import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { execute } from "../core/process";
import { redact } from "../core/security";
import type { Invocation, ProviderResult } from "./registry";
const profile = `---
name: aether-text
description: Text-only Aether planning and conversation. No file, network or terminal tools.
tools: []
mainAgent: true
subagent: false
commandExecutionPolicy: off
mcpServers: []
skills: []
plugins: []
---
Respond using only the supplied text. No tools are permitted. Follow the requested output contract.
`;
export async function antigravityText(
  binary: string,
  input: Pick<
    Invocation,
    "prompt" | "systemPrompt" | "signal" | "timeoutMs" | "config" | "onOutput"
  >,
): Promise<ProviderResult> {
  const policy = new AbortController();
  let sawInit = false;
  const cwd = await mkdtemp(path.join(os.tmpdir(), "aether-agy-"));
  try {
    const agents = path.join(cwd, ".agents", "agents");
    await mkdir(agents, { recursive: true, mode: 0o700 });
    await writeFile(path.join(agents, "aether-text.md"), profile, {
      mode: 0o600,
    });
    let response = "",
      failure = "",
      usage: Record<string, number> | undefined;
    const result = await execute(
      binary,
      [
        "--agent",
        "aether-text",
        "--mode",
        "plan",
        "--sandbox",
        "--disable-slash-commands",
        "--output-format",
        "stream-json",
        "--print-timeout",
        `${Math.max(1, Math.ceil(input.timeoutMs / 1000))}s`,
        ...(input.config.model ? ["--model", input.config.model] : []),
        "-p",
        [input.systemPrompt, input.prompt].filter(Boolean).join("\n\n"),
      ],
      {
        cwd,
        signal: AbortSignal.any([input.signal, policy.signal]),
        timeoutMs: input.timeoutMs,
        limit: 2_000_000,
        onLine: (line) => {
          let e;
          try {
            e = JSON.parse(line);
          } catch {
            return;
          }
          if (e.event === "init") {
            sawInit = true;
            const tools = e.init?.tools;
            if (!Array.isArray(tools) || tools.length) {
              failure =
                "Antigravity did not honor the tool-free Aether profile. Update its CLI; this response cannot be used.";
              policy.abort();
            }
          }
          if (
            e.event === "step_update" &&
            e.step_update?.step_type === "tool"
          ) {
            failure =
              "Antigravity attempted a tool call in text-only mode. This response cannot be used.";
            policy.abort();
          }
          if (e.event === "result" || e.status) {
            const value = e.result ?? e;
            if (value.status === "SUCCESS") {
              response = String(value.response ?? "");
              usage = value.usage;
            } else
              failure = String(
                value.error ?? "Antigravity did not complete the request",
              );
          }
        },
        completeWhen: (line) => {
          try {
            const e = JSON.parse(line);
            return e.event === "result" || !!e.status;
          } catch {
            return false;
          }
        },
      },
    ).catch((error: unknown) => {
      if (failure) throw new Error(redact(failure));
      throw error;
    });
    if (failure || result.code || !response.trim() || !sawInit)
      throw new Error(
        redact(
          failure ||
            result.stderr ||
            (!sawInit
              ? "Antigravity did not confirm a tool-free agent profile"
              : "Antigravity returned no final response"),
        ),
      );
    input.onOutput(response);
    return { text: redact(response), usage };
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
