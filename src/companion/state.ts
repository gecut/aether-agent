import type { Run, RunEvent } from "../../shared/types";
import type { StateId } from "../vendor/bloub/states";
import type { ExpressionId } from "../vendor/bloub/expressions";

export type CompanionMood =
  | "idle"
  | "planning"
  | "working"
  | "testing"
  | "reviewing"
  | "question"
  | "blocked"
  | "error"
  | "done"
  | "resting";
export interface CompanionState {
  mood: CompanionMood;
  title: string;
  message: string;
  animation: StateId;
  expression: ExpressionId;
  run?: Run;
}
const poses: Record<CompanionMood, Omit<CompanionState, "mood" | "run">> = {
  idle: {
    title: "Ready",
    message: "What shall we work on?",
    animation: "idle",
    expression: "curieux",
  },
  planning: {
    title: "Thinking",
    message: "Preparing a plan for this session.",
    animation: "thinking",
    expression: "attentif",
  },
  working: {
    title: "Working",
    message: "Working through the session tasks.",
    animation: "idle",
    expression: "attentif",
  },
  testing: {
    title: "Testing",
    message: "Checking the results with tests.",
    animation: "hexagon",
    expression: "mefiant",
  },
  reviewing: {
    title: "Reviewing",
    message: "Reviewing the results before handoff.",
    animation: "egg",
    expression: "attentif",
  },
  question: {
    title: "Your approval",
    message: "Review and approve the plan to continue.",
    animation: "notify",
    expression: "curieux",
  },
  blocked: {
    title: "Need your help",
    message: "Work is blocked. Check the session details.",
    animation: "alert",
    expression: "confus",
  },
  error: {
    title: "Something went wrong",
    message: "The error details are saved in the session.",
    animation: "alert",
    expression: "triste",
  },
  done: {
    title: "All done",
    message: "The results are ready for you to review.",
    animation: "idle",
    expression: "heureux",
  },
  resting: {
    title: "Taking a break",
    message: "We can start again when you are ready.",
    animation: "sleep",
    expression: "somnolent",
  },
};
export const companionPose = (mood: CompanionMood): CompanionState => ({
  ...poses[mood],
  mood,
});
const active = (run: Run) =>
  ["initializing", "running", "queued", "retrying"].includes(run.status);
const attention = (run: Run) =>
  ["awaiting_approval", "awaiting_review", "blocked"].includes(run.status);
export function companionState(
  runs: Run[],
  selectedId: string,
  events: RunEvent[],
): CompanionState {
  const selected = runs.find((run) => run.id === selectedId);
  const sorted = [...runs].sort((a, b) =>
    b.updatedAt.localeCompare(a.updatedAt),
  );
  const run =
    selected && (active(selected) || attention(selected))
      ? selected
      : (sorted.find(active) ?? sorted.find(attention) ?? selected);
  let mood: CompanionMood = "idle";
  if (run) {
    if (run.status === "awaiting_approval" || run.status === "awaiting_review")
      mood = "question";
    else if (run.status === "blocked") mood = "blocked";
    else if (run.status === "failed") mood = "error";
    else if (run.status === "completed") mood = "done";
    else if (run.status === "cancelled") mood = "resting";
    else if (run.status === "initializing") mood = "planning";
    else if (active(run)) {
      const phase = events
        .filter(
          (event) =>
            event.runId === run.id &&
            [
              "test.started",
              "test.completed",
              "agent.started",
              "task.running",
              "diff.updated",
            ].includes(event.type),
        )
        .at(-1);
      mood =
        phase?.type === "test.started"
          ? "testing"
          : phase?.type === "diff.updated" ||
              (phase?.type === "agent.started" &&
                phase.text.endsWith("· review"))
            ? "reviewing"
            : "working";
    }
  }
  const result: CompanionState = { ...poses[mood], mood, run };
  if (run?.status === "awaiting_review")
    result.message = run.patch
      ? "Changes are ready. Review them before applying."
      : "Analysis is ready. Continue to implementation.";
  return result;
}
