import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
import { defaults, type Run } from "../shared/types";

const directory = await mkdtemp(path.join(os.tmpdir(), "aether-live-ui-"));
const root = path.join(directory, "project");
await mkdir(root);
await mkdir("artifacts", { recursive: true });
await writeFile(
  path.join(root, "greet.ts"),
  'export function greet() { return "سلام"; }\n',
);
const server = createServer((request, response) => {
  request.resume();
  request.on("end", () => {
    response.setHeader("Content-Type", "text/event-stream");
    response.end(
      "data: " +
        JSON.stringify({
          choices: [
            {
              delta: {
                content: JSON.stringify({
                  title: "پیاده‌سازی greeting",
                  summary: "نوشتن کد براساس طرح قبلی",
                  tasks: [
                    {
                      id: "task-1",
                      title: "ساخت تابع greeting",
                      role: "implementer",
                      objective: "Implement greeting",
                      acceptance: ["Greets in Persian"],
                      files: ["greet.ts"],
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
  });
});
await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
assert(address && typeof address !== "string");
const store = new Store(path.join(directory, "data"));
await store.open();
const service = new Service(store);
const project = await service.addProject(root);
const config = {
  ...defaults,
  planner: {
    ...defaults.planner,
    provider: "compatible" as const,
    model: "fixture",
  },
  apiUrl: `http://127.0.0.1:${address.port}/v1`,
};
store.put("settings", "global", config);
const fixture: Run = {
  id: "bidi-fixture",
  projectId: project.id,
  title: "طراحی برنامه Weather با React",
  objective: "ابتدا ایده برنامه Weather را بررسی کن؛ هنوز کد ننویس.",
  status: "completed",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  tasks: [
    {
      id: "task-1",
      title: "طراحی رابط Weather",
      role: "architect",
      objective: "طراحی صفحه و بررسی API",
      acceptance: ["طرح اولیه آماده باشد"],
      files: [],
      dependencies: [],
      verification: "none",
      priority: 5,
      status: "completed",
      attempts: 1,
      output: "طرح: تابع greet با خروجی سلام. Use React for the interface.",
    },
  ],
  review:
    "طرح اولیه آماده است.\nEnglish review line with API identifiers.\nيمكن الانتقال إلى التنفيذ الآن.",
  config,
};
service.save(fixture);
await service.shutdown();
store.close();
const app = await electron.launch({
  args: ["."],
  env: { ...process.env, AETHER_TEST_DATA: path.join(directory, "data") },
});
const page = await app.firstWindow();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await page.getByText("Ambitious work.").waitFor();
  await page.getByRole("button", { name: /طراحی برنامه Weather/ }).click();
  const heading = page.getByRole("heading", { name: fixture.title });
  await heading.waitFor();
  const companion = page.getByRole("region", {
    name: "Ava companion",
    exact: true,
  });
  await companion.waitFor();
  assert.equal(await companion.getAttribute("data-mood"), "done");
  await page
    .getByRole("button", { name: "Pause companion animation", exact: true })
    .click();
  await page.waitForTimeout(150);
  const before = await companion.locator("mask path").first().getAttribute("d");
  await page.waitForTimeout(150);
  assert.equal(
    await companion.locator("mask path").first().getAttribute("d"),
    before,
  );
  await page
    .getByRole("button", { name: "Minimize companion", exact: true })
    .click();
  assert.equal(await companion.locator("svg.companion-avatar").count(), 0);
  await page
    .getByRole("button", { name: "Expand companion", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Resume companion animation", exact: true })
    .click();
  assert.equal(
    await heading.evaluate((element) => getComputedStyle(element).direction),
    "rtl",
  );
  assert.equal(
    await page.locator(".review-note pre").getAttribute("dir"),
    "auto",
  );
  await page.evaluate(() => document.fonts.ready);
  assert.equal(
    await page.evaluate(() =>
      document.fonts.check("14px Vazirmatn", "سلام العربية"),
    ),
    true,
  );
  const fonts = await page.evaluate(() =>
    [...document.fonts]
      .filter((font) => font.family === "Vazirmatn")
      .map((font) => font.status),
  );
  assert(fonts.includes("loaded"), JSON.stringify(fonts));
  await page
    .getByLabel("Implementation follow-up")
    .fill("پیاده‌سازی طرح با React و API");
  assert.equal(
    await page
      .getByLabel("Implementation follow-up")
      .evaluate((element) => getComputedStyle(element).direction),
    "rtl",
  );
  await page.screenshot({ path: "artifacts/bidi-session.png" });
  await page
    .getByRole("button", { name: "Graphify", exact: true })
    .last()
    .click();
  const symbol = page.getByRole("button", {
    name: "greet() in greet.ts",
    exact: true,
  });
  await symbol.waitFor({ timeout: 90000 });
  await symbol.click();
  await page.getByText("greet.ts:L1", { exact: true }).waitFor();
  const first = await page.evaluate(
    (projectId) => window.aether!.invoke("graph.read", { projectId }),
    project.id,
  );
  const second = await page.evaluate(
    (projectId) => window.aether!.invoke("graph.read", { projectId }),
    project.id,
  );
  assert.deepEqual(
    second,
    first,
    "Unchanged graph should use its cached extraction",
  );
  await writeFile(
    path.join(root, "greet.ts"),
    'export function greet() { return "سلام"; }\nexport function farewell() { return "خداحافظ"; }\n',
  );
  await page
    .getByRole("button", { name: "farewell() in greet.ts", exact: true })
    .waitFor({ timeout: 90000 });
  await page.getByLabel("Search graph nodes").fill("farewell");
  assert.equal(await page.locator(".symbol-node").count(), 1);
  await page
    .getByRole("button", { name: "Graphify", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "farewell() in greet.ts", exact: true })
    .waitFor({ timeout: 90000 });
  await page.screenshot({ path: "artifacts/live-graph.png" });
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page.getByRole("button", { name: "Session", exact: true }).click();
  await page
    .getByRole("button", { name: /Continue to implementation/ })
    .click();
  await page
    .getByRole("button", { name: "Approve & run", exact: true })
    .waitFor({ timeout: 30000 });
  assert.equal(
    await page
      .getByRole("region", { name: "Ava companion" })
      .getAttribute("data-mood"),
    "question",
  );
  await page
    .getByRole("button", { name: "Minimize companion", exact: true })
    .click();
  await page.reload();
  await page
    .getByRole("button", { name: "Expand companion", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Expand companion", exact: true })
    .click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(150);
  const reducedPath = await page
    .locator(".companion-avatar mask path")
    .first()
    .getAttribute("d");
  await page.waitForTimeout(150);
  assert.equal(
    await page.locator(".companion-avatar mask path").first().getAttribute("d"),
    reducedPath,
  );
  await page.screenshot({ path: "artifacts/companion-question.png" });
  await page
    .getByRole("region", { name: "Ava companion" })
    .screenshot({ path: "artifacts/ava-companion.png" });
  const snapshot = await page.evaluate(() =>
    window.aether!.invoke<any>("snapshot"),
  );
  const continuation = snapshot.runs.find(
    (run: Run) => run.parentRunId === fixture.id,
  );
  assert.equal(continuation.status, "awaiting_approval");
  assert.equal(continuation.tasks[0].files[0], "greet.ts");
  assert(continuation.plannerSnapshot.text.includes(fixture.tasks[0].output));
  assert.equal(
    snapshot.runs.find((run: Run) => run.id === fixture.id).status,
    "completed",
  );
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Live UI passed: actual Graphify extraction, cached reads, automatic node updates, search/selection, offline Vazirmatn, Persian/Arabic direction and approved coding continuation; Ava state, pause, collapse persistence and reduced motion.",
  );
} catch (error) {
  await page.screenshot({ path: "artifacts/live-ui-failure.png" });
  console.error("Renderer errors:", errors);
  throw error;
} finally {
  await app.close();
  server.close();
}
