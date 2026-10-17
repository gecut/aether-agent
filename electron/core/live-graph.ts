import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rm, lstat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { CodeGraph } from "../../shared/types";
import { git } from "./repository";
import { GraphifyRuntime, graphifyFailure } from "./graphify-runtime";
import { inside, sensitive, redact } from "./security";
import { findBinary } from "../providers/runtime";

const codeFile =
  /\.(?:[cm]?[jt]sx?|py|rs|go|java|kt|swift|c|cpp|h|hpp|cs|rb|php|vue|svelte)$/i;
const rawGraph = z.object({
  nodes: z
    .array(
      z.object({
        id: z.string().max(2000),
        label: z.string().max(2000),
        source_file: z.string().max(4000),
        source_location: z.string().max(1000).optional(),
      }),
    )
    .max(100000),
  edges: z
    .array(
      z.object({
        source: z.string(),
        target: z.string(),
        relation: z.string().max(1000),
      }),
    )
    .max(500000),
});
export function parseGraph(raw: unknown, files: Set<string>, staged: string) {
  const parsed = rawGraph.parse(raw);
  const nodes = parsed.nodes
    .flatMap((node) => {
      const file = path.isAbsolute(node.source_file)
        ? path.relative(staged, node.source_file)
        : node.source_file;
      if (!files.has(file)) return [];
      return [
        {
          id: node.id,
          label: node.label,
          file,
          line: node.source_location ?? "L1",
        },
      ];
    })
    .slice(0, 2000);
  const ids = new Set(nodes.map((node) => node.id));
  const edges = parsed.edges
    .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
    .slice(0, 5000);
  return {
    nodes,
    edges,
    truncated:
      parsed.nodes.length > nodes.length || parsed.edges.length > edges.length,
  };
}

// Polling is driven by the visible graph. Unchanged files never invoke Graphify.
export class LiveGraph {
  private cache = new Map<string, { signature: string; graph: CodeGraph }>();
  private pending?: Promise<CodeGraph>;
  private controller = new AbortController();
  private runtime = new GraphifyRuntime();
  constructor(private directory: string) {}
  async close() {
    this.controller.abort();
    await this.pending;
  }
  async read(
    projectId: string,
    root: string,
    source: string,
    refresh = false,
  ): Promise<CodeGraph> {
    if (this.controller.signal.aborted)
      throw new Error("Graph indexing stopped");
    if (this.pending) {
      await this.pending;
      return this.read(projectId, root, source, refresh);
    }
    this.pending = this.extract(projectId, root, source, refresh);
    try {
      return await this.pending;
    } finally {
      this.pending = undefined;
      while (this.cache.size > 8)
        this.cache.delete(this.cache.keys().next().value!);
    }
  }
  private async extract(
    projectId: string,
    root: string,
    source: string,
    refresh: boolean,
  ): Promise<CodeGraph> {
    const key = root;
    let signature = "";
    try {
      const all = [
        ...new Set(
          (
            await git(root, ["ls-files", "-co", "--exclude-standard", "-z"])
          ).split("\0"),
        ),
      ]
        .filter(
          (file) =>
            codeFile.test(file) &&
            !sensitive(file) &&
            !file.split(/[\\/]/).includes("..") &&
            !path.isAbsolute(file),
        )
        .sort();
      const files: string[] = [];
      const hash = createHash("sha256");
      let bytes = 0;
      for (const name of all.slice(0, 1000)) {
        try {
          // Do not follow links, even to other locations within the project.
          const info = await lstat(path.join(root, name));
          if (
            !info.isFile() ||
            info.size > 500000 ||
            bytes + info.size > 20000000
          )
            continue;
          await inside(root, name);
          bytes += info.size;
          files.push(name);
          hash.update(
            JSON.stringify([name, info.size, info.mtimeMs, info.ctimeMs]),
          );
        } catch {
          /* A file may disappear while a provider is writing it. */
        }
      }
      signature = hash.digest("hex");
      const cached = this.cache.get(key);
      if (!refresh && cached?.signature === signature)
        return { ...cached.graph, source };
      let graph: CodeGraph = {
        nodes: [],
        edges: [],
        source,
        updatedAt: new Date().toISOString(),
        truncated: all.length > files.length,
      };
      if (files.length) {
        const binary = await findBinary("graphify");
        if (!binary)
          throw new Error(
            "Graphify CLI is unavailable. Install graphifyy locally to index repository symbols.",
          );
        const job = path.join(
          this.directory,
          createHash("sha256")
            .update(projectId + root)
            .digest("hex")
            .slice(0, 24),
        );
        const staged = path.join(job, "source");
        await rm(job, { recursive: true, force: true });
        await mkdir(staged, { recursive: true, mode: 0o700 });
        try {
          let stagedBytes = 0;
          for (const file of files) {
            const contents = await readFile(await inside(root, file));
            if (
              contents.length > 500000 ||
              contents.includes(0) ||
              stagedBytes + contents.length > 20000000
            )
              continue;
            stagedBytes += contents.length;
            const target = path.join(staged, file);
            await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
            await writeFile(target, contents, { mode: 0o600 });
          }
          const result = await this.runtime.run(
            binary,
            [
              "extract",
              staged,
              "--code-only",
              "--no-cluster",
              "--out",
              path.join(job, "index"),
            ],
            { signal: this.controller.signal, timeoutMs: 60000 },
          );
          if (result.code !== 0)
            throw new Error(graphifyFailure(result.stderr));
          const output = path.join(job, "index", "graphify-out", "graph.json");
          if ((await lstat(output)).size > 20000000)
            throw new Error("Graphify output exceeds the 20 MB limit");
          const extracted = parseGraph(
            JSON.parse(await readFile(output, "utf8")),
            new Set(files),
            staged,
          );
          graph = {
            ...graph,
            ...extracted,
            truncated: graph.truncated || extracted.truncated,
          };
        } finally {
          await rm(job, { recursive: true, force: true });
        }
      }
      this.cache.set(key, { signature, graph });
      while (this.cache.size > 8)
        this.cache.delete(this.cache.keys().next().value!);
      return graph;
    } catch (error) {
      const graph: CodeGraph = {
        nodes: [],
        edges: [],
        source,
        updatedAt: new Date().toISOString(),
        truncated: false,
        error: redact(String(error)),
      };
      this.cache.set(key, { signature, graph });
      return graph;
    }
  }
}
