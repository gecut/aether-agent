import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import {
  CLIProvider,
  CompatibleProvider,
} from "../electron/providers/registry";
import { defaults } from "../shared/types";
let directory: string;
let originalPath: string | undefined;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aether-adapter-"));
  originalPath = process.env.PATH;
  process.env.PATH = directory + path.delimiter + originalPath;
});
afterEach(async () => {
  process.env.PATH = originalPath;
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});
async function fakeCodex(body: string) {
  await writeFile(
    path.join(directory, "codex"),
    `#!${process.execPath}\n${body}`,
    { mode: 0o700 },
  );
}
const invocation = () => ({
  config: defaults.coder,
  cwd: directory,
  prompt: "test",
  mode: "code" as const,
  signal: new AbortController().signal,
  timeoutMs: 10000,
  onOutput: vi.fn(),
  apiUrl: defaults.apiUrl,
});
describe("CLI provider contract", () => {
  it("runs draft, read-only review and integration as separate same-model CLI sessions", async () => {
    await fakeCodex(`const fs=require('node:fs');let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{
      fs.appendFileSync('sessions.jsonl',JSON.stringify({args:process.argv.slice(2),input})+'\\n');
      const text=input.includes('[AETHER REVIEW HELPER')?'value.js: check edge cases':'Implemented and integrated';
      console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text}}));
      console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:10,output_tokens:2}}));
    });`);
    const onCollaboration = vi.fn();
    const result = await new CLIProvider("codex").run({
      ...invocation(),
      config: { ...defaults.coder, model: "selected-coder", reasoning: "high" },
      team: { maxHelpers: 1 },
      onCollaboration,
    });
    const sessions = (
      await readFile(path.join(directory, "sessions.jsonl"), "utf8")
    )
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(sessions).toHaveLength(3);
    expect(
      sessions.map(
        (session) => session.args[session.args.indexOf("--sandbox") + 1],
      ),
    ).toEqual(["workspace-write", "read-only", "workspace-write"]);
    for (const session of sessions) {
      expect(
        session.args.slice(
          session.args.indexOf("--model"),
          session.args.indexOf("--model") + 2,
        ),
      ).toEqual(["--model", "selected-coder"]);
      expect(session.args).toEqual(
        expect.arrayContaining([
          'model_reasoning_effort="high"',
          'approval_policy="never"',
          "sandbox_workspace_write.network_access=false",
          'shell_environment_policy.inherit="none"',
          "features.multi_agent=false",
          "agents.enabled=false",
        ]),
      );
      expect(session.args[session.args.indexOf("multi_agent") - 1]).toBe(
        "--disable",
      );
      expect(session.args[session.args.indexOf("multi_agent_v2") - 1]).toBe(
        "--disable",
      );
    }
    expect(sessions[2].input).toContain("value.js: check edge cases");
    expect(onCollaboration.mock.calls.map((call) => call[0].tool)).toEqual([
      "delegate",
      "helper_result",
      "handoff",
    ]);
    expect(result.usage).toEqual({ input_tokens: 30, output_tokens: 6 });
  });
  it.each(["plan", "review"] as const)(
    "does not start team sessions in %s mode",
    async (mode) => {
      await fakeCodex(
        `process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(process.argv.slice(2))}}));});`,
      );
      const onCollaboration = vi.fn();
      const result = await new CLIProvider("codex").run({
        ...invocation(),
        mode,
        team: { maxHelpers: 2 },
        onCollaboration,
      });
      const args = JSON.parse(result.text);
      expect(args).toContain("read-only");
      expect(args).toContain("features.multi_agent=false");
      expect(onCollaboration).not.toHaveBeenCalled();
    },
  );
  it("passes user-selected images only as Codex image attachments", async () => {
    await fakeCodex(
      `process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(process.argv.slice(2))}}));});`,
    );
    const result = await new CLIProvider("codex").run({
      ...invocation(),
      mode: "plan",
      images: ["/private/aether/prompt-images/reference.png"],
    });
    const args = JSON.parse(result.text);
    expect(args).toEqual(
      expect.arrayContaining([
        "--image",
        "/private/aether/prompt-images/reference.png",
      ]),
    );
  });
  it("cleans up a CLI that stays alive after its successful terminal event", async () => {
    await fakeCodex(
      `process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Finished'}}));console.log(JSON.stringify({type:'turn.completed'}));setInterval(()=>{},10000);});`,
    );
    const result = await new CLIProvider("codex").run({
      ...invocation(),
      timeoutMs: 10000,
    });
    expect(result.text).toBe("Finished");
  });
  it("streams real subprocess events and returns final message plus usage", async () => {
    await fakeCodex(
      `let input='';process.stdin.on('data',d=>input+=d);process.stdin.on('end',()=>{if(input !== 'Nexload system policy\\n\\ntest') throw new Error('System preface was not preserved');console.log(JSON.stringify({type:'thread.started',thread_id:'session-1'}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Verified result'}}));console.log(JSON.stringify({type:'turn.completed',usage:{input_tokens:42}}));});`,
    );
    const input = { ...invocation(), systemPrompt: "Nexload system policy" };
    const result = await new CLIProvider("codex").run(input);
    expect(result.text).toBe("Verified result");
    expect(result.sessionId).toBe("session-1");
    expect(result.usage?.input_tokens).toBe(42);
    expect(input.onOutput).toHaveBeenCalled();
  });
  it("uses sandbox and disables inherited integrations without shell interpolation", async () => {
    await fakeCodex(
      `process.stdin.resume();process.stdin.on('end',()=>{console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:JSON.stringify(process.argv.slice(2))}}));});`,
    );
    const result = await new CLIProvider("codex").run(invocation());
    const args = JSON.parse(result.text);
    expect(args).toContain("workspace-write");
    expect(args).toContain("--ignore-user-config");
    expect(args).toContain("plugins");
    expect(args).toContain("apps");
    expect(args).toContain("hooks");
    expect(args).toContain('shell_environment_policy.inherit="none"');
    expect(args).toContain(
      'shell_environment_policy.set={PATH="/usr/bin:/bin:/usr/sbin:/sbin"}',
    );
    expect(args).not.toContain("--dangerously-bypass-approvals-and-sandbox");
  });
  it("surfaces nonzero exit and structured turn failures", async () => {
    await fakeCodex(
      `console.log(JSON.stringify({type:'turn.failed',error:{message:'Account unavailable'}}));process.exitCode=1;`,
    );
    await expect(new CLIProvider("codex").run(invocation())).rejects.toThrow(
      "Account unavailable",
    );
  });
  it("refuses unsafe or unverified coding integrations", async () => {
    await expect(new CLIProvider("claude").run(invocation())).rejects.toThrow(
      "disabled",
    );
    await expect(
      new CLIProvider("antigravity").run(invocation()),
    ).rejects.toThrow("unverified");
  });
});
describe("compatible API contract", () => {
  it("streams SSE across split chunks, lists models, and does not pretend to have file tools", async () => {
    let posted: { messages: { role: string; content: string }[] } | undefined;
    const server = createServer(async (request, response) => {
      if (request.url === "/v1/models") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ data: [{ id: "local-model" }] }));
        return;
      }
      let body = "";
      for await (const chunk of request) body += chunk.toString();
      posted = JSON.parse(body);
      response.setHeader("Content-Type", "text/event-stream");
      response.write('data: {"choices":[{"delta":{"con');
      setTimeout(() => {
        response.write(
          'tent":"Hello"}}]}\n\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        );
        response.end("data: [DONE]\n\n");
      }, 5);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address() as { port: number };
    const settings = {
      ...defaults,
      apiUrl: `http://127.0.0.1:${address.port}/v1`,
    };
    const provider = new CompatibleProvider(
      () => settings,
      () => undefined,
    );
    try {
      const diagnostic = await provider.diagnose();
      expect(diagnostic.models).toEqual(["local-model"]);
      expect(diagnostic.capabilities.coding).toBe(false);
      const result = await provider.run({
        ...invocation(),
        mode: "plan",
        systemPrompt: "Nexload system policy",
        apiUrl: settings.apiUrl,
        config: {
          ...defaults.planner,
          provider: "compatible",
          model: "local-model",
        },
      });
      expect(result.text).toBe("Hello world");
      expect(posted?.messages).toEqual([
        { role: "system", content: "Nexload system policy" },
        { role: "user", content: "test" },
      ]);
      await expect(provider.run(invocation())).rejects.toThrow("coding tools");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
