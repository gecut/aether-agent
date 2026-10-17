import { build } from "esbuild";
import { spawn } from "node:child_process";
await build({
  entryPoints: ["scripts/performance.ts"],
  outfile: "artifacts/performance.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
});
const child = spawn(
  process.execPath,
  [
    "--cpu-prof",
    "--cpu-prof-dir=artifacts",
    "artifacts/performance.mjs",
    ...process.argv.slice(2),
  ],
  { stdio: "inherit" },
);
child.on("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
