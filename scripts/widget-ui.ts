import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
import { defaults, type Run, type Task } from "../shared/types";
const directory = await mkdtemp(path.join(os.tmpdir(), "aether-widget-ui-"));
await mkdir("artifacts", { recursive: true });
let release: (() => void) | undefined;
const server = createServer((request, response) => {
  if (request.method === "GET") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ data: [{ id: "fixture" }] }));
    return;
  }
  request.resume();
  request.on("end", () => {
    release = () => {
      if (response.writableEnded) return;
      response.setHeader("Content-Type", "text/event-stream");
      response.end(
        "data: " +
          JSON.stringify({
            choices: [
              {
                delta: {
                  content: JSON.stringify({
                    title: "New project analysis",
                    summary: "Fixture",
                    tasks: [
                      {
                        id: "analyze",
                        title: "Read source",
                        role: "architect",
                        objective: "Analyze without writing",
                        acceptance: ["Source analyzed"],
                        files: [],
                        dependencies: [],
                        verification: "none",
                        priority: 5,
                      },
                    ],
                  }),
                },
              },
            ],
          }) +
          "\n\ndata: [DONE]\n\n",
      );
    };
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const dataDir = path.join(directory, "data");
const store = new Store(dataDir);
await store.open();
const service = new Service(store);
const projects = [];
for (const name of ["Atlas", "Beacon"]) {
  const root = path.join(directory, name);
  await mkdir(root);
  await writeFile(path.join(root, "README.md"), "# " + name);
  projects.push(await service.addProject(root));
}
store.put("settings", "global", {
  ...defaults,
  planner: { ...defaults.planner, provider: "compatible", model: "fixture" },
  apiUrl: `http://127.0.0.1:${address.port}/v1`,
});
const tasks: Task[] = Array.from({ length: 26 }, (_, index) => ({
  id: "task-" + index,
  title: "Completed Atlas task " + index,
  role: "implementer",
  objective: "Private objective",
  acceptance: ["done"],
  files: [],
  dependencies: [],
  verification: "none",
  priority: 5,
  status: "completed",
  attempts: 1,
  endedAt: new Date(1700000000000 + index * 1000).toISOString(),
}));
const completed: Run = {
  id: "atlas-run",
  projectId: projects[0].id,
  title: "Atlas implementation",
  objective: "Fixture",
  tasks,
  status: "completed",
  config: defaults,
  createdAt: "2026-10-17",
  updatedAt: "2026-10-17",
};
service.save(completed);
service.save({
  ...completed,
  id: "beacon-run",
  projectId: projects[1].id,
  title: "Beacon plan",
  tasks: [],
  status: "awaiting_approval",
});
await service.shutdown();
store.close();
const options = {
  ...(process.env.AETHER_PACKAGE_PATH
    ? { executablePath: path.resolve(process.env.AETHER_PACKAGE_PATH) }
    : { args: ["."] }),
  env: { ...process.env, AETHER_TEST_DATA: dataDir },
};
let app = await electron.launch(options);
let page = await app.firstWindow();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await page.getByText("Ambitious work.").waitFor();
  await page
    .getByRole("button", { name: "Show desktop widget", exact: true })
    .click();
  let popup = app.windows().find((candidate) => candidate !== page)!;
  assert(popup);
  popup.on("pageerror", (error) => errors.push(String(error)));
  await popup.getByRole("main", { name: "Aether desktop activity" }).waitFor();
  assert.equal(await popup.evaluate(() => typeof window.aether), "undefined");
  const blocked = await popup.evaluate(async () => {
    try {
      await window.aetherWidget!.invoke("run.approve", "atlas-run");
      return false;
    } catch {
      return true;
    }
  });
  assert(blocked);
  await popup.getByLabel("Widget project").selectOption(projects[0].id);
  await popup
    .getByText("26 tasks done · 0 active sessions", { exact: true })
    .waitFor();
  assert.equal(
    await popup.getByText("Beacon plan", { exact: true }).count(),
    0,
  );
  const native = await app.evaluate(({ BrowserWindow }) => {
    const w = BrowserWindow.getAllWindows().find(
      (w) => w.getTitle() === "Aether activity",
    )!;
    return {
      pinned: w.isAlwaysOnTop(),
      bounds: w.getBounds(),
      node: w.webContents.getLastWebPreferences().nodeIntegration,
    };
  });
  assert(native.pinned);
  assert.equal(native.node, false);
  await popup.getByRole("button", { name: "Older", exact: true }).click();
  await popup.getByText("Completed Atlas task 0", { exact: true }).waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === "Aether Code")!
      .close(),
  );
  await popup
    .getByRole("button")
    .filter({ hasText: "Completed Atlas task 0" })
    .click();
  await page
    .getByRole("heading", { name: "Atlas implementation", exact: true })
    .waitFor();
  assert(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === "Aether Code")!
        .isVisible(),
    ),
  );
  await popup.getByRole("button", { name: "Newer", exact: true }).click();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === "Aether Code")!
      .close(),
  );
  const next = await page.evaluate(
    (projectId) =>
      window.aether!.invoke<Run>("run.create", {
        projectId,
        objective: "Analyze the project without editing files",
      }),
    projects[0].id,
  );
  await popup.getByText("Work is in progress", { exact: true }).waitFor();
  assert(release);
  release();
  await popup.getByText("Your attention is needed", { exact: true }).waitFor();
  await popup.getByText("New project analysis", { exact: true }).waitFor();
  await popup
    .getByRole("button")
    .filter({ hasText: "New project analysis" })
    .click();
  await page
    .getByRole("heading", { name: "New project analysis", exact: true })
    .waitFor();
  await popup
    .getByRole("button", { name: "Unpin widget", exact: true })
    .click();
  await popup
    .getByRole("button", { name: "Pin widget", exact: true })
    .waitFor();
  await popup.screenshot({ path: "artifacts/desktop-widget.png" });
  await popup
    .getByRole("button", { name: "Collapse widget", exact: true })
    .click();
  await popup
    .getByRole("button", { name: "Expand widget", exact: true })
    .waitFor();
  assert.equal(
    await app.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((w) => w.getTitle() === "Aether activity")!
          .getBounds().height,
    ),
    155,
  );
  await popup
    .getByRole("button", { name: "Hide desktop widget", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Show desktop widget", exact: true })
    .click();
  await popup
    .getByRole("button", { name: "Expand widget", exact: true })
    .waitFor();
  await app.close();
  app = await electron.launch(options);
  page = await app.firstWindow();
  await page.getByText("Ambitious work.").waitFor();
  popup =
    app.windows().find((candidate) => candidate !== page) ??
    (await app.waitForEvent("window"));
  await popup
    .getByRole("button", { name: "Expand widget", exact: true })
    .waitFor();
  await popup
    .getByRole("button", { name: "Pin widget", exact: true })
    .waitFor();
  await popup
    .getByRole("button", { name: "Expand widget", exact: true })
    .click();
  assert.equal(
    await popup.getByLabel("Widget project").inputValue(),
    projects[0].id,
  );
  const snapshot = await page.evaluate(() =>
    window.aether!.invoke<any>("snapshot"),
  );
  assert.equal(
    snapshot.runs.find((run: Run) => run.id === next.id).status,
    "awaiting_approval",
  );
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === "Aether activity")!
      .setPosition(-10000, -10000),
  );
  await page
    .getByRole("button", { name: "Show desktop widget", exact: true })
    .click();
  const recovered = await app.evaluate(({ BrowserWindow, screen }) => {
    const bounds = BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === "Aether activity")!
      .getBounds();
    const area = screen.getDisplayMatching(bounds).workArea;
    return (
      bounds.x >= area.x &&
      bounds.y >= area.y &&
      bounds.x + bounds.width <= area.x + area.width &&
      bounds.y + bounds.height <= area.y + area.height
    );
  });
  assert(recovered, "Widget must be recoverable on screen");
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Widget E2E passed: native popup, project filtering, all completion pages, live planning/approval updates, restricted IPC, task navigation, pin/collapse/hide and restart persistence.",
  );
} catch (error) {
  console.error("Widget test failed:", error);
  for (const [index, window] of app.windows().entries())
    await window.screenshot({ path: `artifacts/widget-failure-${index}.png` });
  throw error;
} finally {
  release?.();
  await app.close();
  server.close();
}
