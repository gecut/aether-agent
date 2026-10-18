import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { execute } from "./process";
import { projectPath, redact } from "./security";
import { findBinary } from "../providers/runtime";
import { Store } from "./store";
import type { Project, ProjectImport } from "../../shared/types";
export function repositorySource(input: string) {
  let text = input.trim();
  if (/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(text))
    text = "https://github.com/" + text;
  if (/^github\.com\//i.test(text)) text = "https://" + text;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Error("Enter owner/repository or an HTTPS Git repository URL.");
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    /[\s\x00-\x1f]/.test(text)
  )
    throw new Error(
      "Use an HTTPS repository URL without passwords, tokens, query parameters or fragments.",
    );
  const parts = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
  if (
    parts.length < 2 ||
    (url.hostname === "github.com" && parts.length !== 2) ||
    parts.some((part) => part === "." || part === "..")
  )
    throw new Error(
      "Use the repository URL, without /tree, /blob or a file path.",
    );
  const name = parts.at(-1)!.replace(/\.git$/, "");
  if (
    !/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]{0,99}$/.test(name) ||
    name.endsWith(".") ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)
  )
    throw new Error(
      "This repository name cannot be used as a local project folder.",
    );
  url.pathname = "/" + parts.join("/");
  return { url: url.toString(), name, github: url.hostname === "github.com" };
}
const quote = (text: string) => "'" + text.replaceAll("'", "'\\''") + "'";
export async function cloneRepository(
  source: ReturnType<typeof repositorySource>,
  parent: string,
  signal: AbortSignal,
  phase: (message: string) => void,
  run = execute,
) {
  const destination = path.join(parent, source.name);
  if (
    await lstat(destination).catch((error) => {
      if (error.code !== "ENOENT") throw error;
      return undefined;
    })
  )
    throw new Error(
      `A folder named ${source.name} already exists here. Open it locally or choose another clone location.`,
    );
  const stage = await mkdtemp(path.join(parent, ".aether-import-"));
  const repository = path.join(stage, "repository"),
    hooks = path.join(stage, "hooks"),
    config = path.join(stage, "empty-config");
  let published = false,
    reserved = false;
  try {
    await mkdir(hooks);
    await writeFile(config, "", { mode: 0o600 });
    const args = [
      "-c",
      `core.hooksPath=${hooks}`,
      "-c",
      "core.fsmonitor=false",
      "-c",
      "protocol.allow=never",
      "-c",
      "protocol.https.allow=always",
    ];
    const gh = source.github ? await findBinary("gh") : undefined;
    if (gh) {
      const auth = await run(
        gh,
        ["auth", "status", "--hostname", "github.com"],
        { signal, timeoutMs: 5000 },
      ).catch((error) => {
        if (signal.aborted) throw error;
        return undefined;
      });
      if (auth?.code === 0)
        args.push(
          "-c",
          "credential.helper=",
          "-c",
          `credential.helper=!${quote(gh.replaceAll("\\", "/"))} auth git-credential`,
        );
    }
    const result = await run(
      "git",
      [
        ...args,
        "clone",
        "--no-checkout",
        "--no-recurse-submodules",
        `--template=${hooks}`,
        "--progress",
        "--",
        source.url,
        repository,
      ],
      {
        cwd: stage,
        signal,
        timeoutMs: 600000,
        env: { GIT_TERMINAL_PROMPT: "0", GCM_INTERACTIVE: "Never" },
        limit: 2_000_000,
      },
    );
    if (result.code)
      throw new Error(
        redact(result.stderr).slice(-1800) ||
          "Git clone failed. Check the URL and your Git/GitHub sign-in for private repositories.",
      );
    phase("Preparing repository files…");
    // Checkout reads no global/system filters and runs no hooks or submodules.
    const isolated = {
      GIT_CONFIG_GLOBAL: config,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_TERMINAL_PROMPT: "0",
      GCM_INTERACTIVE: "Never",
    };
    const head = await run("git", ["rev-parse", "--verify", "HEAD"], {
      cwd: repository,
      signal,
      env: isolated,
      timeoutMs: 10000,
    });
    if (head.code === 0) {
      const checkout = await run(
        "git",
        [
          "-c",
          `core.hooksPath=${hooks}`,
          "-c",
          "core.fsmonitor=false",
          "-c",
          "core.autocrlf=false",
          "-c",
          "core.longpaths=true",
          "-c",
          "submodule.recurse=false",
          "-c",
          "protocol.allow=never",
          "checkout",
          "--force",
          "HEAD",
        ],
        { cwd: repository, signal, env: isolated, timeoutMs: 120000 },
      );
      if (checkout.code)
        throw new Error(
          checkout.stderr || "Could not prepare repository files",
        );
    }
    if (signal.aborted) throw new Error("Import cancelled");
    try {
      await mkdir(destination);
      reserved = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new Error(
          `A folder named ${source.name} already exists here. Open that local folder or choose another clone location.`,
        );
      throw error;
    }
    for (const entry of await readdir(repository))
      await rename(path.join(repository, entry), path.join(destination, entry));
    published = true;
    return destination;
  } finally {
    if (reserved && !published)
      await rm(destination, { recursive: true, force: true });
    await rm(stage, { recursive: true, force: true });
  }
}
export class ProjectImports {
  private closing = false;
  private jobs = new Map<
    string,
    { controller: AbortController; done: Promise<void> }
  >();
  constructor(
    private store: Store,
    private register: (folder: string) => Promise<Project>,
  ) {}
  recover() {
    for (const job of this.store.all<ProjectImport>("project-import"))
      if (["cloning", "preparing"].includes(job.status))
        this.save({
          ...job,
          status: "failed",
          message:
            "Import interrupted. If the repository folder exists, open it as a local project; otherwise retry cloning.",
        });
  }
  get(id: string) {
    const job = this.store.get<ProjectImport>("project-import", id);
    if (!job) throw new Error("Project import not found");
    return job;
  }
  private save(job: ProjectImport) {
    job.updatedAt = new Date().toISOString();
    this.store.put("project-import", job.id, job);
    return job;
  }
  async start(input: string, folder: string) {
    if (this.closing)
      throw new Error("Aether is closing. Try importing after reopening.");
    if (this.jobs.size)
      throw new Error("Finish or cancel the current clone first.");
    const source = repositorySource(input),
      parent = await projectPath(folder);
    if (this.closing)
      throw new Error("Aether is closing. Try importing after reopening.");
    if (this.jobs.size)
      throw new Error("Finish or cancel the current clone first.");
    const job: ProjectImport = {
      version: 1,
      id: randomUUID(),
      source: source.url,
      parent,
      status: "cloning",
      message: "Cloning repository…",
      updatedAt: new Date().toISOString(),
    };
    this.save(job);
    const controller = new AbortController();
    const done = (async () => {
      try {
        const destination = await cloneRepository(
          source,
          parent,
          controller.signal,
          (message) => this.save({ ...job, status: "preparing", message }),
        );
        const project = await this.register(destination);
        this.save({
          ...job,
          status: "ready",
          projectId: project.id,
          message:
            "Repository imported. Choose optional skills before continuing.",
        });
      } catch (error) {
        this.save({
          ...job,
          status: controller.signal.aborted ? "cancelled" : "failed",
          message: controller.signal.aborted
            ? "Clone cancelled."
            : redact(error instanceof Error ? error.message : String(error)),
        });
      }
    })().finally(() => this.jobs.delete(job.id));
    this.jobs.set(job.id, { controller, done });
    return job;
  }
  async cancel(id: string) {
    const job = this.jobs.get(id);
    job?.controller.abort();
    if (job) await job.done;
    return this.get(id);
  }
  async shutdown() {
    this.closing = true;
    for (const job of this.jobs.values()) job.controller.abort();
    await Promise.all([...this.jobs.values()].map((job) => job.done));
  }
}
