import { _electron as electron } from "playwright";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import initSqlJs from "sql.js";
const directory = await mkdtemp(
  path.join(os.tmpdir(), "aether-integrations-ui-"),
);
const data = path.join(directory, "data");
const binaries = path.join(directory, "bin");
await mkdir(binaries);
await writeFile(
  path.join(binaries, "gh"),
  `#!${process.execPath}
const repos=[{nameWithOwner:'fixture/example',url:'https://github.com/fixture/example',isPrivate:false}];console.log(process.argv[2]==='api'?'fixture-user':JSON.stringify(repos));
`,
  { mode: 0o700 },
);
const options = {
  ...(process.env.AETHER_PACKAGE_PATH
    ? { executablePath: process.env.AETHER_PACKAGE_PATH }
    : { args: ["."] }),
  env: {
    ...process.env,
    PATH: binaries + path.delimiter + process.env.PATH,
    AETHER_TEST_DATA: data,
  },
};
let app = await electron.launch(options),
  page = await app.firstWindow();
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
try {
  await page
    .getByRole("button", { name: "Start building", exact: true })
    .click();
  await page.getByRole("button", { name: "Settings ⌘ ,", exact: true }).click();
  await page
    .getByRole("heading", { name: "GitHub connection", exact: true })
    .waitFor();
  const telegram = page.getByRole("region", {
    name: "Telegram activity & decisions",
  });
  await telegram.scrollIntoViewIfNeeded();
  const token = telegram.getByLabel("Telegram bot token", { exact: true });
  assert.equal(await token.getAttribute("type"), "password");
  await token.fill("invalid-token");
  const configure = telegram.getByRole("button", {
    name: "Connect bot & create pairing code",
    exact: true,
  });
  assert.equal(await configure.isDisabled(), true);
  await telegram
    .getByRole("checkbox", {
      name: "I want Aether to send project names",
      exact: false,
    })
    .check();
  assert.equal(await configure.isDisabled(), true);
  await token.fill("123456:fixture_bot_token_never_a_real_credential");
  assert.equal(await configure.isEnabled(), true);
  await token.fill("");
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/integration-settings.png" });
  // Controlled native CLI fixture exercises browsing and import without account access.
  const github = await page.evaluate(() =>
    window.aether.invoke("integration.github.verify"),
  );
  assert.equal(github.state, "connected");
  if (github.state === "connected") {
    const section = page.getByRole("region", {
      name: "GitHub connection",
      exact: true,
    });
    await section
      .getByRole("button", { name: "Browse repositories", exact: true })
      .click();
    await section
      .getByRole("textbox", { name: "Find a repository" })
      .waitFor({ timeout: 20000 });
    const rows = section.locator(".integration-repositories li");
    if (await rows.count()) {
      await rows
        .first()
        .getByRole("button", { name: "Clone repository", exact: true })
        .click();
      const modal = page.getByRole("dialog", { name: "Import a project" });
      await modal.waitFor();
      assert.match(
        await modal
          .getByRole("textbox", { name: "Repository URL" })
          .inputValue(),
        /^https:\/\/github.com\//,
      );
      await modal
        .getByRole("button", { name: "Close project import", exact: true })
        .click();
    }
  }
  await app.close();
  const SQL = await initSqlJs();
  const file = path.join(data, "aether.db");
  const db = new SQL.Database(await readFile(file));
  db.run(
    "INSERT INTO records VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET value=excluded.value",
    [
      "integration",
      "telegram",
      JSON.stringify({
        version: 1,
        configured: true,
        enabled: false,
        remoteDecisions: false,
        bot: "aether_fixture_bot",
        recipient: { userId: 123, chatId: 123, name: "@fixture" },
        message: "Telegram is paused.",
      }),
    ],
  );
  await writeFile(file, db.export());
  db.close();
  app = await electron.launch(options);
  page = await app.firstWindow();
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.getByRole("button", { name: "Settings ⌘ ,", exact: true }).click();
  const paired = page.getByRole("region", {
    name: "Telegram activity & decisions",
  });
  await paired
    .getByText("@aether_fixture_bot → @fixture", { exact: true })
    .waitFor();
  const remote = paired.getByRole("checkbox", {
    name: "Allow this paired Telegram user",
    exact: false,
  });
  assert.equal(await remote.isDisabled(), true);
  assert.equal(
    await paired
      .getByRole("button", { name: "Send test notification" })
      .isDisabled(),
    true,
  );
  await paired
    .getByRole("checkbox", {
      name: "Send activity notifications",
      exact: false,
    })
    .click();
  await page.waitForFunction(async () => {
    const state = await window.aether.invoke("integration.status");
    return state.telegram.enabled;
  });
  await remote.click();
  await page.waitForFunction(async () => {
    const state = await window.aether.invoke("integration.status");
    return state.telegram.remoteDecisions;
  });
  // The fixture deliberately has no encrypted bot credential: no Telegram network call is made.
  await paired
    .getByRole("button", { name: "Disconnect Telegram", exact: true })
    .click();
  await paired.getByLabel("Telegram bot token", { exact: true }).waitFor();
  const status = await page.evaluate(() =>
    window.aether.invoke("integration.status"),
  );
  assert.equal(status.telegram.configured, false);
  assert.deepEqual(errors, []);
  console.log(
    `Integrations desktop passed: bot-token masking/consent/validation, paused DM controls, remote opt-in and disconnect, GitHub verification (${github.state}), repository-to-import navigation through a native CLI fixture; no real account credentials or live Telegram messages.`,
  );
} finally {
  await app.close();
  await rm(directory, { recursive: true, force: true });
}
