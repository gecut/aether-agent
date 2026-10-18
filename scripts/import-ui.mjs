import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const directory = await mkdtemp(path.join(os.tmpdir(), "aether-import-ui-"));
const project = path.join(directory, "external-project");
await mkdir(project);
const git = (...args) =>
  execFileSync("git", args, { cwd: project, encoding: "utf8" });
git("init", "-b", "main");
await writeFile(path.join(project, "README.md"), "# Existing project\n");
git("add", ".");
git(
  "-c",
  "user.name=Fixture",
  "-c",
  "user.email=fixture@example.invalid",
  "commit",
  "-m",
  "Existing history",
);
const head = git("rev-parse", "HEAD");
await writeFile(path.join(project, "README.md"), "# Existing staged work\n");
git("add", "README.md");
const index = git("diff", "--cached");
const app = await electron.launch({
  ...(process.env.AETHER_PACKAGE_PATH
    ? { executablePath: process.env.AETHER_PACKAGE_PATH }
    : { args: ["."] }),
  env: { ...process.env, AETHER_TEST_DATA: path.join(directory, "data") },
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
const pick = (folder) =>
  app.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, folder);
try {
  await page
    .getByRole("button", { name: "Start building", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Import project", exact: true })
    .click();
  const modal = page.getByRole("dialog", { name: "Import a project" });
  await pick(directory);
  await modal
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await modal
    .getByRole("textbox", { name: "Repository URL" })
    .fill("not-a-repository");
  await modal
    .getByRole("button", { name: "Clone repository", exact: true })
    .click();
  await modal
    .getByRole("status")
    .filter({ hasText: "Enter owner/repository" })
    .waitFor();
  await pick(project);
  await modal
    .getByRole("button", { name: "Open existing local project", exact: true })
    .click();
  const skills = page.getByRole("dialog", { name: "Skills before you start" });
  await skills.getByText("aether-project-workflow", { exact: true }).waitFor();
  await skills.getByRole("checkbox").first().check();
  assert.equal(
    await skills
      .getByRole("button", { name: "Install reviewed skills" })
      .isDisabled(),
    true,
  );
  await skills
    .getByText("Read skill instructions", { exact: true })
    .first()
    .click();
  await skills
    .getByRole("checkbox", {
      name: "I reviewed the selected skills",
      exact: false,
    })
    .check();
  await skills.getByRole("button", { name: "Install reviewed skills" }).click();
  await skills
    .getByText("Selected skills installed and enabled for this project.")
    .waitFor();
  assert.match(
    await readFile(
      path.join(project, ".agents/skills/aether-project-workflow/SKILL.md"),
      "utf8",
    ),
    /name: aether-project-workflow/,
  );
  assert.equal(git("rev-parse", "HEAD"), head);
  assert.equal(git("diff", "--cached"), index);
  await skills.getByRole("button", { name: "Continue to workspace" }).click();
  await page
    .getByRole("button", { name: "Import project", exact: true })
    .click();
  await pick(directory);
  await modal
    .getByRole("button", { name: "Choose folder", exact: true })
    .click();
  await modal
    .getByRole("textbox", { name: "Repository URL" })
    .fill("octocat/Hello-World");
  await modal
    .getByRole("button", { name: "Clone repository", exact: true })
    .click();
  console.log("Waiting for real GitHub clone");
  await skills.waitFor({ timeout: 90000 });
  await skills.getByText("Hello-World", { exact: true }).waitFor();
  assert.ok(
    (
      await readFile(path.join(directory, "Hello-World/README"), "utf8")
    ).includes("Hello World"),
  );
  await page.setViewportSize({ width: 740, height: 780 });
  assert.equal(
    await skills.evaluate((el) => el.scrollWidth <= el.clientWidth),
    true,
  );
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/import-skills-ui.png" });
  await skills.getByRole("button", { name: "Browse more skills" }).click();
  await page
    .getByRole("heading", { name: "Skills library", exact: true })
    .waitFor();
  const snapshot = await page.evaluate(() => window.aether.invoke("snapshot"));
  assert.equal(snapshot.projects.length, 2);
  assert.equal(snapshot.skills.filter((skill) => skill.enabled).length, 1);
  assert.deepEqual(errors, []);
  console.log(
    "Import desktop passed: visible validation, existing staged repository, explicit reviewed skill installation, real GitHub clone, narrow layout, optional skip/catalog navigation, no runtime errors.",
  );
} catch (error) {
  console.error(await page.locator("body").innerText());
  throw error;
} finally {
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
