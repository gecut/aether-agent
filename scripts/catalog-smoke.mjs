import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const directory = await mkdtemp(path.join(os.tmpdir(), "aether-catalog-"));
const project = path.join(directory, "project");
await mkdir(project);
let app = await electron.launch({
  args: ["."],
  env: { ...process.env, AETHER_TEST_DATA: path.join(directory, "data") },
});
try {
  let page = await app.firstWindow();
  await page.getByText("Ambitious work.").waitFor();
  const added = await page.evaluate(
    (project) => window.aether.invoke("project.add", project),
    project,
  );
  await app.close();
  app = await electron.launch({
    args: ["."],
    env: { ...process.env, AETHER_TEST_DATA: path.join(directory, "data") },
  });
  page = await app.firstWindow();
  await page.getByText("Ambitious work.").waitFor();
  await page
    .getByRole("button", { name: "Skills library", exact: false })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Browse skills", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Search catalog", exact: true })
    .waitFor({ timeout: 90000 });
  await page
    .getByRole("textbox", { name: "Search available skills" })
    .fill("web-design-guidelines");
  await page
    .getByRole("button", { name: "Search catalog", exact: true })
    .click();
  await page
    .getByText("1 skills found. GitHub stars describe the source repository.", {
      exact: true,
    })
    .waitFor();
  await page
    .getByRole("heading", { name: "web-design-guidelines", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: "Review package", exact: true })
    .click();
  const preview = page.getByRole("region", { name: "Skill package preview" });
  await preview.waitFor({ timeout: 30000 });
  assert.equal(
    await preview
      .getByRole("button", { name: "Install into project", exact: true })
      .isDisabled(),
    true,
  );
  await preview.getByRole("checkbox").check();
  await page.screenshot({ path: "artifacts/skills-catalog-review.png" });
  await preview
    .getByRole("button", { name: "Install into project", exact: true })
    .click();
  await preview.waitFor({ state: "hidden", timeout: 60000 });
  const snapshot = await page.evaluate(() => window.aether.invoke("snapshot"));
  const installed = snapshot.skills.find((s) => s.projectId === added.id);
  assert.ok(
    installed?.enabled &&
      installed.reviewed &&
      installed.source.includes("vercel-labs"),
  );
  assert.ok(
    (
      await readFile(
        path.join(project, installed.installPath, "SKILL.md"),
        "utf8",
      )
    ).includes("name:"),
  );
  assert.equal(
    execFileSync("git", ["status", "--short"], {
      cwd: project,
      encoding: "utf8",
    }),
    "",
  );
  await page.screenshot({ path: "artifacts/skills-installed.png" });
  console.log(
    `Live catalog UI passed: searched GitHub sources, reviewed pinned package, installed ${installed.name} into temporary project, preserved clean Git status.`,
  );
} catch (error) {
  const page = await app.firstWindow();
  console.error((await page.locator("body").innerText()).slice(-14000));
  await page.screenshot({ path: "artifacts/catalog-failure.png" });
  throw error;
} finally {
  await app.close();
}
