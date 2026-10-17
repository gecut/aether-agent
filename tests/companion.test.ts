import { expect, it } from "vitest";
import { defaults, type Run, type RunEvent } from "../shared/types";
import { companionState } from "../src/companion/state";
import { BotEngine } from "../src/vendor/bloub/engine";
import { EXPRESSION_BY_ID } from "../src/vendor/bloub/expressions";
const run = (status: Run["status"], id = "session"): Run => ({
  id,
  projectId: "project",
  title: "Fixture",
  objective: "Fixture",
  tasks: [],
  createdAt: "2026-10-17",
  updatedAt: "2026-10-17",
  status,
  config: defaults,
});
const event = (type: string, text = "", runId = "session"): RunEvent => ({
  seq: 1,
  runId,
  type,
  text,
  at: "now",
});
it("maps real lifecycle states to distinct companion expressions and messages", () => {
  const moods = {
    initializing: "planning",
    running: "working",
    awaiting_approval: "question",
    awaiting_review: "question",
    blocked: "blocked",
    failed: "error",
    cancelled: "resting",
    completed: "done",
  } as const;
  for (const [status, mood] of Object.entries(moods))
    expect(
      companionState([run(status as Run["status"])], "session", []).mood,
    ).toBe(mood);
  expect(companionState([], "", []).mood).toBe("idle");
});
it("uses trusted lifecycle phases, not arbitrary questions inside model output", () => {
  const current = run("running");
  expect(
    companionState([current], current.id, [
      event("agent.output", "Can you approve everything?"),
    ]).mood,
  ).toBe("working");
  expect(
    companionState([current], current.id, [event("test.started")]).mood,
  ).toBe("testing");
  expect(
    companionState([current], current.id, [
      event("test.started"),
      event("test.completed"),
    ]).mood,
  ).toBe("working");
  expect(
    companionState([current], current.id, [
      event("agent.started", "codex · default · review"),
    ]).mood,
  ).toBe("reviewing");
  expect(
    companionState([current], current.id, [
      event("test.started", "", "another"),
    ]).mood,
  ).toBe("working");
});
it("keeps a selected approval visible and otherwise follows background work", () => {
  const finished = run("completed", "finished"),
    busy = run("running", "busy"),
    approval = run("awaiting_approval", "approval");
  expect(companionState([finished, busy], finished.id, []).run?.id).toBe(
    busy.id,
  );
  expect(companionState([approval, busy], approval.id, []).mood).toBe(
    "question",
  );
  expect(companionState([finished], "", []).mood).toBe("idle");
});
it("distinguishes patch approval from no-op analysis continuation", () => {
  const review = run("awaiting_review");
  expect(companionState([review], review.id, []).message).toContain("Analysis");
  review.patch = "+code";
  expect(companionState([review], review.id, []).message).toContain("Changes");
});
it("renders valid, changing SVG frames from the actual Bloub engine for every mapped state", () => {
  const statuses: Run["status"][] = [
    "initializing",
    "running",
    "awaiting_approval",
    "blocked",
    "failed",
    "completed",
    "cancelled",
  ];
  for (const status of statuses) {
    const state = companionState([run(status)], "session", []);
    const engine = new BotEngine(
      100,
      state.animation,
      null,
      EXPRESSION_BY_ID.get(state.expression),
    );
    const first = engine.sample(0).bodyPath;
    const frame = engine.sample(1);
    expect(frame.bodyPath).toMatch(/^M/);
    expect(JSON.stringify(frame)).not.toMatch(/NaN|Infinity/);
    expect(first.length).toBeGreaterThan(20);
  }
  const engine = new BotEngine(100, "thinking");
  expect(engine.sample(0).bodyPath).not.toBe(engine.sample(0.6).bodyPath);
});
