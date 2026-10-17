import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
import type { Run, Plan } from "../shared/types";

let directory: string;
let service: Service;
let store: Store;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aether-continue-"));
  await mkdir(path.join(directory, "project"));
  store = new Store(path.join(directory, "data"));
  await store.open();
  service = new Service(store);
  vi.spyOn(service.registry, "diagnostics").mockResolvedValue([
    {
      id: "codex",
      name: "Fixture",
      installed: true,
      authenticated: true,
      verified: true,
      models: [],
      kind: "supported-cli",
      detail: "Fixture",
      capabilities: {
        planning: true,
        coding: true,
        streaming: true,
        cancellation: true,
      },
    },
  ]);
  await service.initialize();
});
afterEach(async () => {
  await service.shutdown();
  store.close();
  await rm(directory, { recursive: true, force: true });
});
const plan = (coding: boolean): Plan => ({
  title: coding ? "Implement design" : "Brainstorm design",
  summary: "Fixture",
  tasks: [
    {
      id: "task-1",
      title: "Design",
      role: coding ? "implementer" : "architect",
      objective: coding
        ? "Write the designed greeting"
        : "Discuss a greeting; do not write code",
      files: coding ? ["greeting.js"] : [],
      dependencies: [],
      acceptance: ["Greeting follows the design"],
      verification: "none",
      priority: 5,
    },
  ],
});
async function settled(id: string) {
  await vi.waitFor(() =>
    expect(
      ["initializing", "running", "queued"].includes(service.run(id).status),
    ).toBe(false),
  );
  // The lifecycle event is synchronous, but the provider controller is released on its final microtask.
  await new Promise((resolve) => setTimeout(resolve, 10));
  return service.run(id);
}
it("continues a read-only design into approved coding with preserved deliverables", async () => {
  const project = await service.addProject(path.join(directory, "project"));
  let implementing = false;
  const modes: string[] = [];
  vi.spyOn(service.registry, "get").mockReturnValue({
    id: "codex",
    diagnose: async () => ({}) as never,
    run: async (input) => {
      modes.push(input.mode);
      if (input.mode === "plan") {
        if (implementing) {
          expect(input.prompt).toContain("Concrete design: greet in Persian");
          expect(input.prompt).toContain("current request supersedes");
        }
        return { text: JSON.stringify(plan(implementing)) };
      }
      if (input.mode === "code") {
        expect(input.prompt).toContain("Concrete design: greet in Persian");
        await writeFile(
          path.join(input.cwd, "greeting.js"),
          'console.log("سلام");\n',
        );
        return { text: "Wrote greeting" };
      }
      return { text: "Concrete design: greet in Persian" };
    },
  });
  const first = await service.createRun(
    project.id,
    "First brainstorm and describe the greeting without code",
  );
  expect((await settled(first.id)).status).toBe("awaiting_approval");
  await service.executeRun(first.id);
  expect((await settled(first.id)).status).toBe("completed");
  expect(modes).not.toContain("code");
  implementing = true;
  const next = (await service.command("run.continue", {
    runId: first.id,
    objective: "Implement the greeting from this design",
  })) as Run;
  expect((await settled(next.id)).status).toBe("awaiting_approval");
  expect(next.parentRunId).toBe(first.id);
  expect(service.run(first.id).status).toBe("completed");
  expect(modes.filter((mode) => mode === "code")).toHaveLength(0);
  await service.executeRun(next.id);
  const result = await settled(next.id);
  expect(result.status).toBe("awaiting_review");
  expect(result.patch).toContain('console.log("سلام")');
  expect(modes.filter((mode) => mode === "code")).toHaveLength(1);
  await expect(
    service.command("run.continue", {
      runId: next.id,
      objective: "Implement another greeting",
    }),
  ).rejects.toThrow("Finish or apply");
  await service.apply(next.id);
  expect(service.run(next.id).status).toBe("completed");
});
it("refuses another read-only plan for an explicit implementation continuation", async () => {
  const project = await service.addProject(path.join(directory, "project"));
  const parent: Run = {
    id: "parent",
    projectId: project.id,
    title: "Design",
    objective: "Brainstorm",
    status: "completed",
    tasks: [],
    config: service.settings(),
    createdAt: "now",
    updatedAt: "now",
  };
  service.save(parent);
  vi.spyOn(service.registry, "get").mockReturnValue({
    id: "codex",
    diagnose: async () => ({}) as never,
    run: async () => ({ text: JSON.stringify(plan(false)) }),
  });
  const next = (await service.command("run.continue", {
    runId: parent.id,
    objective: "Implement design",
  })) as Run;
  const result = await settled(next.id);
  expect(result.status).toBe("failed");
  expect(result.reason).toContain("only read-only tasks");
  expect(result.tasks).toEqual([]);
});
