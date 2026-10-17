import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { inside, sensitive, redact } from "./security";
export interface ContextOptions {
  files?: string[];
  maxChars?: number;
}
const cache = new Map<string, { signature: string; text: string }>();
const words = (text: string) => [
  ...new Set(
    text
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 2),
  ),
];
async function source(root: string, file: string) {
  const location = await inside(root, file);
  const info = await stat(location);
  if (!info.isFile() || info.size > 80000) return "";
  const signature = `${info.dev}:${info.ino}:${info.size}:${info.mtimeMs}:${info.ctimeMs}`;
  const previous = cache.get(location);
  if (previous?.signature === signature) {
    cache.delete(location);
    cache.set(location, previous);
    return previous.text;
  }
  const text = await readFile(location, "utf8");
  if (text.includes("\0") || Buffer.byteLength(text) > 80000) return "";
  // Keep the cache below 64 files and 2 MB, including content from old worktrees.
  cache.delete(location);
  cache.set(location, { signature, text });
  let bytes = 0;
  for (const entry of cache.values()) bytes += Buffer.byteLength(entry.text);
  while (cache.size > 64 || bytes > 2_000_000) {
    const key = cache.keys().next().value!;
    bytes -= Buffer.byteLength(cache.get(key)!.text);
    cache.delete(key);
  }
  return text;
}
function excerpt(text: string, terms: string[], limit: number) {
  if (text.length <= limit) return text;
  const lines = text.split("\n"),
    selected = new Set<number>();
  const hits = lines
    .map((line, index) => {
      const tokens = new Set(words(line));
      return { index, score: terms.filter((term) => tokens.has(term)).length };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 5);
  for (let i = 0; i < Math.min(10, lines.length); i++) selected.add(i);
  for (const hit of hits)
    for (
      let i = Math.max(0, hit.index - 4);
      i <= Math.min(lines.length - 1, hit.index + 7);
      i++
    )
      selected.add(i);
  let result = "";
  let previous = -2;
  for (const index of [...selected].sort((a, b) => a - b)) {
    const line = `${index !== previous + 1 ? `\n[lines ${index + 1}…]\n` : ""}${lines[index]}\n`;
    if (result.length + line.length > limit - 80) break;
    result += line;
    previous = index;
  }
  return result + "\n[Excerpt; read the source file for omitted lines.]";
}
export async function buildContext(
  root: string,
  objective: string,
  index: string[],
  options: ContextOptions = {},
) {
  const maxChars = options.maxChars ?? 18000,
    terms = words(objective);
  const files = [...new Set(index)].filter(
    (file) => !sensitive(file) && !/[\r\n]/.test(file),
  );
  const available = new Set(files),
    scopes = (options.files ?? []).filter((file) => file !== "*");
  const scoped = (file: string) =>
    scopes.some(
      (scope) =>
        file === scope || file.startsWith(scope.replace(/\/$/, "") + "/"),
    );
  const instructions = (file: string) =>
    path.posix.basename(file) === "AGENTS.md" &&
    (file === "AGENTS.md" ||
      scopes.some((scope) => scope.startsWith(path.posix.dirname(file) + "/")));
  const ranked = files
    .map((file) => ({
      file,
      score:
        (scoped(file) ? 2000 : 0) +
        (instructions(file) ? 4000 : 0) +
        terms.filter((term) => words(file).includes(term)).length * 20 +
        (/^(package\.json|Cargo\.toml|pyproject\.toml|go\.mod)$/.test(file)
          ? 300
          : file === "README.md"
            ? 30
            : 0),
    }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));
  const primary = ranked.filter((item) => item.score > 0).slice(0, 5);
  const read = async (file: string) => ({
    file,
    text: await source(root, file),
  });
  const loaded = await Promise.allSettled(
    primary.map((item) => read(item.file)),
  );
  const sources = loaded.flatMap((result) =>
    result.status === "fulfilled" && result.value.text ? [result.value] : [],
  );
  const neighbors = new Set<string>();
  for (const item of sources.filter(
    (item) =>
      scoped(item.file) ||
      terms.some((term) => words(item.file).includes(term)),
  )) {
    for (const match of item.text.matchAll(
      /(?:\bfrom\s*|\brequire\s*\(\s*|\bimport\s*(?:\(\s*)?)["'](\.[^"'\r\n]+)["']/g,
    )) {
      const base = path.posix.normalize(
        path.posix.join(path.posix.dirname(item.file), match[1]),
      );
      const stems = [base, base.replace(/\.(?:m?js|cjs)$/, "")];
      const neighbor = stems
        .flatMap((stem) => [
          stem,
          ...[
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            ".mts",
            ".cts",
            ".mjs",
            ".cjs",
            "/index.ts",
            "/index.tsx",
            "/index.js",
          ].map((extension) => stem + extension),
        ])
        .find((file) => available.has(file));
      if (neighbor && !sources.some((item) => item.file === neighbor))
        neighbors.add(neighbor);
    }
  }
  const dependencies = await Promise.allSettled(
    [...neighbors].sort().slice(0, 3).map(read),
  );
  sources.push(
    ...dependencies.flatMap((result) =>
      result.status === "fulfilled" && result.value.text ? [result.value] : [],
    ),
  );
  sources.sort(
    (a, b) =>
      Number(instructions(b.file)) - Number(instructions(a.file)) ||
      Number(scoped(b.file)) - Number(scoped(a.file)) ||
      Number(neighbors.has(b.file)) - Number(neighbors.has(a.file)) ||
      a.file.localeCompare(b.file),
  );
  const fileIndex = ranked
    .slice(0, 60)
    .map((item) => item.file)
    .join("\n")
    .slice(0, 2500);
  let result = `Selected repository context (${files.length} files; omitted files remain readable in the workspace).\nRepository file index:\n${fileIndex}\n`;
  for (const item of sources) {
    const remaining = maxChars - result.length - 100;
    if (remaining < 200) break;
    const limit = Math.min(
      remaining,
      instructions(item.file) ? 6000 : scoped(item.file) ? 5000 : 2500,
    );
    result += `\nSOURCE: ${item.file}\n${redact(excerpt(item.text, terms, limit))}\n`;
  }
  return result.slice(0, maxChars);
}
