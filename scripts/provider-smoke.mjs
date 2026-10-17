import { build } from "esbuild";
import { spawn } from "node:child_process";
await build({
  entryPoints: ["scripts/provider-smoke.ts"],
  outfile: "dist-electron/provider-smoke.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const child = spawn(process.execPath, ["dist-electron/provider-smoke.mjs"], {
  stdio: "inherit",
});
child.on("exit", (code) => process.exit(code ?? 1));
