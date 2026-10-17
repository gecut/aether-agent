import { expect, it } from "vitest";
import { IDERuntime, validateArchiveEntries } from "../electron/ide/runtime";
import type { Session } from "electron";
import { ideRelease } from "../electron/ide/release";
import { runtimeTar, runtimeArchiveError } from "../electron/ide/archive";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

it("rejects archive path escapes before extracting executable code", () => {
  expect(() =>
    validateArchiveEntries(
      "code-server/lib/node\ncode-server/out/node/entry.js\n",
    ),
  ).not.toThrow();
  for (const name of [
    "../escape",
    "/absolute",
    "C:\\escape",
    "code-server/../../escape",
    "code-server\\..\\escape",
  ])
    expect(() => validateArchiveEntries(name)).toThrow("unsafe paths");
  expect(() => validateArchiveEntries("file\n".repeat(100001))).toThrow(
    "unsafe paths",
  );
});

it("pins each supported native runtime to a release digest and download size", () => {
  expect(Object.keys(ideRelease.assets)).toEqual([
    "darwin-arm64",
    "darwin-x64",
    "linux-x64",
    "linux-arm64",
    "win32-x64",
  ]);
  for (const asset of Object.values(ideRelease.assets)) {
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(asset.bytes).toBeGreaterThan(100_000_000);
  }
});

it("extracts with the system archive tool even with an unusable application PATH", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "aether-archive-"));
  const original = process.env.PATH;
  try {
    await mkdir(path.join(directory, "runtime"));
    await mkdir(path.join(directory, "installed runtime"));
    await writeFile(
      path.join(directory, "runtime", "entry.js"),
      "verified fixture",
    );
    const archive = path.join(directory, "runtime.tar.gz");
    expect(
      (await runtimeTar(["-czf", archive, "-C", directory, "runtime"])).code,
    ).toBe(0);
    process.env.PATH = path.join(directory, "missing-tools");
    const result = await runtimeTar([
      "-xzf",
      archive,
      "--strip-components=1",
      "--no-same-owner",
      "-C",
      path.join(directory, "installed runtime"),
    ]);
    expect(result.code, result.stderr).toBe(0);
    expect(
      await readFile(
        path.join(directory, "installed runtime", "entry.js"),
        "utf8",
      ),
    ).toBe("verified fixture");
  } finally {
    process.env.PATH = original;
    await rm(directory, { recursive: true, force: true });
  }
});

it("explains extraction failures without discarding the archive tool's diagnostic", () => {
  expect(runtimeArchiveError("tar: No space left on device")).toContain(
    "disk space",
  );
  expect(runtimeArchiveError("tar: Permission denied")).toContain(
    "permissions",
  );
  expect(runtimeArchiveError("tar: invalid archive")).toContain(
    "invalid archive",
  );
  expect(runtimeArchiveError("")).toContain("without an error message");
});

it("does not treat a partial installation as ready just because its manifest exists", async () => {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "aether-partial-ide-"),
  );
  try {
    const asset =
      ideRelease.assets[
        `${process.platform}-${process.arch}` as keyof typeof ideRelease.assets
      ];
    if (!asset) return;
    const root = path.join(
      directory,
      "ide-runtime",
      `code-server-${ideRelease.version}-${process.platform}-${process.arch}`,
    );
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, "aether-runtime.json"),
      JSON.stringify({ version: 1, sha256: asset.sha256 }),
    );
    const runtime = new IDERuntime(directory, {} as Session);
    const status = await runtime.status();
    expect(status.state).toBe("error");
    expect(status.error).toContain("Set up the full IDE again");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
