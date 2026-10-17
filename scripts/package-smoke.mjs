import { _electron as electron } from "playwright";
import { mkdtemp, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
const directory = await mkdtemp(path.join(os.tmpdir(), "aether-packaged-"));
const options = {
  executablePath: path.resolve(
    process.env.AETHER_PACKAGE_PATH ??
      "release/mac-arm64/Aether Code.app/Contents/MacOS/Aether Code",
  ),
  env: { ...process.env, AETHER_TEST_DATA: directory },
};
console.log("Launching packaged desktop:", options.executablePath);
let app = await electron.launch(options);
try {
  let page = await app.firstWindow();
  await page.getByText("Ambitious work.").waitFor();
  console.log("Packaged desktop UI ready");
  let snapshot = await page.evaluate(() => window.aether.invoke("snapshot"));
  assert.ok(Array.isArray(snapshot.providers));
  assert.equal(snapshot.settings.planner.provider, "codex");
  assert.equal(await page.evaluate(() => window.aether.desktop), true);
  const native = await app.evaluate(({ app }) => ({
    packaged: app.isPackaged,
    data: app.getPath("userData"),
    name: app.getName(),
    version: app.getVersion(),
  }));
  assert.equal(native.packaged, true);
  const expectedVersion = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  ).version;
  assert.equal(native.version, expectedVersion);
  const core = await page.evaluate(() => window.aether.invoke("prompt.core"));
  assert.equal(core.id, "nexload");
  const preview = await page.evaluate(() =>
    window.aether.invoke("prompt.preview", {
      content: "Inspect without editing",
      variables: {},
      role: "reviewer",
    }),
  );
  assert.equal(preview.core.profile, "review");
  assert.ok(preview.systemLength > 0);
  assert.ok(
    preview.text
      .slice(0, preview.systemLength)
      .includes("Nexload 6+1 cognitive graph"),
  );
  await page.evaluate(() =>
    window.aether.invoke("settings.model", {
      role: "planner",
      patch: { model: "packaged-persistence-test" },
    }),
  );
  await page.screenshot({ path: "artifacts/packaged-desktop.png" });
  if (process.env.AETHER_CHECK_LIVE_CONNECTIONS === "1") {
    assert.equal(
      snapshot.providers.find((provider) => provider.id === "codex")
        ?.authenticated,
      true,
      "This optional live check requires an existing Codex login",
    );
    await page
      .getByRole("button", { name: "Settings", exact: false })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Sign in with ChatGPT", exact: true })
      .click();
    await page
      .getByText(
        "Already signed in with the Codex CLI. Your existing session was preserved.",
        { exact: true },
      )
      .first()
      .waitFor();
    const antigravity = await page.evaluate(() =>
      window.aether.invoke("provider.verify", "antigravity"),
    );
    assert.ok(
      ["signed-in", "blocked"].includes(antigravity.state),
      JSON.stringify(antigravity),
    );
    await page
      .getByRole("button", { name: "Run diagnostics", exact: true })
      .click();
    await page.waitForFunction(() =>
      Array.from(document.querySelectorAll("button")).some(
        (button) =>
          button.textContent?.includes("Run diagnostics") && !button.disabled,
      ),
    );
    console.log(
      "Live provider connection result:",
      JSON.stringify({
        codex: "existing ChatGPT OAuth session preserved",
        antigravity,
      }),
    );
    await page.screenshot({ path: "artifacts/provider-connections.png" });
  }
  console.log("Closing packaged desktop for restart check");
  await app.close();
  console.log("Relaunching packaged desktop");
  app = await electron.launch(options);
  page = await app.firstWindow();
  await page.getByText("Ambitious work.").waitFor();
  snapshot = await page.evaluate(() => window.aether.invoke("snapshot"));
  assert.equal(snapshot.settings.planner.model, "packaged-persistence-test");
  assert.equal(snapshot.settings.coder.model, "");
  console.log(
    "Packaged app launch, IPC and restart persistence passed:",
    JSON.stringify(native),
  );
} finally {
  await app.close();
}
