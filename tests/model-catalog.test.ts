import { expect, it, vi, afterEach } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  codexModels,
  ModelDiscovery,
} from "../electron/providers/model-catalog";
import * as runtime from "../electron/providers/runtime";
afterEach(() => vi.restoreAllMocks());

it("queries the Codex read-only protocol, paginates, and keeps reasoning metadata", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "aether-models-"));
  const binary = path.join(dir, "codex");
  await writeFile(
    binary,
    `#!/usr/bin/env node
const rl = require('node:readline').createInterface({input:process.stdin});
rl.on('line', line => {
 const m=JSON.parse(line);
 if(m.method==='initialize') process.stdout.write(JSON.stringify({id:1,result:{}})+'\\n');
 else if(m.method==='model/list') process.stdout.write(JSON.stringify({id:2,result:{data:[{id:m.params.cursor?'second':'first',displayName:'Catalog model',defaultReasoningEffort:'high',supportedReasoningEfforts:[{reasoningEffort:'high'}]}],nextCursor:m.params.cursor?null:'next'}})+'\\n');
 else if(m.method!=='initialized') process.exit(2);
});`,
    { mode: 0o700 },
  );
  try {
    const result = await codexModels(binary, dir);
    expect(result.map((m) => m.id)).toEqual(["first", "second"]);
    expect(result[0].reasoning).toEqual(["high"]);
    expect(result[0].source).toBe("runtime");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it("coalesces API catalog requests and caches them until refresh", async () => {
  const api = vi.fn(async () => ["one", "two"]);
  const discovery = new ModelDiscovery(os.tmpdir(), api);
  const [a, b] = await Promise.all([
    discovery.list("compatible"),
    discovery.list("compatible"),
  ]);
  expect(a).toEqual(b);
  await discovery.list("compatible");
  expect(api).toHaveBeenCalledTimes(1);
  await discovery.list("compatible", true);
  expect(api).toHaveBeenCalledTimes(2);
});

it("does not fabricate installed models for a missing runtime", async () => {
  vi.spyOn(runtime, "findBinary").mockResolvedValue(undefined);
  const result = await new ModelDiscovery(os.tmpdir(), async () => []).list(
    "antigravity",
  );
  expect(result.models).toEqual([]);
  expect(result.error).toContain("Install and connect");
  const claude = await new ModelDiscovery(os.tmpdir(), async () => []).list(
    "claude",
  );
  expect(claude.models[0].source).toBe("published");
  expect(claude.error).toContain("Official aliases only");
});

it("rejects malformed API catalog entries before they reach the model picker", async () => {
  const discovery = new ModelDiscovery(
    os.tmpdir(),
    async () => [{ unsafe: "object" }] as unknown as string[],
  );
  const result = await discovery.list("compatible");
  expect(result.models).toEqual([]);
  expect(result.error).toContain("unsupported model catalog");
});
