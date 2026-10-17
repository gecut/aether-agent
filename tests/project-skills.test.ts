import { it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtemp,
  writeFile,
  readFile,
  mkdir,
  rm,
  symlink,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { prepareProject } from "../electron/core/project-setup";
import {
  SkillCatalog,
  copyProjectSkills,
} from "../electron/core/skill-catalog";
import { git } from "../electron/core/repository";
import * as repository from "../electron/core/repository";
import { Store } from "../electron/core/store";
import { Service } from "../electron/core/service";
import { defaults } from "../shared/types";
import { parseSkill } from "../electron/core/prompts";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "aether-project-"));
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
it("initializes a folder, preserves binary bytes, excludes secrets, and resolves a child to the existing root", async () => {
  await writeFile(path.join(directory, "README.md"), "# Project");
  const binary = Buffer.from([0, 255, 200, 3]);
  await writeFile(path.join(directory, "asset.bin"), binary);
  await writeFile(path.join(directory, ".env"), "TOKEN=private");
  await writeFile(path.join(directory, "config.txt"), "password=private-value");
  await mkdir(path.join(directory, "child"));
  expect(await prepareProject(directory)).toBe(await realpath(directory));
  expect(await git(directory, ["status", "--short"])).toBe("");
  expect(await git(directory, ["ls-tree", "--name-only", "HEAD"])).toContain(
    "asset.bin",
  );
  expect(await readFile(path.join(directory, "asset.bin"))).toEqual(binary);
  expect(
    await git(directory, ["ls-tree", "--name-only", "HEAD"]),
  ).not.toContain("config.txt");
  expect(await prepareProject(path.join(directory, "child"))).toBe(
    await realpath(directory),
  );
  const head = await git(directory, ["rev-parse", "HEAD"]);
  await writeFile(path.join(directory, "README.md"), "user edit");
  await prepareProject(directory);
  expect(await git(directory, ["rev-parse", "HEAD"])).toBe(head);
  expect(await git(directory, ["status", "--short"])).toContain("README.md");
});
it("creates an empty initial commit and preserves a user-staged unborn index", async () => {
  await prepareProject(directory);
  expect((await git(directory, ["rev-parse", "HEAD"])).trim()).toMatch(
    /^[a-f0-9]{40}$/,
  );
  const other = path.join(directory, "other");
  await mkdir(other);
  await git(other, ["init", "--initial-branch=main"]);
  await writeFile(path.join(other, "user.txt"), "staged");
  await git(other, ["add", "user.txt"]);
  await expect(prepareProject(other)).rejects.toThrow("staged files");
  expect(await git(other, ["diff", "--cached", "--name-only"])).toContain(
    "user.txt",
  );
});
it("parses real folded YAML descriptions", () => {
  expect(
    parseSkill(
      "---\nname: example\ndescription: >-\n  A useful\n  workflow\n---\nInstructions",
    ).description,
  ).toBe("A useful workflow");
});
function fixture(corrupt = false, linked = false) {
  const commit = "a".repeat(40);
  const content =
    "---\nname: example\ndescription: A test workflow\n---\nRead references/guide.md before working.";
  const files = {
    "skills/.curated/example/SKILL.md": content,
    "skills/.curated/example/references/guide.md": "Reference content",
    LICENSE: "License notice",
  };
  const tree = Object.entries(files).map(([file, body]) => ({
    path: file,
    type: "blob",
    mode: linked ? "120000" : "100644",
    size: Buffer.byteLength(body),
    sha: createHash("sha1")
      .update(`blob ${Buffer.byteLength(body)}\0${body}`)
      .digest("hex"),
  }));
  const request = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.startsWith("https://raw.githubusercontent.com/")) {
      const file = url.split(`/${commit}/`)[1];
      return new Response(
        corrupt && !file.endsWith("SKILL.md")
          ? "tampered"
          : files[file as keyof typeof files],
      );
    }
    if (!url.includes("openai/skills"))
      return new Response("unavailable", { status: 503 });
    const data = url.includes("/git/trees/")
      ? { tree, truncated: false }
      : url.includes("/commits/")
        ? { sha: commit }
        : { default_branch: "main", stargazers_count: 123 };
    return Response.json(data);
  }) as typeof fetch;
  return new SkillCatalog(request);
}
it("lists partial-source results, reviews, installs resources locally, refuses overwrite and detects edited resources", async () => {
  await prepareProject(directory);
  const catalog = fixture();
  const result = await catalog.search("example");
  expect(result.skills).toHaveLength(1);
  expect(result.errors).toHaveLength(2);
  const preview = await catalog.preview(result.skills[0].id);
  expect(preview.files).toContain("references/guide.md");
  expect(preview.files).toContain("SOURCE-LICENSE");
  const project = { id: "one", path: directory };
  const skill = await catalog.install(preview.token, project);
  expect(skill.projectId).toBe("one");
  expect(skill.enabled).toBe(true);
  expect(await git(directory, ["status", "--short"])).toBe("");
  const worker = path.join(directory, "worker");
  await mkdir(worker);
  await copyProjectSkills(project, worker, [skill]);
  expect(
    await readFile(
      path.join(worker, skill.installPath!, "references/guide.md"),
      "utf8",
    ),
  ).toBe("Reference content");
  const again = await catalog.preview(result.skills[0].id);
  await expect(catalog.install(again.token, project)).rejects.toThrow();
  await writeFile(
    path.join(directory, skill.installPath!, "references/guide.md"),
    "changed",
  );
  await expect(copyProjectSkills(project, worker, [skill])).rejects.toThrow(
    /changed|EEXIST/,
  );
});
it("rejects corrupt downloads and symlink packages without installing them", async () => {
  await prepareProject(directory);
  const catalog = fixture(true);
  const result = await catalog.search("");
  const preview = await catalog.preview(result.skills[0].id);
  await expect(
    catalog.install(preview.token, { id: "one", path: directory }),
  ).rejects.toThrow("integrity");
  const links = fixture(false, true);
  const list = await links.search("");
  await expect(links.preview(list.skills[0].id)).rejects.toThrow(
    "links/submodules",
  );
});
it("refuses project skill directories that are symlinks", async () => {
  await prepareProject(directory);
  const target = path.join(directory, "elsewhere");
  await mkdir(target);
  await symlink(target, path.join(directory, ".agents"));
  const catalog = fixture();
  const list = await catalog.search("");
  const preview = await catalog.preview(list.skills[0].id);
  await expect(
    catalog.install(preview.token, { id: "one", path: directory }),
  ).rejects.toThrow("symlinks");
});

