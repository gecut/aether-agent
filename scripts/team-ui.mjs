import { _electron as electron } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
const data = process.env.AETHER_TEAM_DATA;
assert(
  data?.startsWith(path.join(os.tmpdir(), "aether-real-provider-")),
  "Use the disposable real-provider fixture data directory",
);
const app = await electron.launch({
  ...(process.env.AETHER_PACKAGE_PATH
    ? { executablePath: process.env.AETHER_PACKAGE_PATH }
    : { args: ["."] }),
  env: { ...process.env, AETHER_TEST_DATA: data },
});
try {
  const page = await app.firstWindow();
  await page.getByText("Ambitious work.").waitFor();
  await page
    .getByRole("button", { name: "Agents & teams", exact: true })
    .click();
  const team = page.getByLabel("Coding team").first();
  await team.waitFor();
  assert.match(await team.innerText(), /Helper 1/);
  assert.match(await team.innerText(), /Finished/);
  await team.locator(".coding-helper summary").first().click();
  await team.getByText(/Collaboration ·/).click();
  assert.match(await team.innerText(), /delegate/);
  assert.match(await team.innerText(), /handoff/);
  await page.screenshot({ path: "artifacts/coding-team.png" });
  console.log("Real persisted coding-team UI verified");
} finally {
  await app.close();
}
