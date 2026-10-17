import { createHash, randomUUID } from "node:crypto";
import { mkdir, writeFile, readFile, lstat, rm } from "node:fs/promises";
import path from "node:path";
import type { CatalogSkill, Skill, SkillPreview } from "../../shared/types";
import { parseSkill } from "./prompts";
import { excludeLocal } from "./project-setup";
import { inside } from "./security";
import { git } from "./repository";
const sources = [
  { repository: "openai/skills", prefix: "skills/.curated/" },
  { repository: "anthropics/skills", prefix: "skills/" },
  { repository: "vercel-labs/agent-skills", prefix: "skills/" },
];
type Blob = {
  path: string;
  type: string;
  mode: string;
  size?: number;
  sha: string;
};
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export class SkillCatalog {
  private cache?: { at: number; skills: CatalogSkill[]; errors: string[] };
  private trees = new Map<string, Blob[]>();
  private previews = new Map<
    string,
    { preview: SkillPreview; files: Blob[]; at: number }
  >();
  constructor(
    private request: typeof fetch = fetch,
    private directory?: string,
  ) {}
  private async get(url: string, binary = false): Promise<any> {
    const response = await this.request(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "Aether-Code",
      },
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok)
      throw new Error(
        `Catalog request failed (${response.status}); GitHub may be rate limiting requests. Retry later.`,
      );
    if (Number(response.headers.get("content-length")) > 5_000_000)
      throw new Error("Catalog response exceeds size limit");
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 5_000_000)
      throw new Error("Catalog response exceeds size limit");
    return binary ? bytes : JSON.parse(bytes.toString("utf8"));
  }
  async search(query: string, refresh = false) {
    if (!this.cache || refresh || Date.now() - this.cache.at > 3600000) {
      const results = await Promise.allSettled(
        sources.map(async ({ repository, prefix }) => {
          let commit: string,
            tree: Blob[],
            stars: number | null = null,
            warning: string | undefined;
          try {
            const base = `https://api.github.com/repos/${repository}`;
            const metadata = await this.get(base);
            const revision = await this.get(
              `${base}/commits/${encodeURIComponent(metadata.default_branch)}`,
            );
            const response = await this.get(
              `${base}/git/trees/${revision.sha}?recursive=1`,
            );
            if (response.truncated || !Array.isArray(response.tree))
              throw new Error("Incomplete skill catalog");
            commit = revision.sha;
            tree = response.tree;
            stars = Number(metadata.stargazers_count) || 0;
          } catch (error) {
            if (!this.directory) throw error;
            const mirror = await this.gitCatalog(repository);
            commit = mirror.commit;
            tree = mirror.tree;
            warning = `${repository}: using Git catalog because the GitHub API is unavailable. Star counts unavailable.`;
          }
          if (!/^[a-f0-9]{40}$/.test(commit))
            throw new Error("Invalid catalog revision");
          this.trees.set(`${repository}@${commit}`, tree);
          const skills = tree
            .filter(
              (b: Blob) =>
                b.type === "blob" &&
                b.path.startsWith(prefix) &&
                b.path.endsWith("/SKILL.md") &&
                !b.path.slice(prefix.length).slice(0, -9).includes("/"),
            )
            .map((b: Blob): CatalogSkill => {
              const directory = b.path.slice(0, -9),
                name = directory.split("/").pop()!;
              return {
                id: `${repository}:${directory}:${commit}`,
                name,
                repository,
                directory,
                commit,
                stars,
                url: `https://github.com/${repository}/tree/${commit}/${directory}`,
              };
            });
          return { skills, warning };
        }),
      );
      const skills: CatalogSkill[] = [],
        errors: string[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") {
          skills.push(...r.value.skills);
          if (r.value.warning) errors.push(r.value.warning);
        } else errors.push(`${sources[i].repository}: ${r.reason.message}`);
      });
      this.cache = { at: Date.now(), skills, errors };
    }
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return {
      skills: this.cache.skills.filter((s) =>
        words.every((w) =>
          `${s.name} ${s.repository}`.toLowerCase().includes(w),
        ),
      ),
      errors: this.cache.errors,
      fetchedAt: new Date(this.cache.at).toISOString(),
    };
  }
  private async gitCatalog(repository: string) {
    await mkdir(this.directory!, { recursive: true });
    const location = path.join(this.directory!, repository.replace("/", "-"));
    if (await lstat(location).catch(() => undefined)) {
      if ((await lstat(location)).isSymbolicLink())
        throw new Error("Unsafe catalog cache");
      await git(location, [
        "-c",
        "protocol.file.allow=never",
        "-c",
        "protocol.ext.allow=never",
        "fetch",
        "--no-recurse-submodules",
        "--depth=1",
        `https://github.com/${repository}.git`,
        "HEAD",
      ]);
    } else {
      await git(this.directory!, [
        "-c",
        "protocol.file.allow=never",
        "-c",
        "protocol.ext.allow=never",
        "clone",
        "--bare",
        "--depth=1",
        "--filter=blob:none",
        `https://github.com/${repository}.git`,
        location,
      ]);
    }
    const commit = (
      await git(location, ["rev-parse", "--verify", "FETCH_HEAD"]).catch(() =>
        git(location, ["rev-parse", "HEAD"]),
      )
    ).trim();
    const listing = await git(location, ["ls-tree", "-r", "-z", commit]);
    const tree = listing
      .split("\0")
      .filter(Boolean)
      .map((row) => {
        const match = row.match(
          /^(\d{6}) (blob|commit) ([a-f0-9]{40})\t([\s\S]+)$/,
        );
        if (!match) throw new Error("Invalid Git catalog entry");
        return {
          mode: match[1],
          type: match[2],
          sha: match[3],
          path: match[4],
        };
      });
    return { commit, tree };
  }
  async preview(id: string): Promise<SkillPreview> {
    await this.search("");
    const skill = this.cache!.skills.find((s) => s.id === id);
    if (!skill) throw new Error("Skill not found. Refresh the catalog.");
    const tree = this.trees.get(`${skill.repository}@${skill.commit}`)!;
    const files = tree.filter(
      (b) =>
        b.type !== "tree" &&
        (b.path.startsWith(skill.directory + "/") ||
          /^(LICENSE|NOTICE)(\.[^/]*)?$/i.test(b.path)),
    );
    if (
      !files.length ||
      files.length > 250 ||
      files.some(
        (b) =>
          b.type !== "blob" ||
          !["100644", "100755"].includes(b.mode) ||
          (b.size ?? 0) > 2_000_000,
      ) ||
      files.reduce((n, b) => n + (b.size ?? 0), 0) > 20_000_000
    )
      throw new Error(
        "Skill package exceeds limits or contains links/submodules",
      );
    const content = (
      await this.download(skill, skill.directory + "/SKILL.md")
    ).toString("utf8");
    const parsed = parseSkill(content);
    const preview = {
      skill,
      content,
      description: parsed.description,
      files: files.map((b) => this.relative(skill, b.path)),
      token: randomUUID(),
    };
    this.previews.set(preview.token, { preview, files, at: Date.now() });
    return preview;
  }
  private relative(skill: CatalogSkill, file: string) {
    const relative = file.startsWith(skill.directory + "/")
      ? file.slice(skill.directory.length + 1)
      : "SOURCE-" + file;
    if (
      !relative ||
      relative.includes("\\") ||
      relative
        .split("/")
        .some((p) => !p || p === "." || p === ".." || p === ".git")
    )
      throw new Error("Unsafe package path");
    return relative;
  }
  private download(skill: CatalogSkill, file: string): Promise<Buffer> {
    return this.get(
      `https://raw.githubusercontent.com/${skill.repository}/${skill.commit}/${file.split("/").map(encodeURIComponent).join("/")}`,
      true,
    );
  }
  async install(
    token: string,
    project: { id: string; path: string },
  ): Promise<Skill> {
    const entry = this.previews.get(token);
    if (!entry || Date.now() - entry.at > 3600000)
      throw new Error("Preview expired. Review the skill again.");
    const { skill } = entry.preview;
    if (!/^[a-zA-Z0-9_-]+$/.test(skill.name))
      throw new Error("Unsafe skill name");
    const packageFiles: { path: string; sha256: string }[] = [],
      downloads: { file: string; bytes: Buffer }[] = [];
    let totalBytes = 0;
    for (const blob of entry.files) {
      const bytes = await this.download(skill, blob.path);
      totalBytes += bytes.length;
      if (
        totalBytes > 20_000_000 ||
        bytes.length > 2_000_000 ||
        createHash("sha1")
          .update(`blob ${bytes.length}\0`)
          .update(bytes)
          .digest("hex") !== blob.sha
      )
        throw new Error("Skill package integrity check failed");
      const file = this.relative(skill, blob.path);
      packageFiles.push({ path: file, sha256: digest(bytes) });
      downloads.push({ file, bytes });
    }
    if (
      downloads.find((d) => d.file === "SKILL.md")?.bytes.toString("utf8") !==
      entry.preview.content
    )
      throw new Error("Skill instructions changed; review again");
    for (const folder of [".agents", ".agents/skills"]) {
      await mkdir(path.join(project.path, folder)).catch((e) => {
        if (e.code !== "EEXIST") throw e;
      });
      await inside(project.path, folder);
      if ((await lstat(path.join(project.path, folder))).isSymbolicLink())
        throw new Error("Skill directories must not be symlinks");
    }
    const installPath = `.agents/skills/${skill.name}`,
      target = path.join(project.path, installPath);
    await excludeLocal(project.path, "/" + installPath + "/");
    await mkdir(target); // Exclusive: never replace an existing package.
    try {
      for (const { file, bytes } of downloads) {
        const dest = path.join(target, file);
        await mkdir(path.dirname(dest), { recursive: true });
        await writeFile(dest, bytes, { flag: "wx", mode: 0o644 });
      }
      await writeFile(
        path.join(target, ".aether-source.json"),
        JSON.stringify(
          {
            repository: skill.repository,
            commit: skill.commit,
            url: skill.url,
          },
          null,
          2,
        ),
        { flag: "wx" },
      );
    } catch (error) {
      await rm(target, { recursive: true, force: true });
      throw error;
    }
    this.previews.delete(token);
    return {
      ...parseSkill(entry.preview.content),
      id: randomUUID(),
      projectId: project.id,
      installPath,
      source: skill.url,
      packageFiles,
      version: 1,
      enabled: true,
      reviewed: true,
      roles: ["*"],
      createdAt: new Date().toISOString(),
    };
  }
}
export async function copyProjectSkills(
  project: { id: string; path: string },
  destination: string,
  skills: Skill[],
) {
  for (const skill of skills.filter(
    (s) =>
      s.projectId === project.id &&
      s.enabled &&
      s.reviewed &&
      s.installPath &&
      s.packageFiles,
  )) {
    for (const file of skill.packageFiles!) {
      const location = await inside(
        project.path,
        `${skill.installPath}/${file.path}`,
      );
      const bytes = await readFile(location);
      if (digest(bytes) !== file.sha256)
        throw new Error(
          `Installed skill ${skill.name} changed. Disable it and review a fresh installation.`,
        );
      const dest = path.join(destination, skill.installPath!, file.path);
      await safeDirectories(
        destination,
        path.relative(destination, path.dirname(dest)),
      );
      await writeFile(dest, bytes, { flag: "wx", mode: 0o644 });
    }
  }
}

async function safeDirectories(root: string, relative: string) {
  let current = root;
  for (const part of relative.split(path.sep)) {
    if (!part || part === "." || part === "..")
      throw new Error("Unsafe resource directory");
    current = path.join(current, part);
    await mkdir(current).catch((error) => {
      if (error.code !== "EEXIST") throw error;
    });
    if ((await lstat(current)).isSymbolicLink())
      throw new Error("Skill resource directories must not be symlinks");
    await inside(root, path.relative(root, current));
  }
}
