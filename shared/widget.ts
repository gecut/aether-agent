import type { Project, Run, Status } from "./types";
export interface WidgetActivity {
  id: string;
  runId: string;
  taskId?: string;
  projectId: string;
  projectName: string;
  title: string;
  status: Status;
  kind: "task" | "session";
  at: string;
}
export interface WidgetSnapshot {
  projects: { id: string; name: string }[];
  projectId: string;
  active: number;
  attention: number;
  completed: number;
  total: number;
  offset: number;
  items: WidgetActivity[];
  compact: boolean;
  pinned: boolean;
}
export function widgetActivity(
  projects: Project[],
  runs: Run[],
  projectId = "",
  offset = 0,
): Omit<WidgetSnapshot, "compact" | "pinned"> {
  const known = new Map(projects.map((project) => [project.id, project.name]));
  const selected = runs.filter(
    (run) =>
      known.has(run.projectId) && (!projectId || run.projectId === projectId),
  );
  const items: WidgetActivity[] = [];
  let active = 0,
    attention = 0,
    completed = 0;
  for (const run of selected) {
    if (["running", "initializing", "retrying", "queued"].includes(run.status))
      active++;
    if (
      ["awaiting_approval", "awaiting_review", "blocked", "failed"].includes(
        run.status,
      )
    )
      attention++;
    const base = {
      runId: run.id,
      projectId: run.projectId,
      projectName: known.get(run.projectId)!,
    };
    items.push({
      ...base,
      id: run.id,
      title: run.title,
      status: run.status,
      kind: "session",
      at: run.updatedAt,
    });
    for (const task of run.tasks) {
      if (task.status === "completed") completed++;
      if (task.status === "queued") continue;
      items.push({
        ...base,
        id: run.id + ":" + task.id,
        taskId: task.id,
        title: task.title,
        status: task.status,
        kind: "task",
        at: ["running", "retrying", "initializing"].includes(task.status)
          ? (task.startedAt ?? run.updatedAt)
          : (task.endedAt ?? task.startedAt ?? run.updatedAt),
      });
    }
  }
  items.sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
  const page = Math.min(
    Math.max(0, offset),
    Math.max(0, Math.ceil(items.length / 20) - 1) * 20,
  );
  return {
    projects: projects.map(({ id, name }) => ({ id, name })),
    projectId,
    active,
    attention,
    completed,
    total: items.length,
    offset: page,
    items: items.slice(page, page + 20),
  };
}
export interface WidgetBridge {
  invoke<T = unknown>(command: string, payload?: unknown): Promise<T>;
  onUpdate(callback: () => void): () => void;
  onPointer(
    callback: (point: { clientX: number; clientY: number }) => void,
  ): () => void;
}
declare global {
  interface Window {
    aetherWidget?: WidgetBridge;
  }
}
