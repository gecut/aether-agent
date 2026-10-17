import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import os from "node:os";
import path from "node:path";
const exec = promisify(execFile);
const script = path.resolve("scripts/publish-release.mjs");
let directory: string;
const assets = [
  ...["arm64", "x64"].flatMap((arch) =>
    ["dmg", "zip"].map((ext) => `aether-code-0.1.9-mac-${arch}.${ext}`),
  ),
  ...["exe", "zip"].map((ext) => `aether-code-0.1.9-win-x64.${ext}`),
  ...[
    ["AppImage", "x86_64"],
    ["deb", "amd64"],
  ].map(([ext, arch]) => `aether-code-0.1.9-linux-${arch}.${ext}`),
];
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aether-release-"));
  await mkdir(path.join(directory, "bin"));
  await mkdir(path.join(directory, "release-assets"));
  await writeFile(
    path.join(directory, "package.json"),
    JSON.stringify({ version: "0.1.9" }),
  );
  await writeFile(
    path.join(directory, "bin", "gh"),
    `#!${process.execPath}\nconst fs=require('node:fs');const args=process.argv.slice(2);fs.appendFileSync('calls.jsonl',JSON.stringify(args)+'\\n');if(args[1]==='view')process.exit(1);if(args[1]==='upload'&&process.env.FAIL_UPLOAD)process.exit(1);\n`,
    { mode: 0o700 },
  );
  for (const file of assets)
    await writeFile(path.join(directory, "release-assets", file), "abc");
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
const run = (env = {}) =>
  exec(process.execPath, [script], {
    cwd: directory,
    env: {
      ...process.env,
      PATH: path.join(directory, "bin") + path.delimiter + process.env.PATH,
      GITHUB_REPOSITORY: "example/aether",
      GITHUB_SHA: "a".repeat(40),
      GITHUB_RUN_ID: "123",
      GITHUB_RUN_NUMBER: "5",
      GITHUB_REF_NAME: "main",
      ...env,
    },
  });
const calls = async () =>
  (await readFile(path.join(directory, "calls.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
it("rejects partial distributions before creating a release", async () => {
  await rm(path.join(directory, "release-assets", assets[0]));
  await expect(run()).rejects.toThrow("exactly all eight");
  await expect(calls()).rejects.toThrow("ENOENT");
});
it("creates a draft, uploads all assets and hashes, then publishes", async () => {
  await run();
  const commands = await calls();
  expect(commands.map((args) => args[1])).toEqual([
    "view",
    "create",
    "upload",
    "edit",
  ]);
  expect(commands[1]).toContain("--draft");
  expect(commands[1]).toContain("--prerelease");
  expect(commands[1]).toContain("a".repeat(40));
  expect(
    commands[2].filter((arg: string) => arg.startsWith("release-assets/")),
  ).toHaveLength(9);
  expect(commands[3]).toContain("--draft=false");
  const sums = await readFile(
    path.join(directory, "release-assets", "SHA256SUMS.txt"),
    "utf8",
  );
  expect(sums.trim().split("\n")).toHaveLength(8);
  expect(sums).toContain(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
it("leaves a draft unpublished if uploading fails", async () => {
  await expect(run({ FAIL_UPLOAD: "1" })).rejects.toThrow();
  expect((await calls()).map((args) => args[1])).toEqual([
    "view",
    "create",
    "upload",
  ]);
});
