import { beforeEach, afterEach, it, expect, vi } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../electron/core/store";
import { execute } from "../electron/core/process";
import {
  ProviderConnections,
  classifyConnection,
  loginScript,
} from "../electron/providers/connections";
let directory: string, store: Store, oldPath: string | undefined;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aether-oauth-test-"));
  store = new Store(path.join(directory, "data"));
  await store.open();
  oldPath = process.env.PATH;
  process.env.PATH = directory + path.delimiter + oldPath;
});
afterEach(async () => {
  process.env.PATH = oldPath;
  store.close();
  await rm(directory, { recursive: true, force: true });
});
async function binary(name: string, body: string) {
  const file = path.join(directory, name);
  await writeFile(file, `#!${process.execPath}\n${body}`, { mode: 0o700 });
  return file;
}
it("preserves an existing Codex OAuth login without launching another flow", async () => {
  await binary("codex", "console.log('Logged in using ChatGPT')");
  const launch = vi.fn();
  const connections = new ProviderConnections(store, launch, () => {});
  expect((await connections.connect("codex")).state).toBe("signed-in");
  expect(launch).not.toHaveBeenCalled();
});
it("launches only the official login command and does not claim success before verification", async () => {
  await binary(
    "codex",
    "if(process.argv.includes('status')){console.error('Not logged in');process.exitCode=1;}",
  );
  const launch = vi.fn(async (_file: string) => {});
  const connections = new ProviderConnections(store, launch, () => {});
  const status = await connections.connect("codex");
  expect(status.state).toBe("awaiting-signin");
  expect(launch).toHaveBeenCalledOnce();
  const script = await readFile(launch.mock.calls[0][0] as string, "utf8");
  expect(script.startsWith("#!/bin/sh\n")).toBe(true);
  expect(script).toContain("'login'");
  expect(script).toContain("unset OPENAI_API_KEY");
  expect(script).not.toContain("--dangerously");
});
it("quotes native login paths and uses a dedicated empty workspace", async () => {
  const cwd = path.join(directory, "workspace's folder");
  await mkdir(cwd);
  const executable = await binary(
    "codex'; echo injected; '",
    "console.log(JSON.stringify({args:process.argv.slice(2),cwd:process.cwd()}))",
  );
  const file = path.join(directory, "login.command");
  await writeFile(file, loginScript(executable, "codex", cwd));
  const result = await execute("/bin/sh", [file]);
  const last = JSON.parse(result.stdout.trim().split("\n").at(-1)!);
  expect(last.args).toEqual(["login"]);
  expect(last.cwd).toBe(await realpath(cwd));
});
it("separates account eligibility blocks from signed-out and transport errors", () => {
  expect(
    classifyConnection(
      "antigravity",
      "Eligibility check failed: not available in your location",
    ).state,
  ).toBe("blocked");
  expect(classifyConnection("codex", "Not logged in").state).toBe("signed-out");
  expect(
    classifyConnection("antigravity", "network connection failed").state,
  ).toBe("error");
});
it("requires a successful actual Antigravity response, not an installed binary or model list", async () => {
  await binary(
    "agy",
    "console.log(JSON.stringify({status:'ERROR',error:'Eligibility check failed: not available in your location'}));process.exitCode=1;",
  );
  const connections = new ProviderConnections(
    store,
    async () => {},
    () => {},
  );
  expect((await connections.verify("antigravity")).state).toBe("blocked");
  expect(connections.status("antigravity")?.state).toBe("blocked");
  await binary(
    "agy",
    "console.log(JSON.stringify({status:'SUCCESS',response:'AETHER_CONNECTION_OK'}))",
  );
  expect((await connections.verify("antigravity")).state).toBe("signed-in");
});
it("does not reuse API-key authentication when ChatGPT OAuth was requested", async () => {
  await binary(
    "codex",
    "if(process.argv.includes('status'))console.log('Logged in using an API key');",
  );
  const launch = vi.fn(async (_file: string) => {});
  const connections = new ProviderConnections(store, launch, () => {});
  expect((await connections.connect("codex")).state).toBe("awaiting-signin");
  expect(launch).toHaveBeenCalledOnce();
});
