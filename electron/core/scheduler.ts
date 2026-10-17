import type { Task, Plan } from "../../shared/types";
import { validateScopes } from "./security";
export function validateGraph(plan: Plan) {
  const ids = new Set(plan.tasks.map((t) => t.id));
  if (ids.size !== plan.tasks.length) throw new Error("Duplicate task IDs");
  for (const task of plan.tasks) {
    validateScopes(task.files);
    for (const dep of task.dependencies)
      if (!ids.has(dep) || dep === task.id)
        throw new Error("Invalid dependency: " + dep);
  }
  const visited = new Set<string>(),
    active = new Set<string>();
  const visit = (id: string) => {
    if (active.has(id)) throw new Error("Task graph contains a cycle");
    if (visited.has(id)) return;
    active.add(id);
    for (const dep of plan.tasks.find((t) => t.id === id)!.dependencies)
      visit(dep);
    active.delete(id);
    visited.add(id);
  };
  for (const id of ids) visit(id);
}
export function overlaps(a: string[], b: string[]) {
  return a.some((x) =>
    b.some(
      (y) =>
        x === "*" ||
        y === "*" ||
        x === y ||
        x.startsWith(y.replace(/\/$/, "") + "/") ||
        y.startsWith(x.replace(/\/$/, "") + "/"),
    ),
  );
}
export async function schedule(
  tasks: Task[],
  worker: (task: Task) => Promise<void>,
  options: {
    concurrency: number;
    retries: number;
    signal: AbortSignal;
    change: (task: Task) => void;
    backoffMs?: number;
  },
) {
  const running = new Map<string, Promise<void>>();
  const launch = (task: Task) => {
    task.status = "running";
    task.startedAt = new Date().toISOString();
    options.change(task);
    const promise = (async () => {
      for (let attempt = task.attempts; attempt <= options.retries; attempt++) {
        if (options.signal.aborted) {
          task.status = "cancelled";
          task.reason = "Run cancelled";
          break;
        }
        task.attempts = attempt + 1;
        try {
          await worker(task);
          task.status = "completed";
          task.reason = undefined;
          break;
        } catch (error) {
          task.reason = error instanceof Error ? error.message : String(error);
          if (options.signal.aborted) {
            task.status = "cancelled";
            break;
          }
          if (attempt === options.retries) {
            task.status = "failed";
            break;
          }
          task.status = "retrying";
          options.change(task);
          await new Promise<void>((resolve) => {
            const done = () => {
              clearTimeout(timer);
              options.signal.removeEventListener("abort", done);
              resolve();
            };
            const timer = setTimeout(
              done,
              (options.backoffMs ?? 500) * 2 ** attempt,
            );
            options.signal.addEventListener("abort", done, { once: true });
          });
          task.status = "running";
          options.change(task);
        }
      }
      task.endedAt = new Date().toISOString();
      options.change(task);
    })().finally(() => running.delete(task.id));
    running.set(task.id, promise);
  };
  while (true) {
    if (options.signal.aborted) {
      for (const task of tasks.filter((t) => t.status === "queued")) {
        task.status = "cancelled";
        task.reason = "Run cancelled";
        options.change(task);
      }
    }
    for (const task of tasks.filter((t) => t.status === "queued")) {
      if (
        task.dependencies.some((id) =>
          ["failed", "blocked", "cancelled"].includes(
            tasks.find((t) => t.id === id)!.status,
          ),
        )
      ) {
        task.status = "blocked";
        task.reason = "A dependency did not complete";
        options.change(task);
      }
    }
    const candidates = tasks
      .filter(
        (t) =>
          t.status === "queued" &&
          t.dependencies.every(
            (id) => tasks.find((d) => d.id === id)!.status === "completed",
          ),
      )
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
    for (const task of candidates) {
      if (running.size >= options.concurrency || options.signal.aborted) break;
      const active = tasks.filter((t) => running.has(t.id));
      if (active.some((t) => overlaps(t.files, task.files))) continue;
      launch(task);
    }
    if (!running.size) break;
    await Promise.race(running.values());
  }
}
