import { build } from "esbuild";
import { execFileSync } from "node:child_process";
await build({
  entryPoints: ["scripts/readme-assets.ts"],
  outfile: "artifacts/readme-assets.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
execFileSync(process.execPath, ["artifacts/readme-assets.mjs"], {
  stdio: "inherit",
});
