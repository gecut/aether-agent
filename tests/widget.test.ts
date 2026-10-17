import { expect, it } from "vitest";
import { widgetActivity } from "../shared/widget";
import { defaults, type Run, type Project, type Task } from "../shared/types";
const project = (id: string): Project => ({
  id,
  name: "Project " + id,
  path: "/not-for-widget/" + id,
  createdAt: "now",
});
const task = (index: number): Task => ({
  id: "task-" + index,
  title: "Task " + index,
  role: "implementer",
  objective: "Private objective",
  acceptance: ["Private criterion"],
  files: ["private.js"],
  dependencies: [],
  verification: "none",
  priority: 5,
  status: "completed",
  attempts: 1,
  endedAt: new Date(1700000000000 + index * 1000).toISOString(),
  output: "private output",
});
const run = (projectId: string, tasks: Task[]): Run => ({
  id: projectId + "-run",
  projectId,
  title: "Session " + projectId,
  status: "awaiting_review",
  createdAt: "2026-10-17",
  updatedAt: "2026-10-17",
  objective: "Private objective",
  tasks,
  config: defaults,
  review: "Private review",
  patch: "Private diff",
});
it("filters project activity and exposes only minimal task metadata", () => {
  const result = widgetActivity(
    [project("a"), project("b")],
    [run("a", [task(1)]), run("b", [task(2)])],
    "a",
  );
  expect(result.completed).toBe(1);
  expect(result.attention).toBe(1);
  expect(result.items).toHaveLength(2);
  expect(result.items.every((item) => item.projectId === "a")).toBe(true);
  expect(JSON.stringify(result)).not.toMatch(
    /Private|private|not-for-widget|model|patch|config/,
  );
  expect(result.items.find((item) => item.kind === "task")?.status).toBe(
    "completed",
  );
  expect(result.items.find((item) => item.kind === "session")?.status).toBe(
    "awaiting_review",
  );
});
it("keeps every completion reachable through pagination with stable IDs", () => {
  const tasks = Array.from({ length: 56 }, (_, i) => task(i));
  const runs = [run("a", tasks)];
  const pages = [0, 20, 40].map((offset) =>
    widgetActivity([project("a")], runs, "", offset),
  );
  expect(pages[0].completed).toBe(56);
  expect(pages.flatMap((page) => page.items)).toHaveLength(57);
  expect(
    new Set(pages.flatMap((page) => page.items.map((item) => item.id))).size,
  ).toBe(57);
  expect(widgetActivity([project("a")], runs, "", 999).offset).toBe(40);
});
it("tracks active and attention counts independently across projects", () => {
  const active = { ...run("a", []), status: "running" as const };
  const waiting = { ...run("b", []), status: "awaiting_approval" as const };
  const result = widgetActivity(
    [project("a"), project("b")],
    [active, waiting],
  );
  expect(result.active).toBe(1);
  expect(result.attention).toBe(1);
  expect(widgetActivity([project("a")], [active, waiting]).items).toHaveLength(
    1,
  );
});
