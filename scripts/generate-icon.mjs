// Ava geometry uses the vendored MIT-licensed Bloub engine; see THIRD_PARTY_NOTICES.md.
import { build } from "esbuild";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const bundled = await build({
  stdin: {
    resolveDir: process.cwd(),
    contents: `import { BotEngine } from './src/vendor/bloub/engine';
import { EXPRESSION_BY_ID } from './src/vendor/bloub/expressions';
import { PROFILE_SAMPLES } from './src/vendor/bloub/profiles';
const body = Array.from({length: PROFILE_SAMPLES}, (_, i) => {
  const a = i / PROFILE_SAMPLES * Math.PI * 2;
  return .94 + .075 * Math.cos(5 * a - Math.PI / 2) + .035 * Math.sin(3 * a);
});
const engine = new BotEngine(100, 'idle', body, EXPRESSION_BY_ID.get('curieux'));
engine.setLook({yaw: 12, pitch: 7, mix: 1, spin: 0, wander: 0}, 0);
export default engine.sample(1);`,
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const { default: frame } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundled.outputFiles[0].text).toString("base64")
);
const face = `<path d="${frame.bodyPath}" fill="#a8e3d5"/><g fill="#214c46">${frame.eyes.map((eye) => `<path d="${eye.d}" transform="${eye.matrix}" opacity="${eye.alpha}"/>`).join("")}</g>`;
const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="-120 -120 240 240">${face}</svg>`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><defs><linearGradient id="tile" x2="0" y2="1"><stop stop-color="#263537"/><stop offset="1" stop-color="#111a1d"/></linearGradient><filter id="shadow" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dy="12" stdDeviation="12" flood-color="#071112" flood-opacity=".35"/></filter></defs><rect x="36" y="36" width="952" height="952" rx="218" fill="url(#tile)"/><rect x="39" y="39" width="946" height="946" rx="215" fill="none" stroke="#688f89" stroke-opacity=".3" stroke-width="3"/><g transform="translate(512 512) scale(3.6)" filter="url(#shadow)">${face}</g></svg>`;
await mkdir("build", { recursive: true });
await writeFile("build/ava.svg", logo);
await writeFile("build/icon.svg", icon);
await writeFile("website/assets/ava-logo.svg", logo);
const browser = await chromium.launch({ channel: "chrome" });
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async (svg) => {
    const image = new Image();
    image.src = "data:image/svg+xml;base64," + btoa(svg);
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    canvas.getContext("2d").drawImage(image, 0, 0);
    return canvas.toDataURL("image/png").split(",")[1];
  }, icon);
  await writeFile("build/icon.png", Buffer.from(png, "base64"));
} finally {
  await browser.close();
}
console.log(
  "Generated Ava logo and 1024px application icon from the existing mascot geometry.",
);
