import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import initSqlJs from "sql.js";
const directory = await mkdtemp(path.join(os.tmpdir(), "aether-ui-"));
const project = path.join(directory, "orbit-project");
await mkdir(project);
await writeFile(
  path.join(project, "README.md"),
  "# Orbit\nA local application for desktop verification.\n",
);

await writeFile(
  path.join(project, "sample.ts"),
  "const sample: string = 42;\n",
);
await mkdir("artifacts", { recursive: true });
const options = {
  args: ["."],
  env: { ...process.env, AETHER_TEST_DATA: path.join(directory, "data") },
};
// The macOS inspector can keep a disposable Electron process alive after
// Playwright's normal close request. Terminate only the test fixture so the
// restart assertions remain deterministic without affecting a user's app.
async function closeDesktop(instance) {
  if (process.platform !== "darwin") {
    await instance.close();
    return;
  }
  let child;
  try {
    child = instance.process();
  } catch {
    return;
  }
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  let timer;
  const forced = new Promise((resolve) => {
    timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 10000);
  });
  try {
    child.kill("SIGTERM");
    await Promise.race([exited, forced]);
  } finally {
    clearTimeout(timer);
  }
}
async function dismissSplash(page, required = false) {
  const start = page.getByRole("button", { name: "Start building" });
  if (required) {
    await start.click();
    return;
  }
  await start.click({ timeout: 3000 }).catch(() => {});
}
let app = await electron.launch(options);
let page = await app.firstWindow();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await dismissSplash(page, true);
  await page
    .getByRole("heading", { name: "What are we building today?" })
    .waitFor();
  assert.equal(await page.evaluate(() => window.aether?.desktop), true);
  await page.screenshot({ path: "artifacts/workspace-empty.png" });
  await page.evaluate(async (project) => {
    await window.aether.invoke("project.add", project);
  }, project);
  await page.reload();
  await page
    .getByRole("heading", { name: "What are we building today?" })
    .waitFor();
  assert.ok(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: project,
      encoding: "utf8",
    }).trim(),
  );
  await page.getByRole("button", { name: "IDE", exact: true }).click();
  await page.getByRole("button", { name: /README\.md/ }).click();
  await page.getByLabel("Editor README.md").waitFor();
  const editor = page.getByLabel("Editor README.md", { exact: true });
  await editor.focus();
  await editor.press(
    process.platform === "darwin" ? "Meta+End" : "Control+End",
  );
  await page.keyboard.press("Enter");
  await page.keyboard.type("Editor acceptance check");
  await page.keyboard.press("Enter");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  assert.equal(await page.locator(".ide-page").count(), 1);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  assert.ok(
    (await readFile(path.join(project, "README.md"), "utf8")).includes(
      "Editor acceptance check",
    ),
  );
  await page.getByTitle("Restore this version").first().waitFor();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByTitle("Restore this version").first().click();
  await page
    .getByText("Previous version restored.", { exact: false })
    .waitFor();
  assert.ok(
    !(await readFile(path.join(project, "README.md"), "utf8")).includes(
      "Editor acceptance check",
    ),
  );
  await page
    .getByRole("button", { name: "Hide explorer", exact: true })
    .click();
  assert.equal(await page.locator(".ide-explorer").count(), 0);
  await page
    .getByRole("button", { name: "Show explorer", exact: true })
    .click();
  await page.getByRole("button", { name: /sample\.ts/ }).click();
  await page.getByLabel("Editor sample.ts", { exact: true }).waitFor();
  await page.locator(".squiggly-error").first().waitFor();
  await page.screenshot({ path: "artifacts/ide-monaco.png" });
  await page.locator(".project-switch").click();
  await page.locator(".floating-popover.project-popover").waitFor();
  assert.equal(
    await page
      .locator(".floating-popover.project-popover")
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return element.contains(
          document.elementFromPoint(
            rect.left + rect.width / 2,
            rect.top + rect.height / 2,
          ),
        );
      }),
    true,
  );
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  console.log("Restarting after project setup");
  await closeDesktop(app);
  const SQL = await initSqlJs();
  const dbPath = path.join(directory, "data", "aether.db");
  const db = new SQL.Database(await readFile(dbPath));
  const fixtureProject = JSON.parse(
    db.exec("SELECT value FROM records WHERE kind='project'")[0].values[0][0],
  );
  const fixtureSettings = JSON.parse(
    db.exec("SELECT value FROM records WHERE kind='settings'")[0].values[0][0],
  );
  const at = new Date().toISOString();
  const chatFixture = {
    id: randomUUID(),
    title: "Chat menu acceptance",
    createdAt: at,
    updatedAt: at,
    messages: [],
    config: fixtureSettings,
  };
  const runFixture = {
    id: randomUUID(),
    projectId: fixtureProject.id,
    title: "Run menu acceptance",
    objective: "Check session controls",
    createdAt: at,
    updatedAt: at,
    status: "completed",
    tasks: [],
    config: fixtureSettings,
  };
  for (const [kind, fixture] of [
    ["chat", chatFixture],
    ["run", runFixture],
  ])
    db.run("INSERT INTO records VALUES (?,?,?)", [
      kind,
      fixture.id,
      JSON.stringify(fixture),
    ]);
  await writeFile(dbPath, db.export());
  db.close();
  app = await electron.launch(options);
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page
    .getByRole("strong")
    .filter({ hasText: "orbit-project" })
    .first()
    .waitFor()
    .catch(() => page.getByText("orbit-project").first().waitFor());
  for (const fixture of [chatFixture, runFixture]) {
    await page
      .getByRole("button", {
        name: `Session menu: ${fixture.title}`,
        exact: true,
      })
      .click();
    await page
      .locator(".session-menu")
      .getByRole("button", { name: "Pin session", exact: true })
      .click();
    const state = await page.evaluate(() => window.aether.invoke("snapshot"));
    assert.equal(
      (fixture === chatFixture ? state.chats : state.runs).find(
        (item) => item.id === fixture.id,
      ).pinned,
      true,
    );
  }
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page.locator(".history-row").waitFor();
  assert.equal(
    await page
      .locator(".history-open")
      .evaluate((element) => getComputedStyle(element).textAlign),
    "left",
  );
  await page.screenshot({ path: "artifacts/history-cards.png" });
  for (const fixture of [chatFixture, runFixture]) {
    await page
      .getByRole("button", {
        name: `Session menu: ${fixture.title}`,
        exact: true,
      })
      .click();
    page.once("dialog", (dialog) => dialog.accept());
    await page
      .locator(".session-menu")
      .getByRole("button", { name: "Delete session", exact: true })
      .click();
    await page
      .getByRole("button", {
        name: `Session menu: ${fixture.title}`,
        exact: true,
      })
      .waitFor({ state: "hidden" });
  }
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page.getByRole("button", { name: /Build a feature/ }).click();
  assert.ok(
    (
      await page.getByRole("textbox", { name: "Coding objective" }).inputValue()
    ).includes("useful feature"),
  );
  await page.screenshot({ path: "artifacts/workspace.png" });
  await page
    .getByRole("button", { name: "Settings", exact: false })
    .first()
    .click();
  await page.getByText("Your workspace, your rules.").waitFor();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.waitForFunction(
    () => document.documentElement.dataset.theme === "light",
  );
  assert.equal(await page.locator("html").getAttribute("data-theme"), "light");
  await page.locator(".project-switch").click();
  await page.locator(".floating-popover.project-popover").waitFor();
  await page.screenshot({ path: "artifacts/light-popover.png" });
  await page.setViewportSize({ width: 980, height: 680 });
  assert.equal(
    await page
      .locator(".floating-popover.project-popover")
      .evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 0 &&
          rect.right <= innerWidth &&
          rect.bottom <= innerHeight &&
          element.contains(
            document.elementFromPoint(rect.left + 20, rect.top + 20),
          )
        );
      }),
    true,
  );
  await page.screenshot({ path: "artifacts/compact-popover.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 1500, height: 980 });
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("heading", { name: "Coding teams (Codex)" }).waitFor();
  await page.getByLabel("Concurrent helpers per task lead").selectOption("2");
  const models = page.getByPlaceholder("Runtime default");
  await models.nth(0).fill("planner-test-id");
  await models.nth(1).fill("coder-test-id");
  await page.getByRole("button", { name: "Save settings" }).click();
  let settings = await page.evaluate(() => window.aether.invoke("snapshot"));
  assert.equal(settings.settings.planner.model, "planner-test-id");
  assert.equal(settings.settings.coder.model, "coder-test-id");
  assert.deepEqual(settings.settings.codingTeam, {
    enabled: true,
    maxHelpers: 2,
  });
  await page.screenshot({ path: "artifacts/settings.png" });
  await page
    .getByRole("button", { name: "Prompt laboratory", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Nexload prompt core", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Inspect core", exact: true }).click();
  await page.getByRole("region", { name: "Nexload core sources" }).waitFor();
  await page.getByRole("button", { name: "Save new version" }).click();
  await page.getByText("New prompt version saved and activated.").waitFor();
  await page.getByRole("button", { name: "Compile preview" }).click();
  await page.getByText("Compiled instructions", { exact: true }).waitFor();
  await page.getByText(/Nexload · execution ·/).waitFor();
  await page
    .getByRole("combobox", { name: "Preview agent role" })
    .selectOption("reviewer");
  await page.getByRole("button", { name: "Compile preview" }).click();
  await page.getByText(/Nexload · review ·/).waitFor();
  await page.screenshot({ path: "artifacts/nexload-prompt-core.png" });
  await page.screenshot({ path: "artifacts/prompt-laboratory.png" });
  await page
    .getByRole("button", { name: "Skills library", exact: false })
    .first()
    .click();
  assert.equal(
    await page
      .locator(".empty-state h2")
      .evaluate((element) => getComputedStyle(element).textAlign),
    "center",
  );
  assert.equal(
    await page
      .locator(".empty-state p")
      .evaluate((element) => getComputedStyle(element).textAlign),
    "center",
  );
  await page.getByRole("button", { name: "Create skill", exact: true }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Validate & save version" }).click();
  await page
    .getByRole("heading", { name: "focused-verification", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Enable focused-verification" })
    .click();
  await page.getByText("Enabled", { exact: true }).waitFor();
  await page
    .getByRole("button", { name: "Project memory", exact: true })
    .click();
  await page
    .getByPlaceholder(
      "A convention, architectural decision, or something worth investigating…",
    )
    .fill("Use Node built-in tests for repository verification.");
  await page
    .getByRole("combobox", { name: "Memory classification" })
    .selectOption("verified");
  await page.getByRole("button", { name: "Save memory" }).click();
  await page
    .getByText("Use Node built-in tests for repository verification.", {
      exact: true,
    })
    .waitFor();
  console.log("Restarting after persisted settings");
  await closeDesktop(app);
  app = await electron.launch(options);
  page = await app.firstWindow();
  console.log("Checking persisted home state");
  await dismissSplash(page);
  await page
    .getByRole("heading", { name: "What are we building today?" })
    .waitFor();
  const restored = await page.evaluate(() => window.aether.invoke("snapshot"));
  assert.equal(restored.settings.planner.model, "planner-test-id");
  assert.equal(restored.settings.coder.model, "coder-test-id");
  assert.equal(restored.skills[0].enabled, true);
  assert.equal(restored.memories[0].kind, "verified");
  assert.equal(restored.prompts[0].version, 1);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log(
    "Desktop E2E passed: real Electron launch, IPC, project recovery, independent models, prompt compilation, skills, memory, restart.",
  );
  console.log("Screenshots: artifacts/");
} catch (error) {
  await page.screenshot({ path: "artifacts/e2e-failure.png" }).catch(() => {});
  console.error(
    await page
      .locator("body")
      .innerText()
      .catch(() => "Page unavailable"),
  );
  throw error;
} finally {
  await closeDesktop(app);
}
