import { afterEach, describe, expect, it, vi } from "vitest";
import { runCodingTeam, updateTeam } from "../electron/providers/collaboration";
import {
  defaults,
  type CodingTeam,
  type CollaborationEvent,
} from "../shared/types";
import type {
  Invocation,
  ProviderResult,
} from "../electron/providers/registry";
const input = (maxHelpers = 2): Invocation => ({
  config: { ...defaults.coder, model: "selected-coder", reasoning: "high" },
  cwd: "/isolated/worktree",
  prompt: "OWNED FILES: value.js",
  systemPrompt: "Aether policy",
  team: { maxHelpers },
  mode: "code",
  signal: new AbortController().signal,
  timeoutMs: 10000,
  onOutput: vi.fn(),
  onCollaboration: vi.fn(),
  apiUrl: defaults.apiUrl,
});
afterEach(() => vi.restoreAllMocks());
describe("Aether managed coding team", () => {
  it("runs concurrent same-model read-only helpers between draft and integration", async () => {
    const invocation = input(3);
    let active = 0,
      peak = 0;
    const calls: Invocation[] = [];
    const result = await runCodingTeam(invocation, async (call) => {
      calls.push(call);
      expect(call.config).toBe(invocation.config);
      expect(call.cwd).toBe(invocation.cwd);
      expect(call.systemPrompt).toBe(invocation.systemPrompt);
      expect(call.team).toBeUndefined();
      expect(call.onCollaboration).toBeUndefined();
      expect(call.timeoutMs).toBeGreaterThan(0);
      expect(call.timeoutMs).toBeLessThanOrEqual(10000);
      if (call.mode === "review") {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return {
          text: `value.js: helper finding ${calls.indexOf(call)}`,
          usage: { input_tokens: 10, output_tokens: 2 },
        };
      }
      return {
        text: calls.length === 1 ? "Draft implemented" : "Integrated findings",
        sessionId: "lead-session",
        usage: { input_tokens: 20, output_tokens: 3 },
      };
    });
    expect(calls.map((call) => call.mode)).toEqual([
      "code",
      "review",
      "review",
      "review",
      "code",
    ]);
    expect(peak).toBe(3);
    expect(calls[1].prompt).toContain(
      "<untrusted_lead_result>\nDraft implemented",
    );
    for (let i = 1; i <= 3; i++)
      expect(calls.at(-1)!.prompt).toContain(`value.js: helper finding ${i}`);
    expect(calls.at(-1)!.prompt).toContain("<untrusted_helper_findings>");
    expect(result).toEqual({
      text: "Integrated findings",
      sessionId: "lead-session",
      usage: { input_tokens: 70, output_tokens: 12 },
    });
    const events = vi
      .mocked(invocation.onCollaboration!)
      .mock.calls.map(([event]) => event);
    expect(events.filter((event) => event.tool === "delegate")).toHaveLength(3);
    expect(events.filter((event) => event.tool === "handoff")).toHaveLength(3);
    expect(new Set(events.map((event) => event.id)).size).toBe(9);
    expect(calls.every((call) => call.signal.aborted)).toBe(true);
  });
  it("redacts and bounds findings before relaying and persisting them", async () => {
    const invocation = input(1),
      calls: Invocation[] = [];
    await runCodingTeam(invocation, async (call) => {
      calls.push(call);
      return { text: "token=private-secret " + "x".repeat(10000) };
    });
    expect(calls[1].prompt).not.toContain("private-secret");
    expect(calls[2].prompt).not.toContain("private-secret");
    const result = vi
      .mocked(invocation.onCollaboration!)
      .mock.calls.find(([event]) => event.tool === "helper_result")![0];
    expect(result.agents[0].message).toHaveLength(2000);
    expect(result.agents[0].message).toContain("[REDACTED]");
    const relayed = calls[2].prompt
      .split("Helper 1:\n")[1]
      .split("\n</untrusted_helper_findings>")[0];
    expect(relayed).toHaveLength(3000);
  });
  it("fails the whole team and awaits sibling cancellation before returning", async () => {
    const invocation = input(2);
    let reviews = 0,
      siblingSettled = false,
      integration = false;
    const run = runCodingTeam(invocation, async (call) => {
      if (call.mode === "code") {
        if (reviews) integration = true;
        return { text: "Draft" };
      }
      reviews++;
      if (reviews === 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        throw new Error("Helper provider failed");
      }
      await new Promise<void>((_resolve, reject) => {
        call.signal.addEventListener(
          "abort",
          () =>
            setTimeout(() => {
              siblingSettled = true;
              reject(new Error("Sibling cancelled"));
            }, 5),
          { once: true },
        );
      });
      return { text: "unreachable" };
    });
    await expect(run).rejects.toThrow("Helper provider failed");
    expect(siblingSettled).toBe(true);
    expect(integration).toBe(false);
    expect(
      vi
        .mocked(invocation.onCollaboration!)
        .mock.calls.filter(([event]) => event.status === "errored"),
    ).toHaveLength(2);
  });
  it("propagates user cancellation to every active helper", async () => {
    const invocation = input(2),
      controller = new AbortController();
    invocation.signal = controller.signal;
    let reviews = 0;
    const run = runCodingTeam(invocation, async (call) => {
      if (call.mode === "code") return { text: "Draft" };
      reviews++;
      return new Promise<ProviderResult>((_resolve, reject) => {
        call.signal.addEventListener(
          "abort",
          () => reject(new Error("Cancelled")),
          { once: true },
        );
        if (reviews === 2) controller.abort();
      });
    });
    await expect(run).rejects.toThrow("Cancelled");
    expect(reviews).toBe(2);
  });
  it("uses one total deadline instead of resetting it for each session", async () => {
    const invocation = input(1);
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const calls: Invocation[] = [];
    await expect(
      runCodingTeam(invocation, async (call) => {
        calls.push(call);
        now += 6000;
        return { text: "Done" };
      }),
    ).rejects.toThrow("Coding team timed out");
    expect(calls.map((call) => call.timeoutMs)).toEqual([10000, 4000]);
    expect(calls.map((call) => call.mode)).toEqual(["code", "review"]);
  });
  it("fails on persistence callback errors instead of accepting draft output", async () => {
    const invocation = input(1);
    invocation.onCollaboration = () => {
      throw new Error("Cannot persist team evidence");
    };
    const single = vi.fn(async () => ({ text: "Draft" }));
    await expect(runCodingTeam(invocation, single)).rejects.toThrow(
      "Cannot persist team evidence",
    );
    expect(single).toHaveBeenCalledTimes(1);
  });
  it.each([0, 4, 1.5, Number.NaN])(
    "refuses invalid helper cap %s without starting provider",
    async (maxHelpers) => {
      const single = vi.fn();
      await expect(runCodingTeam(input(maxHelpers), single)).rejects.toThrow(
        "helper limit must be 1–3",
      );
      expect(single).not.toHaveBeenCalled();
    },
  );
  it("keeps bounded evidence and updates real helper lifecycle", () => {
    const team: CodingTeam = {
      protocol: "aether-managed-v1",
      maxHelpers: 1,
      members: [],
      events: [],
    };
    const event = (status: string, id: string): CollaborationEvent => ({
      id,
      tool: "helper_result",
      status,
      senderId: "lead",
      receiverIds: ["helper"],
      agents: [{ id: "helper", status, message: "Result" }],
      at: new Date().toISOString(),
    });
    updateTeam(team, event("running", "start"));
    expect(team.members[0].closed).toBe(false);
    updateTeam(team, event("completed", "done"));
    expect(team.members[0]).toMatchObject({
      status: "completed",
      closed: true,
    });
    for (let i = 0; i < 50; i++)
      updateTeam(team, event("completed", String(i)));
    expect(team.events).toHaveLength(40);
    expect(team.events.at(-1)?.id).toBe("49");
    expect(team.members).toHaveLength(1);
  });
});
