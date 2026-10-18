import { afterEach, expect, it, vi } from "vitest";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { antigravityText } from "../electron/providers/antigravity";
import * as processes from "../electron/core/process";
import { defaults } from "../shared/types";
afterEach(() => vi.restoreAllMocks());
const input = () => ({
  prompt: "hello",
  systemPrompt: "Reply in English",
  signal: new AbortController().signal,
  timeoutMs: 3000,
  config: defaults.planner,
  onOutput: vi.fn(),
});
it("uses a disposable tool-free profile and requires runtime attestation", async () => {
  let workspace = "";
  vi.spyOn(processes, "execute").mockImplementation(
    async (_binary, args, options = {}) => {
      workspace = options.cwd!;
      expect(args).toContain("--sandbox");
      expect(args).toContain("aether-text");
      const profile = await readFile(
        path.join(workspace, ".agents/agents/aether-text.md"),
        "utf8",
      );
      expect(profile).toContain("tools: []");
      expect(profile).toContain("commandExecutionPolicy: off");
      options.onLine?.(
        JSON.stringify({ event: "init", init: { tools: [] } }),
        "stdout",
      );
      options.onLine?.(
        JSON.stringify({
          event: "result",
          result: { status: "SUCCESS", response: "hello" },
        }),
        "stdout",
      );
      return { code: 0, stdout: "", stderr: "", durationMs: 1 };
    },
  );
  const request = input();
  expect((await antigravityText("agy", request)).text).toBe("hello");
  expect(request.onOutput).toHaveBeenCalledWith("hello");
  await expect(access(workspace)).rejects.toThrow();
});
it.each([
  { event: "init", init: { tools: ["terminal"] } },
  { event: "step_update", step_update: { step_type: "tool" } },
])(
  "cancels and rejects a runtime that advertises or attempts tools: %j",
  async (event) => {
    vi.spyOn(processes, "execute").mockImplementation(
      async (_binary, _args, options = {}) => {
        options.onLine?.(JSON.stringify(event), "stdout");
        expect(options.signal?.aborted).toBe(true);
        throw new Error("Execution cancelled");
      },
    );
    const request = input();
    await expect(antigravityText("agy", request)).rejects.toThrow(/tool/);
    expect(request.onOutput).not.toHaveBeenCalled();
  },
);
it("rejects successful text without tool-free initialization evidence", async () => {
  vi.spyOn(processes, "execute").mockImplementation(
    async (_binary, _args, options = {}) => {
      options.onLine?.(
        JSON.stringify({ status: "SUCCESS", response: "hello" }),
        "stdout",
      );
      return { code: 0, stdout: "", stderr: "", durationMs: 1 };
    },
  );
  await expect(antigravityText("agy", input())).rejects.toThrow(
    /confirm a tool-free/,
  );
});
