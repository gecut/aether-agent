import { _electron as electron } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { AsteriskSimple } from "@phosphor-icons/react";
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
  await mkdir("build", { recursive: true });
  const icon = renderToStaticMarkup(
    createElement(AsteriskSimple, {
      size: 560,
      weight: "bold",
      color: "#bdd0ff",
    }),
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="36" y="36" width="952" height="952" rx="218" fill="#161e2f"/><rect x="51" y="51" width="922" height="922" rx="205" stroke="#34496e" stroke-width="4" fill="none"/><svg x="232" y="232" width="560" height="560" viewBox="0 0 256 256">${icon.replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "")}</svg></svg>`;
  await writeFile("build/icon.svg", svg);
  const png = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = "data:image/svg+xml;base64," + btoa(source);
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 1024;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, svg);
  await writeFile("build/icon.png", Buffer.from(png, "base64"));
  console.log("Real completed session screens and application icon rendered.");
} finally {
  await app.close();
}
