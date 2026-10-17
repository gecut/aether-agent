import { build } from "esbuild";
import { execFileSync } from "node:child_process";
await build({
  entryPoints: ["scripts/live-ui.ts"],
  outfile: "dist-electron/live-ui.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
execFileSync(process.execPath, ["dist-electron/live-ui.mjs"], {
  stdio: "inherit",
});
