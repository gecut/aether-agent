import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
import { git } from "../electron/core/repository";
import { defaults, type Run } from "../shared/types";
import { configureProviderRuntime } from "../electron/providers/runtime";
configureProviderRuntime(path.resolve(".cache/provider-runtime"));
const directory = await mkdtemp(
  path.join(os.tmpdir(), "aether-real-provider-"),
);
const projectDir = path.join(directory, "project");
await mkdir(projectDir);
await git(projectDir, ["init"]);
await writeFile(path.join(projectDir, "value.js"), "module.exports = 1;\n");
await writeFile(
  path.join(projectDir, "value.test.js"),
  "const test=require('node:test');const assert=require('node:assert/strict');test('value is two',()=>assert.equal(require('./value'),2));\n",
);
await git(projectDir, ["add", "."]);
await git(projectDir, [
  "-c",
  "user.name=Aether Smoke",
  "-c",
  "user.email=smoke@aether.invalid",
  "commit",
  "-m",
  "baseline",
]);
const store = new Store(path.join(directory, "data"));
await store.open(path.resolve("node_modules/sql.js/dist/sql-wasm.wasm"));
store.put("settings", "global", {
  ...defaults,
  timeoutSeconds: 600,
  retries: 0,
  concurrency: 1,
});
const service = new Service(store);
await service.initialize();
const project = await service.addProject(projectDir);
let lastType = "";
service.subscribe((event) => {
  if (event.type !== "agent.output") {
    console.log(event.type, event.taskId ?? "");
    lastType = event.type;
  } else if (/error|failed|unauthorized|reconnect/i.test(event.text))
    console.log("provider diagnostic:", event.text.slice(0, 300));
});
const wait = async (id: string, statuses: string[]) => {
  const deadline = Date.now() + 720000;
  while (Date.now() < deadline) {
    const r = service.run(id);
    if (statuses.includes(r.status)) return r;
    if (["failed", "cancelled"].includes(r.status)) throw new Error(r.reason);
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("Smoke run timed out at " + lastType);
};
try {
  const parent: Run = {
    id: "continuation-fixture",
    projectId: project.id,
    title: "Design fixture",
    objective: "First brainstorm the value change; do not code yet.",
    status: "completed",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    config: defaults,
    tasks: [
      {
        id: "design",
        title: "Design the value update",
        role: "architect",
        objective: "Describe the change",
        files: [],
        dependencies: [],
        acceptance: ["A concrete update is specified"],
        verification: "none",
        priority: 5,
        attempts: 1,
        status: "completed",
        output:
          "Implementation design: value.js should export 2. Existing value.test.js already verifies 2 with node --test. Only value.js needs to change.",
      },
    ],
  };
  service.save(parent);
  const run = (await service.command("run.continue", {
    runId: parent.id,
    objective:
      "Continue to implementation using the previous design. Use exactly one implementation task. In value.js change the exported number from 1 to 2. Do not change any other file. Run node --test to verify the existing test. The scope must be only value.js.",
  })) as Run;
  if (run.parentRunId !== parent.id)
    throw new Error("Missing continuation provenance");
  const plan = await wait(run.id, ["awaiting_approval"]);
  console.log("Plan:", JSON.stringify(plan.plan));
  await service.executeRun(run.id);
  await wait(run.id, ["awaiting_review"]);
  const deadline = Date.now() + 200000;
  while (!service.run(run.id).review && Date.now() < deadline)
    await new Promise((r) => setTimeout(r, 200));
  await service.shutdown();
  const prepared = service.run(run.id);
  if (
    prepared.plannerSnapshot?.core?.id !== "nexload" ||
    prepared.reviewSnapshot?.core?.profile !== "review" ||
    prepared.tasks.some((task) => task.snapshot?.core?.id !== "nexload")
  )
    throw new Error(
      "Missing Nexload core provenance in actual invocation snapshots",
    );
  for (const task of prepared.tasks.filter((t) => t.files.length)) {
    if (!task.team?.members.length || task.team.members.some((m) => !m.closed))
      throw new Error("Missing completed, closed coding team");
    for (const tool of ["delegate", "helper_result", "handoff"]) {
      if (
        !task.team.events.some(
          (e) => e.tool === tool && ["running", "completed"].includes(e.status),
        )
      )
        throw new Error("Missing collaboration evidence: " + tool);
    }
  }
  if (
    prepared.tasks.some(
      (t) => !t.tests?.length || t.tests.some((test) => test.exitCode),
    )
  )
    throw new Error("Missing passing verification evidence");
  if (
    (await readFile(path.join(projectDir, "value.js"), "utf8")).includes("= 2")
  )
    throw new Error("Original file changed before approval");
  await service.apply(run.id);
  const actual = await readFile(path.join(projectDir, "value.js"), "utf8");
  if (!/=\s*2/.test(actual)) throw new Error("Approved patch did not apply");
  console.log(
    JSON.stringify(
      {
        verified: true,
        provider: "codex",
        promptCore: prepared.plannerSnapshot?.core,
        status: service.run(run.id).status,
        teams: prepared.tasks.map((t) => t.team),
        test: prepared.tasks.map((t) => t.tests),
        dataDirectory: directory,
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error("REAL PROVIDER VERIFICATION FAILED:", String(error));
  console.error("Retained diagnostics:", directory);
  process.exitCode = 1;
} finally {
  await service.shutdown();
  store.close();
}
