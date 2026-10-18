import { _electron as electron } from "playwright";
const data = process.argv[2];
const app = await electron.launch({
  args: ["."],
  env: { ...process.env, AETHER_TEST_DATA: data },
});
try {
  const page = await app.firstWindow();
  await page.getByText("Ambitious work.").waitFor();
  await page.getByRole("button", { name: "Run history", exact: true }).click();
  await page.locator(".history-list > button").first().click();
  await page.getByRole("button", { name: "Plan 1", exact: true }).click();
  await page.getByLabel("Task dependency graph").waitFor();
  await page.screenshot({ path: "artifacts/real-plan.png" });
  await page.getByRole("button", { name: "Changes", exact: true }).click();
  await page.getByText("Verification evidence", { exact: true }).waitFor();
  await page.screenshot({ path: "artifacts/real-diff.png" });
  console.log("Real completed session screens rendered.");
} finally {
  await app.close();
}
