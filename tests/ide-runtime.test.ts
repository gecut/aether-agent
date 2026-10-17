import { expect, it } from "vitest";
import { validateArchiveEntries } from "../electron/ide/runtime";
import { ideRelease } from "../electron/ide/release";

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
