import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
import { git } from "../electron/core/repository";
let root: string, store: Store, service: Service;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "aether-recent-project-"));
  store = new Store(path.join(root, "data"));
  await store.open();
  service = new Service(store);
});
afterEach(async () => {
  await service.shutdown();
  store.close();
  await rm(root, { recursive: true, force: true });
});
async function projects() {
  await mkdir(path.join(root, "first"));
  await mkdir(path.join(root, "second"));
  const a = await service.addProject(path.join(root, "first"));
  const b = await service.addProject(path.join(root, "second"));
  for (const [project, year] of [
    [a, "2000"],
    [b, "2001"],
  ] as const) {
    project.createdAt = `${year}-01-01T00:00:00.000Z`;
    delete project.lastOpenedAt;
    store.put("project", project.id, project);
  }
  return [a, b];
}
it("persists most recently opened order across restart and preserves original Git changes", async () => {
  const [a, b] = await projects();
  expect((await service.snapshot()).projects[0].id).toBe(b.id);
  await writeFile(path.join(a.path, "notes.txt"), "Uncommitted user work\n");
  const before = await git(a.path, ["status", "--porcelain"]);
  await service.command("project.open", a.id);
  expect((await service.snapshot()).projects[0].id).toBe(a.id);
  expect(await git(a.path, ["status", "--porcelain"])).toBe(before);
  expect(await readFile(path.join(a.path, "notes.txt"), "utf8")).toBe(
    "Uncommitted user work\n",
  );
  await service.shutdown();
  store.close();
  store = new Store(path.join(root, "data"));
  await store.open();
  service = new Service(store);
  expect((await service.snapshot()).projects.map((p) => p.id)).toEqual([
    a.id,
    b.id,
  ]);
  await service.addProject(b.path);
  expect((await service.snapshot()).projects[0].id).toBe(b.id);
});
it("reports missing folders without advancing recency or changing another project", async () => {
  const [a, b] = await projects();
  await rm(a.path, { recursive: true });
  await expect(service.command("project.open", a.id)).rejects.toThrow(
    "Open local folder",
  );
  const saved = (await service.snapshot()).projects;
  expect(saved[0].id).toBe(b.id);
  expect(saved.find((p) => p.id === a.id)?.lastOpenedAt).toBeUndefined();
  await expect(
    service.command("project.open", "unknown-project"),
  ).rejects.toThrow("Project not found");
});
