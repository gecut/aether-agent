import { it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { buildContext } from "../electron/core/context";
import { Store } from "../electron/core/store";
import { reviewEvidence } from "../electron/core/review-evidence";
import type { Task } from "../shared/types";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aether-perf-test-"));
});
afterEach(async () => {
  vi.useRealTimers();
  await rm(directory, { recursive: true, force: true });
});
it("selects scoped code, relevant late-file lines, local dependencies and ancestor instructions within budget", async () => {
  await mkdir(path.join(directory, "src"));
  await writeFile(path.join(directory, "AGENTS.md"), "Preserve tax rounding.");
  await writeFile(
    path.join(directory, "src/AGENTS.md"),
    "Keep currency calculations deterministic.",
  );
  await writeFile(
    path.join(directory, "src/orders.ts"),
    'import { roundCurrency } from "./money.js";\n' +
      "// Unrelated introductory details.\n".repeat(200) +
      "export function orderTotal(value: number) { return roundCurrency(value); }\n",
  );
  await writeFile(
    path.join(directory, "src/money.ts"),
    "export const roundCurrency = (n: number) => Math.round(n*100)/100;",
  );
  await writeFile(
    path.join(directory, "src/unrelated.ts"),
    "UNRELATED FILE CONTENT",
  );
  const context = await buildContext(
    directory,
    "Fix order total calculations",
    [
      "AGENTS.md",
      "src/AGENTS.md",
      "src/orders.ts",
      "src/money.ts",
      "src/unrelated.ts",
    ],
    { files: ["src/orders.ts"], maxChars: 8000 },
  );
  expect(context.length).toBeLessThanOrEqual(8000);
  expect(context).toContain("export function orderTotal");
  expect(context).toContain("SOURCE: src/money.ts");
  expect(context).toContain("Preserve tax rounding");
  expect(context).toContain("Keep currency calculations deterministic");
  expect(context).not.toContain("UNRELATED FILE CONTENT");
  expect(context).toContain("Excerpt");
});
it("invalidates cached content on edits, removes deleted sources and redacts credentials", async () => {
  const file = path.join(directory, "orders.ts");
  await writeFile(file, "export const oldOrder = 1;");
  expect(await buildContext(directory, "orders", ["orders.ts"])).toContain(
    "oldOrder",
  );
  await writeFile(
    file,
    'export const newOrder = 200; const api_key="sk-abcdefghijklmnopqrstuvwxyz123456";',
  );
  const changed = await buildContext(directory, "orders", ["orders.ts"]);
  expect(changed).toContain("newOrder");
  expect(changed).not.toContain("oldOrder");
  expect(changed).not.toContain("abcdefghijklmnopqrstuvwxyz");
  await rm(file);
  expect(await buildContext(directory, "orders", ["orders.ts"])).not.toContain(
    "newOrder",
  );
});
it("rejects external symlinks and sensitive, binary or oversized context files", async () => {
  const outside = await mkdtemp(
    path.join(os.tmpdir(), "aether-context-outside-"),
  );
  try {
    await writeFile(path.join(outside, "orders.ts"), "OUTSIDE PRIVATE SOURCE");
    await symlink(
      path.join(outside, "orders.ts"),
      path.join(directory, "orders.ts"),
    );
    await writeFile(path.join(directory, ".env"), "ENV SECRET");
    await writeFile(
      path.join(directory, "orders-large.ts"),
      "LARGE PRIVATE CONTENT".repeat(10000),
    );
    await writeFile(
      path.join(directory, "orders-binary.ts"),
      Buffer.from([0, 1, 2, 3]),
    );
    const result = await buildContext(
      directory,
      "orders",
      ["orders.ts", ".env", "orders-large.ts", "orders-binary.ts"],
      { files: ["orders.ts"] },
    );
    expect(result).not.toContain("OUTSIDE PRIVATE SOURCE");
    expect(result).not.toContain("ENV SECRET");
    expect(result).not.toContain("LARGE PRIVATE CONTENT");
    expect(result).not.toContain("SOURCE:");
  } finally {
    await rm(outside, { recursive: true, force: true });
  }
});
it("retrieves objective matches and related imports without write scopes", async () => {
  await writeFile(
    path.join(directory, "orders.ts"),
    'import "./money";\nexport const totalOrders = 3;',
  );
  await writeFile(
    path.join(directory, "money.ts"),
    "export const currencyCode = 'USD';",
  );
  const result = await buildContext(directory, "Explain orders", [
    "orders.ts",
    "money.ts",
  ]);
  expect(result).toContain("SOURCE: orders.ts");
  expect(result).toContain("SOURCE: money.ts");
});
it("batches stream exports while keeping sequence order and durable lifecycle checkpoints", async () => {
  const store = new Store(directory);
  await store.open();
  vi.useFakeTimers();
  const flush = vi.spyOn(store, "flush");
  try {
    for (let i = 0; i < 130; i++)
      store.event(
        { runId: "run", type: "agent.output", text: String(i), at: "now" },
        false,
      );
    expect(flush).toHaveBeenCalledTimes(2);
    expect(store.events("run").map((event) => event.seq)).toEqual(
      Array.from({ length: 130 }, (_, i) => i + 1),
    );
    vi.advanceTimersByTime(200);
    expect(flush).toHaveBeenCalledTimes(3);
    store.event({
      runId: "run",
      type: "task.completed",
      text: "checkpoint",
      at: "now",
    });
    expect(flush).toHaveBeenCalledTimes(4);
  } finally {
    store.close();
  }
  const restored = new Store(directory);
  await restored.open();
  expect(restored.events("run")).toHaveLength(131);
  restored.close();
});
it("flushes the final streaming tail on close and clears its pending timer", async () => {
  const store = new Store(directory);
  await store.open();
  vi.useFakeTimers();
  store.event(
    { runId: "run", type: "agent.output", text: "last chunk", at: "now" },
    false,
  );
  store.close();
  expect(() => vi.runOnlyPendingTimers()).not.toThrow();
  const restored = new Store(directory);
  await restored.open();
  expect(restored.events("run")[0].text).toBe("last chunk");
  restored.close();
});
it("retains every test status, prioritizes failure evidence and leaves full logs untouched", () => {
  const task = {
    id: "one",
    tests: [
      {
        command: "npm test",
        exitCode: 0,
        durationMs: 1,
        at: "now",
        output: "passed ".repeat(1000),
      },
      {
        command: "npm run build",
        exitCode: 1,
        durationMs: 2,
        at: "now",
        output: "log ".repeat(1000) + "COMPILATION FAILED",
      },
    ],
  } as Task;
  const original = structuredClone(task);
  const summary = JSON.parse(reviewEvidence([task], 300));
  expect(
    summary.tasks[0].tests.map((test: { exitCode: number }) => test.exitCode),
  ).toEqual([0, 1]);
  expect(summary.tasks[0].tests[1].output).toContain("COMPILATION FAILED");
  expect(
    summary.tasks[0].tests.reduce(
      (total: number, test: { output: string }) => total + test.output.length,
      0,
    ),
  ).toBeLessThanOrEqual(300);
  expect(task).toEqual(original);
});
