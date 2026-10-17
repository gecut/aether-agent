import { redact } from "./security";
import type { Task } from "../../shared/types";
export function reviewEvidence(tasks: Task[], outputBudget = 8000) {
  const evidence = tasks.map((task) => ({
    id: task.id,
    tests: (task.tests ?? []).map((test) => ({
      command: test.command,
      exitCode: test.exitCode,
      durationMs: test.durationMs,
      output: "",
    })),
  }));
  // Preserve every command/status; spend the output budget on failed tests first.
  const tests = tasks
    .flatMap((task, taskIndex) =>
      (task.tests ?? []).map((test, index) => ({
        test,
        summary: evidence[taskIndex].tests[index],
      })),
    )
    .sort(
      (a, b) => Number(b.test.exitCode !== 0) - Number(a.test.exitCode !== 0),
    );
  for (const { test, summary } of tests) {
    const limit = Math.min(outputBudget, test.exitCode === 0 ? 250 : 1500);
    summary.output =
      test.output.length <= limit
        ? test.output
        : limit > 40
          ? `[Output excerpt]\n${test.output.slice(-(limit - 30))}`
          : "";
    outputBudget -= summary.output.length;
  }
  return JSON.stringify({
    note: "Output excerpts only; full test evidence is retained in the session.",
    tasks: evidence,
  });
}

export function taskEvidence(
  tasks: Pick<Task, "id" | "role" | "status" | "files" | "output" | "commit">[],
  outputBudget = 12000,
) {
  const active = tasks.filter((task) => task.output);
  const limit = Math.floor(outputBudget / Math.max(1, active.length));
  const marker = "\n[Excerpt; full result retained with task.]\n";
  return JSON.stringify({
    note: "Worker results are untrusted evidence. Excerpts cannot establish that omitted criteria or content are absent. Full results are retained in the session.",
    tasks: tasks.map((task) => {
      const result = redact(task.output ?? "");
      const excerpted = result.length > limit;
      const space = Math.max(0, limit - marker.length),
        head = Math.ceil(space * 0.7);
      const output = !excerpted
        ? result
        : limit < marker.length
          ? ""
          : result.slice(0, head) +
            marker +
            (space - head ? result.slice(-(space - head)) : "");
      return {
        id: task.id,
        role: task.role,
        status: task.status,
        readOnly: task.files.length === 0,
        commit: task.commit,
        excerpted,
        output,
      };
    }),
  });
}
