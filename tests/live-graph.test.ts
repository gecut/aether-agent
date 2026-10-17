import { expect, it } from "vitest";
import { parseGraph } from "../electron/core/live-graph";
it("accepts real Graphify nodes and drops paths or edges outside indexed source", () => {
  const node = {
    id: "greet",
    label: "greet()",
    source_file: "src/greet.ts",
    source_location: "L7",
  };
  const graph = parseGraph(
    {
      nodes: [
        node,
        { ...node, id: "absolute", source_file: "/stage/src/greet.ts" },
        { ...node, id: "secret", source_file: "../secret.py" },
      ],
      edges: [
        { source: "greet", target: "absolute", relation: "calls" },
        { source: "greet", target: "secret", relation: "imports" },
      ],
    },
    new Set(["src/greet.ts"]),
    "/stage",
  );
  expect(graph.nodes.map((value) => value.file)).toEqual([
    "src/greet.ts",
    "src/greet.ts",
  ]);
  expect(graph.nodes[0].line).toBe("L7");
  expect(graph.edges).toHaveLength(1);
  expect(graph.truncated).toBe(true);
});
it("bounds a large graph before it reaches renderer layout", () => {
  const graph = parseGraph(
    {
      nodes: Array.from({ length: 2200 }, (_, index) => ({
        id: String(index),
        label: "symbol",
        source_file: "code.ts",
      })),
      edges: [],
    },
    new Set(["code.ts"]),
    "/stage",
  );
  expect(graph.nodes).toHaveLength(2000);
  expect(graph.truncated).toBe(true);
});

it("indexes only safe source, caches unchanged reads, and refreshes edits/deletions", async () => {
  const { mkdtemp, mkdir, writeFile, readFile, rm, symlink, chmod } =
    await import("node:fs/promises");
  const { default: os } = await import("node:os");
  const { default: path } = await import("node:path");
  const { vi } = await import("vitest");
  const runtime = await import("../electron/providers/runtime");
  const { git } = await import("../electron/core/repository");
  const { LiveGraph } = await import("../electron/core/live-graph");
  const directory = await mkdtemp(path.join(os.tmpdir(), "aether-graph-"));
  const root = path.join(directory, "project");
  await mkdir(root);
  await git(root, ["init"]);
  await writeFile(path.join(root, "code.ts"), "export const a = 1");
  await writeFile(path.join(root, ".env.py"), "secret = 1");
  await writeFile(path.join(root, ".gitignore"), "ignored.ts\n");
  await writeFile(path.join(root, "ignored.ts"), "export const ignored = 1");
  await writeFile(
    path.join(directory, "outside.ts"),
    "export const outside = 1",
  );
  await symlink(
    path.join(directory, "outside.ts"),
    path.join(root, "linked.ts"),
  );
  const binary = path.join(directory, "graphify");
  const count = path.join(directory, "count");
  await writeFile(
    binary,
    `#!${process.execPath}\nconst fs = require('node:fs'), path = require('node:path');
const root = process.argv[3], out = process.argv[process.argv.indexOf('--out') + 1];
fs.appendFileSync(${JSON.stringify(count)}, 'x');
const files = fs.readdirSync(root);
const nodes = files.map(file => ({ id: file, label: fs.readFileSync(path.join(root,file),'utf8'), source_file: file }));
fs.mkdirSync(path.join(out,'graphify-out'),{recursive:true});
fs.writeFileSync(path.join(out,'graphify-out','graph.json'),JSON.stringify({nodes,edges:[]}));\n`,
  );
  await chmod(binary, 0o700);
  const mocked = vi.spyOn(runtime, "findBinary").mockResolvedValue(binary);
  const graph = new LiveGraph(path.join(directory, "graphs"));
  try {
    const first = await graph.read("fixture", root, "Project");
    expect(first.error).toBeUndefined();
    expect(first.nodes.map((node) => node.file)).toEqual(["code.ts"]);
    expect(await graph.read("fixture", root, "Project")).toEqual(first);
    expect(await readFile(count, "utf8")).toBe("x");
    await writeFile(path.join(root, "code.ts"), "export const changed = 2");
    expect(
      (await graph.read("fixture", root, "Project")).nodes[0].label,
    ).toContain("changed");
    expect(await readFile(count, "utf8")).toBe("xx");
    await rm(path.join(root, "code.ts"));
    expect((await graph.read("fixture", root, "Project")).nodes).toEqual([]);
    await graph.close();
    await expect(graph.read("fixture", root, "Project")).rejects.toThrow(
      "stopped",
    );
  } finally {
    mocked.mockRestore();
    await graph.close();
    await rm(directory, { recursive: true, force: true });
  }
});
