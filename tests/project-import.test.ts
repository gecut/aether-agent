import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  readdir,
  rm,
  symlink,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import {
  repositorySource,
  cloneRepository,
  ProjectImports,
} from "../electron/core/project-import";
import { starterSkills } from "../electron/core/starter-skills";
import { execute } from "../electron/core/process";
import * as processes from "../electron/core/process";
import { git } from "../electron/core/repository";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
let root: string, store: Store, service: Service;
beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "aether-import-test-"));
  store = new Store(path.join(root, "data"));
  await store.open();
  service = new Service(store);
});
afterEach(async () => {
  await service.shutdown();
  store.close();
  vi.restoreAllMocks();
  await rm(root, { recursive: true, force: true });
});
it("accepts GitHub shorthand and HTTPS Git hosts and rejects unsafe transports or embedded credentials", () => {
  expect(repositorySource("owner/project").url).toBe(
    "https://github.com/owner/project",
  );
  expect(
    repositorySource("https://gitlab.com/group/nested/project.git").name,
  ).toBe("project");
  for (const source of [
    "file:///tmp/repo",
    "ext::sh command",
    "ssh://git@github.com/a/b",
    "https://token@github.com/a/b",
    "https://github.com/a/b?token=private",
    "https://github.com/a/b/tree/main",
    "https://github.com/a/CON",
    "https://github.com/a/../..",
    "https://github.com/a/.git",
  ])
    expect(() => repositorySource(source)).toThrow();
});
async function original() {
  const folder = path.join(root, "external");
  await mkdir(folder);
  await git(folder, ["init", "--initial-branch=main"]);
  await writeFile(path.join(folder, "README.txt"), "Existing project\n");
  await writeFile(path.join(folder, ".gitattributes"), "*.txt filter=unsafe\n");
  await git(folder, ["add", "."]);
  await git(folder, [
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@aether.invalid",
    "commit",
    "-m",
    "Existing history",
  ]);
  return folder;
}
it("clones real Git history and files without running configured hooks, filters or project scripts", async () => {
  const source = await original(),
    parent = path.join(root, "clones");
  await mkdir(parent);
  const hooks = path.join(root, "host-hooks"),
    marker = path.join(root, "unexpected-execution");
  await mkdir(hooks);
  await writeFile(
    path.join(hooks, "post-checkout"),
    `#!/bin/sh\necho ran > '${marker}'\n`,
    { mode: 0o755 },
  );
  const config = path.join(root, "host-config");
  await writeFile(
    config,
    `[core]\n hooksPath = ${hooks}\n[filter "unsafe"]\n smudge = "echo ran > '${marker}'; cat"\n required = true\n`,
  );
  const request = repositorySource("https://example.com/team/imported.git");
  const run: typeof execute = async (binary, args, options = {}) => {
    const clone = args.indexOf("clone");
    const actual = [...args];
    if (clone >= 0) {
      actual[actual.indexOf(request.url)] = source;
      actual.splice(clone, 0, "-c", "protocol.file.allow=always");
    }
    return execute(binary, actual, {
      ...options,
      env: { GIT_CONFIG_GLOBAL: config, ...options.env },
    });
  };
  const cloned = await cloneRepository(
    request,
    parent,
    new AbortController().signal,
    () => {},
    run,
  );
  expect(await readFile(path.join(cloned, "README.txt"), "utf8")).toBe(
    "Existing project\n",
  );
  expect((await git(cloned, ["rev-parse", "HEAD"])).trim()).toBe(
    (await git(source, ["rev-parse", "HEAD"])).trim(),
  );
  expect((await git(cloned, ["branch", "--show-current"])).trim()).toBe("main");
  expect(await readdir(parent)).toEqual(["imported"]);
  await expect(readFile(marker)).rejects.toThrow();
});
it("refuses an existing destination without invoking Git or overwriting files", async () => {
  const parent = path.join(root, "clones");
  await mkdir(path.join(parent, "repo"), { recursive: true });
  await writeFile(path.join(parent, "repo", "keep.txt"), "user work");
  const run = vi.fn();
  await expect(
    cloneRepository(
      repositorySource("https://example.com/team/repo"),
      parent,
      new AbortController().signal,
      () => {},
      run,
    ),
  ).rejects.toThrow("already exists");
  expect(run).not.toHaveBeenCalled();
  expect(await readFile(path.join(parent, "repo", "keep.txt"), "utf8")).toBe(
    "user work",
  );
});
it("cancels a clone, cleans only its staging folder and persists cancellation", async () => {
  const parent = path.join(root, "clones");
  await mkdir(parent);
  const importer = new ProjectImports(store, vi.fn());
  const job = await importer.start("https://example.com/team/repo", parent);
  const cancelled = await importer.cancel(job.id);
  expect(cancelled.status).toBe("cancelled");
  expect(store.get("project-import", job.id)).toEqual(cancelled);
  expect(await readdir(parent)).toEqual([]);
  await importer.shutdown();
});
it("records failed and interrupted imports without registering a fake project", async () => {
  vi.spyOn(processes, "execute").mockResolvedValue({
    code: 1,
    stdout: "",
    stderr: "Authentication failed",
    durationMs: 1,
  });
  const register = vi.fn(),
    importer = new ProjectImports(store, register);
  const job = await importer.start("https://example.com/team/repo", root);
  for (let i = 0; i < 100 && importer.get(job.id).status === "cloning"; i++)
    await new Promise((resolve) => setTimeout(resolve, 5));
  expect(importer.get(job.id).status).toBe("failed");
  expect(register).not.toHaveBeenCalled();
  const interrupted = { ...job, id: randomUUID() };
  store.put("project-import", interrupted.id, interrupted);
  importer.recover();
  expect(importer.get(interrupted.id).status).toBe("failed");
  await importer.shutdown();
});
it("opens an external dirty repository and installs reviewed starter skills without changing its branch, index or history", async () => {
  const folder = await original();
  await writeFile(path.join(folder, "README.txt"), "Staged user work\n");
  await git(folder, ["add", "README.txt"]);
  const before = {
    head: await git(folder, ["rev-parse", "HEAD"]),
    index: await git(folder, ["diff", "--cached"]),
    branch: await git(folder, ["branch", "--show-current"]),
  };
  const project = await service.addProject(folder);
  expect(project.path).toBe(await realpath(folder));
  const selection = starterSkills().map(({ id, hash }) => ({ id, hash }));
  await expect(
    service.command("skill.starter.install", {
      projectId: project.id,
      skills: selection,
      reviewed: false,
    }),
  ).rejects.toThrow();
  const skills = (await service.command("skill.starter.install", {
    projectId: project.id,
    skills: selection,
    reviewed: true,
  })) as { enabled: boolean; reviewed: boolean; projectId: string }[];
  expect(skills).toHaveLength(2);
  expect(
    skills.every(
      (skill) =>
        skill.enabled && skill.reviewed && skill.projectId === project.id,
    ),
  ).toBe(true);
  expect(
    await readFile(
      path.join(folder, ".agents/skills/aether-project-workflow/SKILL.md"),
      "utf8",
    ),
  ).toContain("A skill grants no additional permissions");
  expect({
    head: await git(folder, ["rev-parse", "HEAD"]),
    index: await git(folder, ["diff", "--cached"]),
    branch: await git(folder, ["branch", "--show-current"]),
  }).toEqual(before);
});
it("requires the reviewed skill hash and preserves preexisting packages and external symlink targets", async () => {
  const folder = await original(),
    project = await service.addProject(folder),
    skill = starterSkills()[0];
  const install = (hash: string) =>
    service.command("skill.starter.install", {
      projectId: project.id,
      skills: [{ id: skill.id, hash }],
      reviewed: true,
    });
  await expect(install("0".repeat(64))).rejects.toThrow("Review");
  const outside = path.join(root, "outside");
  await mkdir(outside);
  await symlink(outside, path.join(folder, ".agents"));
  await expect(install(skill.hash)).rejects.toThrow();
  expect(await readdir(outside)).toEqual([]);
  await rm(path.join(folder, ".agents"));
  await mkdir(path.join(folder, ".agents/skills", skill.name), {
    recursive: true,
  });
  await writeFile(
    path.join(folder, ".agents/skills", skill.name, "SKILL.md"),
    "Existing user skill",
  );
  await expect(install(skill.hash)).rejects.toThrow("already exists");
  expect(
    await readFile(
      path.join(folder, ".agents/skills", skill.name, "SKILL.md"),
      "utf8",
    ),
  ).toBe("Existing user skill");
});
it("rejects bare repositories and Git metadata folders without reinitializing them", async () => {
  const bare = path.join(root, "bare.git");
  await mkdir(bare);
  await git(bare, ["init", "--bare"]);
  await expect(service.addProject(bare)).rejects.toThrow("working folder");
  await expect(readdir(path.join(bare, ".git"))).rejects.toThrow();
  const source = await original();
  await expect(service.addProject(path.join(source, ".git"))).rejects.toThrow(
    "working folder",
  );
});
