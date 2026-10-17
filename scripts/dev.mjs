import { spawn } from "node:child_process";
import { createServer } from "vite";
await import("./build.mjs");
const server = await createServer();
await server.listen();
const child = spawn("node_modules/.bin/electron", ["."], {
  stdio: "inherit",
  env: { ...process.env, AETHER_DEV_URL: "http://127.0.0.1:5173" },
});
const stop = async () => {
  child.kill();
  await server.close();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", async () => {
  await server.close();
  process.exit();
});
