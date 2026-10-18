import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { createServer } from "node:http";
const archive = process.env.AETHER_IDE_ARCHIVE;
if (!archive)
  throw new Error(
    "Set AETHER_IDE_ARCHIVE to the verified platform release archive for this acceptance check.",
  );
const directory = await mkdtemp(path.join(os.tmpdir(), "aether-code-oss-"));
const project = path.join(directory, "sample-project");
await mkdir(project);
await writeFile(path.join(project, "README.md"), "# Aether IDE acceptance\n");
await mkdir("artifacts", { recursive: true });
const requests = [];
const server = createServer((request, response) => {
  if (request.method === "GET") {
    response.setHeader("Content-Type", "application/json");
    response.end(
      JSON.stringify({
        data: [{ id: "fixture-small" }, { id: "fixture-large" }],
      }),
    );
    return;
  }
  let body = "";
  request.on("data", (chunk) => {
    body += chunk;
  });
  request.on("end", () => {
    requests.push(JSON.parse(body));
    response.setHeader("Content-Type", "text/event-stream");
    response.end(
      "data: " +
        JSON.stringify({
          choices: [
            {
              delta: {
                content:
                  "This project contains the Aether IDE acceptance README.",
              },
            },
          ],
        }) +
        "\n\ndata: [DONE]\n\n",
    );
  });
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const app = await electron.launch({
  args: ["."],
  env: {
    ...process.env,
    AETHER_TEST_DATA: path.join(directory, "data"),
    AETHER_IDE_ARCHIVE: path.resolve(archive),
  },
});
const page = await app.firstWindow();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  console.log("Opening disposable IDE acceptance fixture", directory);
  await page.getByRole("button", { name: "Start building" }).click();
  await page
    .getByRole("heading", { name: "What are we building today?" })
    .waitFor();
  await page.evaluate(
    async (project) => window.aether.invoke("project.add", project),
    project,
  );
  await page.evaluate(async (port) => {
    const { settings } = await window.aether.invoke("snapshot");
    await window.aether.invoke("settings.save", {
      ...settings,
      planner: {
        ...settings.planner,
        provider: "compatible",
        model: "fixture-large",
      },
      apiUrl: `http://127.0.0.1:${port}/v1`,
    });
    await window.aether.invoke("diagnostics");
  }, server.address().port);
  await page.reload();
  await page.getByRole("button", { name: "IDE", exact: true }).click();
  console.log("Installing the pinned native IDE runtime");
  await page
    .getByRole("button", { name: /Set up full IDE/ })
    .click({ timeout: 30000 });
  console.log(
    "After setup click",
    await page.evaluate(() => ({
      ide: !!document.querySelector(".ide-mode"),
      text: document.querySelector(".ide-runtime-setup")?.textContent,
    })),
  );
  console.log(
    "Runtime installation status",
    await page.evaluate(() => window.aether.invoke("ide.runtime.status")),
  );
  await page.waitForFunction(
    () =>
      !!document.querySelector(".native-ide-host") &&
      !document.querySelector(".ide-runtime-setup"),
    undefined,
    { timeout: 180000 },
  );
  const contents = await app.evaluate(({ webContents }) =>
    webContents.getAllWebContents().map((c) => ({
      id: c.id,
      url: c.getURL(),
      prefs: {
        node: c.getLastWebPreferences().nodeIntegration,
        preload: c.getLastWebPreferences().preload,
      },
    })),
  );
  console.log(
    "Native views",
    contents.map((c) => ({
      id: c.id,
      url: c.url.startsWith("http:") ? "private loopback workbench" : "app",
    })),
  );
  const native = contents.find((c) => c.url.startsWith("http://127.0.0.1:"));
  assert(native && !native.prefs.node && !native.prefs.preload);
  const workbench = app
    .context()
    .pages()
    .find((p) => p.url().startsWith("http://127.0.0.1:"));
  assert(
    workbench,
    "The real native workbench must be accessible for acceptance checks",
  );
  await workbench.locator(".monaco-workbench").waitFor({ timeout: 60000 });
  const command = async (name) => {
    await workbench.keyboard.press("F1");
    await workbench.locator(".quick-input-widget input").fill(">" + name);
    await workbench
      .locator(".quick-input-list .monaco-list-row")
      .filter({ hasText: name.split(": ").at(-1) })
      .first()
      .click();
  };
  const trust = workbench.getByRole("button", { name: /Yes, I trust/ });
  if (await trust.isVisible()) await trust.click();
  await workbench.getByText("README.md", { exact: true }).first().dblclick();
  await workbench
    .getByRole("textbox", { name: "README.md", exact: true })
    .focus();
  await workbench.keyboard.press(
    process.platform === "darwin" ? "Meta+End" : "Control+End",
  );
  await workbench.keyboard.type("\nSaved from the real Code-OSS editor\n");
  await workbench.keyboard.press(
    process.platform === "darwin" ? "Meta+s" : "Control+s",
  );
  await workbench.waitForTimeout(600);
  assert(
    (await readFile(path.join(project, "README.md"), "utf8")).includes(
      "Saved from the real Code-OSS editor",
    ),
  );
  console.log("Actual Code-OSS file editing and save passed");
  await page
    .getByRole("button", { name: "Project actions", exact: true })
    .click();
  const projectActions = page.getByRole("dialog", { name: "Project actions" });
  await projectActions.waitFor();
  const nativeVisible = () =>
    app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((w) => w.getTitle() === "Aether Code")
        .contentView.children.find(
          (view) =>
            "webContents" in view &&
            view.webContents.getURL().startsWith("http://127.0.0.1:"),
        )
        .getVisible(),
    );
  assert.equal(
    await nativeVisible(),
    false,
    "Project menu must stay above the native IDE",
  );
  await projectActions
    .getByRole("button", { name: "Open terminal", exact: false })
    .click();
  await workbench.locator(".terminal .xterm-helper-textarea").first().waitFor();
  assert.equal(
    await nativeVisible(),
    true,
    "Workbench must return without losing the editor",
  );
  await workbench.locator(".terminal .xterm-helper-textarea").first().waitFor();
  if (await trust.isVisible()) await trust.click();
  for (let attempt = 0; attempt < 15; attempt++) {
    await workbench.locator(".terminal .xterm-helper-textarea").first().focus();
    await workbench.keyboard.press("Control+u");
    await workbench.keyboard.type(
      "printf AETHER_TERMINAL_OK > terminal-result.txt",
    );
    await workbench.keyboard.press("Enter");
    await workbench.waitForTimeout(1000);
    if (
      await readFile(path.join(project, "terminal-result.txt"), "utf8").then(
        (text) => text === "AETHER_TERMINAL_OK",
        () => false,
      )
    )
      break;
  }
  assert.equal(
    await readFile(path.join(project, "terminal-result.txt"), "utf8"),
    "AETHER_TERMINAL_OK",
  );
  console.log("Real integrated terminal command passed");
  const stage = path.join(directory, "extension-fixture");
  await mkdir(path.join(stage, "extension"), { recursive: true });
  await writeFile(
    path.join(stage, "extension", "package.json"),
    JSON.stringify({
      name: "aether-fixture",
      displayName: "Aether Fixture",
      publisher: "aether-test",
      version: "1.0.0",
      engines: { vscode: "^1.90.0" },
      main: "./extension.js",
      activationEvents: ["onCommand:aetherFixture.verify"],
      contributes: {
        commands: [
          {
            command: "aetherFixture.verify",
            title: "Aether Fixture: Verify Extension Host",
          },
        ],
      },
    }),
  );
  await writeFile(
    path.join(stage, "extension", "extension.js"),
    `const v=require('vscode');exports.activate=c=>c.subscriptions.push(v.commands.registerCommand('aetherFixture.verify',async()=>{await v.workspace.fs.writeFile(v.Uri.joinPath(v.workspace.workspaceFolders[0].uri,'extension-result.txt'),Buffer.from('REAL_EXTENSION_HOST'));v.window.showInformationMessage('Aether extension host verified');}));`,
  );
  await writeFile(
    path.join(stage, "[Content_Types].xml"),
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="vsixmanifest" ContentType="text/xml"/></Types>',
  );
  await writeFile(
    path.join(stage, "extension.vsixmanifest"),
    '<?xml version="1.0"?><PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011"><Metadata><Identity Language="en-US" Id="aether-fixture" Version="1.0.0" Publisher="aether-test"/><DisplayName>Aether Fixture</DisplayName><Description>Acceptance fixture</Description></Metadata><Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/><Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/></Assets></PackageManifest>',
  );
  const vsix = path.join(directory, "fixture.vsix");
  execFileSync(
    "zip",
    ["-qr", vsix, "extension", "[Content_Types].xml", "extension.vsixmanifest"],
    { cwd: stage },
  );
  const runtime = path.join(
    directory,
    "data",
    "ide-runtime",
    `code-server-4.141.0-${process.platform}-${process.arch}`,
  );
  execFileSync(
    path.join(
      runtime,
      "lib",
      process.platform === "win32" ? "node.exe" : "node",
    ),
    [
      path.join(runtime, "out", "node", "entry.js"),
      "--config",
      path.join(directory, "data", "ide-data", "config.yaml"),
      "--user-data-dir",
      path.join(directory, "data", "ide-data", "user"),
      "--extensions-dir",
      path.join(directory, "data", "ide-data", "extensions"),
      "--install-extension",
      vsix,
      "--force",
    ],
    { timeout: 30000, stdio: "pipe" },
  );
  await workbench.reload();
  await workbench.locator(".monaco-workbench").waitFor();
  await command("Aether Fixture: Verify Extension Host");
  await workbench
    .getByText("Aether extension host verified", { exact: true })
    .waitFor({ timeout: 30000 });
  assert.equal(
    await readFile(path.join(project, "extension-result.txt"), "utf8"),
    "REAL_EXTENSION_HOST",
  );
  await command("Extensions: Show Installed Extensions");
  await workbench
    .getByText("Aether Fixture", { exact: true })
    .first()
    .waitFor();
  console.log("VSIX installed and activated in the real extension host");
  assert.equal(
    await workbench.evaluate(() => typeof window.aether),
    "undefined",
  );
  await page
    .getByRole("complementary", { name: "Project agent chat" })
    .waitFor();
  await page.getByLabel("Select planner model").click();
  await page
    .getByRole("button", { name: "Compatible API", exact: true })
    .click();
  await page.getByLabel("Search models").fill("small");
  await page
    .locator(".model-options button")
    .filter({ hasText: "fixture-small" })
    .click();
  await page
    .getByLabel("Message project agent")
    .fill("Explain this project README");
  await page.getByLabel("Send to project agent").click();
  await page
    .getByText("This project contains the Aether IDE acceptance README.", {
      exact: true,
    })
    .waitFor();
  assert.equal(requests[0].model, "fixture-small");
  assert(
    requests[0].messages.some((message) =>
      message.content.includes("READ-ONLY PROJECT EXCERPTS"),
    ),
  );
  const hostBefore = await page.locator(".native-ide-host").boundingBox();
  await page.getByLabel("Hide agent chat").click();
  await page.waitForFunction(
    (width) =>
      document.querySelector(".native-ide-host").getBoundingClientRect().width >
      width,
    hostBefore.width,
  );
  await page.getByLabel("Show agent chat").click();
  await page
    .getByText("This project contains the Aether IDE acceptance README.", {
      exact: true,
    })
    .waitFor();
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((w) => w.getTitle() === "Aether Code")
      .setSize(1000, 760),
  );
  await page.getByLabel("Select planner model").click();
  const popover = await page.locator(".model-picker-popover").boundingBox();
  const hostBounds = await page.locator(".native-ide-host").boundingBox();
  assert(
    popover.x >= hostBounds.x + hostBounds.width,
    "The model popup must stay clear of the native IDE surface",
  );
  await page.keyboard.press("Escape");
  console.log(
    "Searchable model selection, scoped project chat, pane collapse and narrow-window popup passed",
  );
  await page.screenshot({ path: "artifacts/code-oss-workspace.png" });
  await workbench.screenshot({ path: "artifacts/code-oss-workbench.png" });
  assert.deepEqual(errors, []);
  await page.getByRole("button", { name: "Back to Aether" }).click();
  await page
    .getByRole("heading", { name: "What are we building today?" })
    .waitFor();
  console.log("Real Code-OSS workbench and Back to Aether passed", directory);
} catch (error) {
  for (const [i, p] of app.context().pages().entries())
    await p
      .screenshot({ path: `artifacts/ide-failure-${i}.png` })
      .catch(() => {});
  throw error;
} finally {
  if (process.platform === "darwin") {
    const child = app.process();
    if (child.exitCode === null && child.signalCode === null) {
      const done = new Promise((resolve) => child.once("exit", resolve));
      const timer = setTimeout(() => child.kill("SIGKILL"), 10000);
      child.kill("SIGTERM");
      await done;
      clearTimeout(timer);
    }
  } else await app.close();
  await rm(path.join(directory, "data", "ide-runtime"), {
    recursive: true,
    force: true,
  });
  server.close();
}
