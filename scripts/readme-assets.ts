import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
import { defaults, type Run, type Task } from "../shared/types";

// Public documentation uses a disposable sample, never the user's saved sessions.
const directory = await mkdtemp(path.join(os.tmpdir(), "aether-readme-"));
const projectDir = path.join(directory, "Orbit");
await mkdir(path.join(projectDir, "src"), { recursive: true });
const files: Record<string, string> = {
  "types.ts": `export interface Task { id: string; title: string; state: 'queued' | 'running' | 'done'; }\nexport interface Queue { tasks: Task[]; concurrency: number; }\n`,
  "queue.ts": `import type { Task, Queue } from './types';\nexport function createQueue(concurrency = 2): Queue { return {tasks: [], concurrency}; }\nexport function enqueue(queue: Queue, task: Task) { queue.tasks.push(task); }\nexport function dequeue(queue: Queue) { return queue.tasks.find(task => task.state === 'queued'); }\n`,
  "worker.ts": `import {dequeue} from './queue';\nimport type {Queue, Task} from './types';\nexport function startWorker(queue: Queue) { const task = dequeue(queue); if (task) task.state = 'running'; return task; }\nexport function completeTask(task: Task) { task.state = 'done'; }\n`,
  "storage.ts": `import type {Queue} from './types';\nexport function serializeQueue(queue: Queue) { return JSON.stringify(queue); }\nexport function restoreQueue(text: string): Queue { return JSON.parse(text); }\n`,
  "events.ts": `import type {Task} from './types';\nexport function taskStarted(task: Task) { return {kind: 'started', id: task.id}; }\nexport function taskCompleted(task: Task) { return {kind: 'completed', id: task.id}; }\n`,
  "scheduler.ts": `import {startWorker} from './worker';\nimport type {Queue} from './types';\nexport function schedule(queue: Queue) { return Array.from({length: queue.concurrency}, () => startWorker(queue)).filter(Boolean); }\n`,
};
for (const [file, content] of Object.entries(files))
  await writeFile(path.join(projectDir, "src", file), content);
const store = new Store(path.join(directory, "data"));
await store.open();
const service = new Service(store);
const project = await service.addProject(projectDir);
const items = [
  ["contracts", "Define task contracts", "architect", "src/types.ts", ""],
  [
    "queue",
    "Build the queue engine",
    "implementer",
    "src/queue.ts",
    "contracts",
  ],
  [
    "storage",
    "Persist queue state",
    "implementer",
    "src/storage.ts",
    "contracts",
  ],
  ["worker", "Coordinate workers", "implementer", "src/worker.ts", "queue"],
  [
    "verify",
    "Verify the full workflow",
    "test-engineer",
    "src/scheduler.ts",
    "worker,storage",
  ],
];
const tasks: Task[] = items.map(([id, title, role, file, deps]) => ({
  id,
  title,
  role: role as Task["role"],
  files: [file],
  dependencies: deps ? deps.split(",") : [],
  objective: title + " with explicit boundaries and predictable behavior.",
  acceptance: [
    "Preserve existing task behavior",
    "Keep changes inside the approved file scope",
  ],
  verification: "none",
  priority: 5,
  status: "queued",
  attempts: 0,
}));
const run: Run = {
  id: "orbit-demo-plan",
  projectId: project.id,
  title: "Build a dependable task queue",
  objective:
    "Add a persistent task queue to Orbit, with bounded workers and a clear verification path.",
  status: "awaiting_approval",
  config: defaults,
  tasks,
  plan: {
    title: "Build a dependable task queue",
    summary:
      "Separate contracts, queue operations, persistence, and worker coordination. Integrate only after the dependency chain is complete.",
    tasks,
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};
service.save(run);
await service.shutdown();
store.close();
await mkdir("docs/assets", { recursive: true });
const app = await electron.launch({
  args: ["."],
  env: { ...process.env, AETHER_TEST_DATA: path.join(directory, "data") },
});
try {
  const page = await app.firstWindow();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.getByText("Ambitious work.").waitFor();
  await page.setViewportSize({ width: 1600, height: 1050 });
  await page.getByRole("button", { name: run.title, exact: true }).click();
  await page.getByRole("button", { name: /^Plan/ }).click();
  await page.getByRole("heading", { name: "Implementation plan" }).waitFor();
  await page
    .locator(".tabs button.active")
    .filter({ hasText: "Plan" })
    .waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: "docs/assets/workspace.png" });
  await page
    .getByRole("button", { name: "Graphify", exact: true })
    .first()
    .click();
  const node = page.getByRole("button", {
    name: "createQueue() in src/queue.ts",
    exact: true,
  });
  await node.waitFor({ timeout: 90000 });
  await page
    .getByRole("textbox", { name: "Search graph nodes" })
    .fill("src/queue.ts");
  for (let i = 0; i < 6; i++)
    await page
      .getByRole("button", { name: "Zoom in graph", exact: true })
      .click();
  await node.press("Enter");
  await page.locator(".graph-canvas").evaluate((element) => {
    element.scrollTop = (element.scrollHeight - element.clientHeight) / 2;
    element.scrollLeft = (element.scrollWidth - element.clientWidth) / 2;
  });
  await page.screenshot({ path: "docs/assets/graphify.png" });
  await page
    .getByRole("button", { name: "Show desktop widget", exact: true })
    .click();
  const popup = app.windows().find((candidate) => candidate !== page)!;
  assert(popup);
  await popup.getByRole("main", { name: "Aether desktop activity" }).waitFor();
  await popup.getByText("Your attention is needed", { exact: true }).waitFor();
  await popup.evaluate(() => document.fonts.ready);
  await popup.screenshot({
    path: "docs/assets/widget.png",
    omitBackground: true,
  });
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Documentation screenshots captured from isolated Orbit demo; no model calls.",
  );
} finally {
  await app.close();
}
