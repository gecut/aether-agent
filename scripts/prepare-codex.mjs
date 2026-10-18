import { createHash } from "node:crypto";
import {
  mkdir,
  writeFile,
  readFile,
  readdir,
  rename,
  chmod,
  rm,
} from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const manifest = JSON.parse(
  await readFile(
    new URL("../electron/providers/codex-release.json", import.meta.url),
    "utf8",
  ),
);
const targets = {
  "darwin-arm64": "aarch64-apple-darwin.tar.gz",
  "darwin-x64": "x86_64-apple-darwin.tar.gz",
  "linux-x64": "x86_64-unknown-linux-musl.tar.gz",
  "win32-x64": "x86_64-pc-windows-msvc.exe.zip",
};
const target = targets[`${process.platform}-${process.arch}`];
if (!target) throw new Error("No pinned Codex build for this platform");
const root = path.resolve(".cache/provider-runtime");
await mkdir(root, { recursive: true });
const tar =
  process.platform === "win32"
    ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
    : "tar";
for (const asset of manifest.assets.filter((a) => a.name.endsWith(target))) {
  const archive = path.join(root, asset.name);
  const response = await fetch(asset.url, {
    signal: AbortSignal.timeout(180000),
  });
  if (!response.ok) throw new Error(`Codex download HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256)
    throw new Error("Codex archive checksum mismatch");
  await writeFile(archive, bytes);
  // Only pinned official release archives are extracted; each entry must be a flat executable.
  const list = execFileSync(tar, ["-tf", asset.name], {
    cwd: root,
    encoding: "utf8",
  })
    .trim()
    .split(/\r?\n/);
  if (
    list.some(
      (name) =>
        name.includes("/") || name.includes("\\") || name.includes(".."),
    )
  )
    throw new Error("Unexpected Codex archive layout");
  execFileSync(tar, ["-xf", asset.name], { cwd: root });
  await rm(archive);
}
for (const file of await readdir(root)) {
  const base = file.replace(
    /-(?:aarch64|x86_64)-(?:apple-darwin|pc-windows-msvc|unknown-linux-musl)(?=\.exe$|$)/,
    "",
  );
  if (base !== file) await rename(path.join(root, file), path.join(root, base));
}
if (process.platform !== "win32") await chmod(path.join(root, "codex"), 0o755);
for (const file of ["LICENSE", "NOTICE"]) {
  const response = await fetch(
    `https://raw.githubusercontent.com/openai/codex/rust-v${manifest.version}/${file}`,
  );
  if (response.ok)
    await writeFile(path.join(root, `codex-${file}`), await response.text());
  else if (file === "LICENSE") throw new Error("Codex license download failed");
}
execFileSync(
  path.join(root, process.platform === "win32" ? "codex.exe" : "codex"),
  ["--version"],
  { stdio: "inherit" },
);
console.log("Prepared checksum-verified Codex runtime", manifest.version);
