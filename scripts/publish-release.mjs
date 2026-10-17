import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

const {
  GITHUB_REPOSITORY: repository,
  GITHUB_SHA: commit,
  GITHUB_RUN_ID: runId,
  GITHUB_RUN_NUMBER: runNumber,
  GITHUB_REF_NAME: ref,
} = process.env;
assert(
  repository &&
    /^[0-9a-f]{40}$/.test(commit ?? "") &&
    /^\d+$/.test(runId ?? "") &&
    /^\d+$/.test(runNumber ?? ""),
  "Missing GitHub run metadata",
);
const { version } = JSON.parse(await readFile("package.json", "utf8"));
const expected = [
  ...["arm64", "x64"].flatMap((arch) =>
    ["dmg", "zip"].map((ext) => `aether-code-${version}-mac-${arch}.${ext}`),
  ),
  ...["exe", "zip"].map((ext) => `aether-code-${version}-win-x64.${ext}`),
  ...[
    ["AppImage", "x86_64"],
    ["deb", "amd64"],
  ].map(([ext, arch]) => `aether-code-${version}-linux-${arch}.${ext}`),
].sort();
const directory = "release-assets";
assert.deepEqual(
  (await readdir(directory)).sort(),
  expected,
  "Release must contain exactly all eight expected distributions",
);
const checksums = [];
for (const file of expected)
  checksums.push(
    `${createHash("sha256")
      .update(await readFile(path.join(directory, file)))
      .digest("hex")}  ${file}`,
  );
await writeFile(
  path.join(directory, "SHA256SUMS.txt"),
  checksums.join("\n") + "\n",
);
const tag = `build-${runId}`;
const notes = `Automated development build from **${ref}**, commit ${commit}.\n\nApplication version: ${version}.\n\n- Windows x64: EXE installer or ZIP archive.\n- macOS Apple Silicon and Intel: DMG or ZIP.\n- Linux x64: AppImage or DEB.\n\nThese builds are unsigned and macOS is not notarized. Windows/macOS packaged launch, IPC and restart checks passed in CI; Linux package contents are checked, but desktop runtime behavior is not verified by this workflow. CLI providers must be installed and authenticated separately.\n\nChecksums: download SHA256SUMS.txt alongside the chosen assets and compare the matching hash (for example, sha256sum --ignore-missing -c SHA256SUMS.txt on Linux).\n\nWorkflow: https://github.com/${repository}/actions/runs/${runId}\n`;
await writeFile("release-notes.md", notes);
const gh = (args) =>
  execFileSync("gh", [...args, "--repo", repository], { stdio: "inherit" });
if (
  spawnSync("gh", ["release", "view", tag, "--repo", repository], {
    stdio: "ignore",
  }).status !== 0
)
  gh([
    "release",
    "create",
    tag,
    "--target",
    commit,
    "--title",
    `Aether Code ${version} · build ${runNumber}`,
    "--notes-file",
    "release-notes.md",
    "--draft",
    "--prerelease",
    "--latest=false",
  ]);
gh([
  "release",
  "upload",
  tag,
  ...[...expected, "SHA256SUMS.txt"].map((file) => path.join(directory, file)),
  "--clobber",
]);
gh([
  "release",
  "edit",
  tag,
  "--draft=false",
  "--prerelease",
  "--latest=false",
  "--notes-file",
  "release-notes.md",
]);
console.log(`Published https://github.com/${repository}/releases/tag/${tag}`);
