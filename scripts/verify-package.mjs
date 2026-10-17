import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { listPackage, extractFile } from "@electron/asar";

const [platform, arch] = process.argv.slice(2);
assert(["mac", "win", "linux"].includes(platform), "Unsupported platform");
assert(["arm64", "x64"].includes(arch), "Unsupported architecture");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const root =
  platform === "mac"
    ? path.join(
        "release",
        arch === "arm64" ? "mac-arm64" : "mac",
        "Aether Code.app",
        "Contents",
        "Resources",
      )
    : path.join(
        "release",
        platform === "win" ? "win-unpacked" : "linux-unpacked",
        "resources",
      );
const archive = path.join(root, "app.asar");
const files = listPackage(archive).map((file) => file.replaceAll("\\", "/"));
for (const file of [
  "/dist/index.html",
  "/dist-electron/main.cjs",
  "/dist-electron/preload.cjs",
  "/dist-electron/widget-preload.cjs",
  "/dist-electron/sql-wasm.wasm",
  "/LICENSE",
  "/THIRD_PARTY_NOTICES.md",
])
  assert(files.includes(file), `Missing packaged file: ${file}`);
assert(
  !files.some((file) =>
    /(?:provider-smoke|live-ui|widget-ui|readme-assets)\.mjs$/.test(file),
  ),
  "Development harness shipped",
);
assert.equal(
  JSON.parse(extractFile(archive, "package.json").toString()).version,
  version,
);
const extensions = {
  mac: ["dmg", "zip"],
  win: ["exe", "zip"],
  linux: ["AppImage", "deb"],
}[platform];
for (const extension of extensions) {
  const artifactArch =
    platform === "linux" && arch === "x64"
      ? extension === "deb"
        ? "amd64"
        : "x86_64"
      : arch;
  await access(
    path.join(
      "release",
      `aether-code-${version}-${platform}-${artifactArch}.${extension}`,
    ),
  );
}
console.log(
  `Verified ${platform}/${arch}: package contents, version, and ${extensions.join(" + ")}`,
);
