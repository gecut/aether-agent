import { afterEach, expect, it, vi } from "vitest";
import * as process from "../electron/core/process";
import {
  GraphifyRuntime,
  graphifyArchitecture,
  graphifyFailure,
} from "../electron/core/graphify-runtime";

afterEach(() => vi.restoreAllMocks());
const mismatch =
  "ImportError: dlopen(tree_sitter/_binding.so): incompatible architecture (have 'arm64', need 'x86_64')";
const result = (code: number, stderr = "") => ({
  code,
  stdout: "",
  stderr,
  durationMs: 1,
});

it("recovers a Rosetta Python parser mismatch and remembers the successful architecture", async () => {
  const execute = vi
    .spyOn(process, "execute")
    .mockResolvedValueOnce(result(1, mismatch))
    .mockResolvedValue(result(0));
  const runtime = new GraphifyRuntime("darwin");
  const options = { signal: new AbortController().signal, timeoutMs: 60000 };
  const args = ["extract", "/stage with spaces", "--code-only", "--no-cluster"];
  expect((await runtime.run("/tools/graphify", args, options)).code).toBe(0);
  expect(execute.mock.calls[1]).toEqual([
    "/usr/bin/arch",
    ["-arm64", "/tools/graphify", ...args],
    options,
  ]);
  await runtime.run("/tools/graphify", args, options);
  expect(execute.mock.calls[2][0]).toBe("/usr/bin/arch");
  await runtime.run("/other/graphify", args, options);
  expect(execute.mock.calls[3][0]).toBe("/other/graphify");
});

it("supports an Intel parser mismatch and leaves unrelated errors or other platforms alone", async () => {
  expect(
    graphifyArchitecture(
      mismatch.replace(
        "have 'arm64', need 'x86_64'",
        "have 'x86_64', need 'arm64'",
      ),
      "darwin",
    ),
  ).toBe("-x86_64");
  const execute = vi
    .spyOn(process, "execute")
    .mockResolvedValue(result(1, mismatch));
  await new GraphifyRuntime("linux").run("graphify", [], {});
  expect(execute).toHaveBeenCalledTimes(1);
  execute.mockClear().mockResolvedValue(result(1, "Syntax error"));
  await new GraphifyRuntime("darwin").run("graphify", [], {});
  expect(execute).toHaveBeenCalledTimes(1);
  expect(graphifyFailure(mismatch)).toContain("Refresh graph");
  expect(graphifyFailure("Syntax error")).toContain("Syntax error");
});

it("does not remember a failed recovery or repeatedly retry the same invocation", async () => {
  const execute = vi
    .spyOn(process, "execute")
    .mockResolvedValue(result(1, mismatch));
  const runtime = new GraphifyRuntime("darwin");
  expect((await runtime.run("graphify", [], {})).code).toBe(1);
  expect(execute).toHaveBeenCalledTimes(2);
  await runtime.run("graphify", [], {});
  expect(execute.mock.calls[2][0]).toBe("graphify");
});