it("limits installed prompt skills to their project and excludes disabled versions", async () => {
  const store = new Store(path.join(directory, "data"));
  await store.open();
  try {
    const service = new Service(store);
    const skill = {
      id: "skill",
      name: "example",
      description: "test",
      content: "PROJECT ONLY INSTRUCTIONS",
      version: 1,
      enabled: true,
      reviewed: true,
      roles: ["*"],
      createdAt: new Date().toISOString(),
      projectId: "one",
    };
    store.put("skill", skill.id, skill);
    expect(
      service
        .layers("implementer", defaults.coder, "task", "", "one")
        .some((layer) => layer.id === "skill-skill"),
    ).toBe(true);
    expect(
      service
        .layers("implementer", defaults.coder, "task", "", "two")
        .some((layer) => layer.id === "skill-skill"),
    ).toBe(false);
    await service.command("skill.toggle", skill.id);
    expect(
      service
        .layers("implementer", defaults.coder, "task", "", "one")
        .some((layer) => layer.id === "skill-skill"),
    ).toBe(false);
  } finally {
    store.close();
  }
});

it("falls back to a pinned Git catalog when the public API is rate limited", async () => {
  const revision = "a".repeat(40);
  const spy = vi
    .spyOn(repository, "git")
    .mockImplementation(async (_cwd, args) => {
      if (args.includes("clone")) return "";
      if (args.includes("rev-parse")) return revision + "\n";
      if (args.includes("ls-tree"))
        return `100644 blob ${"b".repeat(40)}\tskills/.curated/example/SKILL.md\0`;
      throw new Error("Unexpected Git command");
    });
  try {
    const request = (async () =>
      new Response("rate limited", { status: 403 })) as typeof fetch;
    const catalog = new SkillCatalog(request, path.join(directory, "catalog"));
    const result = await catalog.search("example");
    expect(result.skills).toHaveLength(1);
    expect(result.skills[0].commit).toBe(revision);
    expect(result.skills[0].stars).toBeNull();
    expect(result.errors.join(" ")).toContain("using Git catalog");
    expect(spy).toHaveBeenCalled();
  } finally {
    spy.mockRestore();
  }
});
