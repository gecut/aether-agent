import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const directory = await mkdtemp(path.join(os.tmpdir(), "aether-ui-"));
const project = path.join(directory, "orbit-project");
await mkdir(project);
await writeFile(
  path.join(project, "README.md"),
  "# Orbit\nA local application for desktop verification.\n",
);

await mkdir("artifacts", { recursive: true });
const options = {
  args: ["."],
  env: { ...process.env, AETHER_TEST_DATA: path.join(directory, "data") },
};
let app = await electron.launch(options);
let page = await app.firstWindow();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await page.getByText("Ambitious work.").waitFor();
  assert.equal(await page.evaluate(() => window.aether?.desktop), true);
  await page.screenshot({ path: "artifacts/workspace-empty.png" });
  await page.evaluate(async (project) => {
    await window.aether.invoke("project.add", project);
  }, project);
  assert.ok(
    execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: project,
      encoding: "utf8",
    }).trim(),
  );
  await app.close();
  app = await electron.launch(options);
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page
    .getByRole("strong")
    .filter({ hasText: "orbit-project" })
    .first()
    .waitFor()
    .catch(() => page.getByText("orbit-project").first().waitFor());
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
  await app.close();
  app = await electron.launch(options);
  page = await app.firstWindow();
  await page.getByText("Ambitious work.").waitFor();
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
} finally {
  await app.close();
}
