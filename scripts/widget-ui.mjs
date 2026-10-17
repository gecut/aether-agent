import { build } from "esbuild";
import { spawn } from "node:child_process";
await build({
  entryPoints: ["scripts/widget-ui.ts"],
  outfile: "dist-electron/widget-ui.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const child = spawn(process.execPath, ["dist-electron/widget-ui.mjs"], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
