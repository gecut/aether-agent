import { build } from "esbuild";
import { mkdir, copyFile } from "node:fs/promises";
await mkdir("dist-electron", { recursive: true });
await build({
  entryPoints: ["electron/main.ts"],
  outfile: "dist-electron/main.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron", "sql.js"],
  sourcemap: true,
});
await build({
  entryPoints: ["electron/preload.ts"],
  outfile: "dist-electron/preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["electron/widget-preload.ts"],
  outfile: "dist-electron/widget-preload.cjs",
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["electron"],
});
await copyFile(
  "node_modules/sql.js/dist/sql-wasm.wasm",
  "dist-electron/sql-wasm.wasm",
);
