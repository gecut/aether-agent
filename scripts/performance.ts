import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { performance } from "node:perf_hooks";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
import { context, git } from "../electron/core/repository";
import {
  conversationContext,
  compactLog,
  efficiencyBudgets,
} from "../electron/core/efficiency";
import type { ChatMessage } from "../shared/types";
const directory = await mkdtemp(path.join(os.tmpdir(), "aether-performance-"));
try {
  const store = new Store(path.join(directory, "data"));
  await store.open(path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
  store.put("fixture", "history", {
    text: "Historical run evidence. ".repeat(12000),
  });
  const service = new Service(store);
  let exports = 0;
  const flush = store.flush.bind(store);
  store.flush = () => {
    exports++;
    flush();
  };
  const start = performance.now();
  for (let i = 0; i < 500; i++)
    service.emit(
      "benchmark",
      "agent.output",
      `output ${i}: ${"source evidence ".repeat(10)}`,
    );
  const enqueueMs = performance.now() - start;
  await new Promise((resolve) => setTimeout(resolve, 250));
  service.emit("benchmark", "task.completed", "Durable checkpoint");
  const persistenceMs = performance.now() - start - 250;
  const exportCount = exports;
  store.close();
  const restored = new Store(path.join(directory, "data"));
  await restored.open(path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
  const persistedEvents = restored.events("benchmark").length;
  restored.close();
  const project = path.join(directory, "project");
  await mkdir(path.join(project, "src"), { recursive: true });
  await git(project, ["init"]);
  await writeFile(
    path.join(project, "AGENTS.md"),
    "# Project rules\nPreserve tax rounding and verify calculations.\n" +
      "Project convention explanation.\n".repeat(100),
  );
  await writeFile(
    path.join(project, "package.json"),
    JSON.stringify({
      scripts: { test: "node --test" },
      description: "A realistic package description. ".repeat(100),
    }),
  );
  await writeFile(
    path.join(project, "README.md"),
    "Readme details.\n".repeat(400),
  );
  for (let i = 0; i < 70; i++)
    await writeFile(
      path.join(project, "src", `unrelated-${i}.ts`),
      `export function unrelated${i}() {\n` +
        "  // Display settings and visual preferences.\n".repeat(200) +
        "}\n",
    );
  await writeFile(
    path.join(project, "src", "orders.ts"),
    'import { roundCurrency } from "./money";\n' +
      "// Historical implementation details.\n".repeat(180) +
      "export function orderTotal(items: number[]) { return roundCurrency(items.reduce((a,b) => a+b, 0)); }\n",
  );
  await writeFile(
    path.join(project, "src", "money.ts"),
    "export function roundCurrency(value: number) { return Math.round(value * 100) / 100; }\n",
  );
  const retrievalStart = performance.now();
  let selected = "";
  for (let i = 0; i < 10; i++)
    selected = await Reflect.apply(context, undefined, [
      project,
      "Fix order total calculation",
      { files: ["src/orders.ts"], maxChars: 14000 },
    ]);
  const messages: ChatMessage[] = Array.from({ length: 40 }, (_, index) => ({
    id: String(index),
    role: index % 2 ? "assistant" : "user",
    at: "2026-10-18",
    content:
      `Message ${index}: ` +
      "Project discussion and relevant evidence. ".repeat(150),
  }));
  messages.push({
    id: "latest",
    role: "user",
    content: "Explain the order calculation",
    at: "2026-10-18",
  });
  const unbounded = messages
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
  const previousWindow = messages
    .slice(-12)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n\n");
  const conversation = conversationContext(
    messages,
    efficiencyBudgets("economy").chatBytes,
  );
  const repeatedLog =
    "PASS: fixture check\n".repeat(500) +
    "FAIL: preserve this failure\ntrace.ts:42";
  const result = {
    conversation: {
      fullEstimatedTokens: Math.ceil(Buffer.byteLength(unbounded) / 3),
      previousEstimatedTokens: Math.ceil(Buffer.byteLength(previousWindow) / 3),
      economyReductionVsPreviousPercent: Math.round(
        (1 -
          conversation.estimatedTokens /
            Math.ceil(Buffer.byteLength(previousWindow) / 3)) *
          100,
      ),
      economyEstimatedTokens: conversation.estimatedTokens,
      includedMessages: conversation.included,
      omittedMessages: conversation.omitted,
      retainsLatest: conversation.text.includes(messages.at(-1)!.content),
      storedMessages: messages.length,
    },
    logCompaction: {
      fullBytes: Buffer.byteLength(repeatedLog),
      compactedBytes: Buffer.byteLength(compactLog(repeatedLog)),
      retainsFailure: compactLog(repeatedLog).includes(
        "FAIL: preserve this failure",
      ),
    },
    events: 500,
    databaseExports: exportCount,
    enqueueMs: Math.round(enqueueMs * 100) / 100,
    persistenceMs: Math.round(persistenceMs * 100) / 100,
    persistedEvents,
    contextChars: selected.length,
    estimatedContextTokens: Math.ceil(Buffer.byteLength(selected) / 3),
    contextMeanMs:
      Math.round(((performance.now() - retrievalStart) * 100) / 10) / 100,
    includesOwnedFile: selected.includes("SOURCE: src/orders.ts"),
    includesTargetFunction: selected.includes("export function orderTotal"),
    includesProjectRules: selected.includes("Preserve tax rounding"),
  };
  const output = process.argv[2] ?? "artifacts/performance-after.json";
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
  if (process.argv[3]) {
    const before = JSON.parse(await readFile(process.argv[3], "utf8"));
    console.log(
      JSON.stringify(
        {
          estimatedContextTokenReductionPercent: Math.round(
            (1 -
              result.estimatedContextTokens / before.estimatedContextTokens) *
              100,
          ),
          databaseExportReductionPercent: Math.round(
            (1 - result.databaseExports / before.databaseExports) * 100,
          ),
        },
        null,
        2,
      ),
    );
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
