import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

export async function verifyMacPackage(app, dmg) {
  assert.equal(process.platform, "darwin", "macOS verification requires macOS");
  const verify = (bundle) =>
    execFileSync(
      "/usr/bin/codesign",
      ["--verify", "--deep", "--strict", "--verbose=2", bundle],
      { stdio: "inherit" },
    );
  verify(app);
  if (!dmg) return;
  execFileSync("/usr/bin/hdiutil", ["verify", dmg], { stdio: "inherit" });
  const temporary = await mkdtemp(path.join(os.tmpdir(), "aether-dmg-check-"));
  const mount = path.join(temporary, "volume");
  await mkdir(mount);
  let mounted = false;
  try {
    execFileSync(
      "/usr/bin/hdiutil",
      ["attach", "-readonly", "-nobrowse", "-mountpoint", mount, dmg],
      { stdio: "inherit" },
    );
    mounted = true;
    verify(path.join(mount, "Aether Code.app"));
  } finally {
    if (mounted)
      execFileSync("/usr/bin/hdiutil", ["detach", mount], { stdio: "inherit" });
    await rm(temporary, { recursive: true, force: true });
  }
  console.log(
    "Verified macOS bundle and downloaded DMG signature integrity (not a notarization check)",
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert(
    process.argv[2],
    "Pass the application bundle path and optional DMG path",
  );
  await verifyMacPackage(
    path.resolve(process.argv[2]),
    process.argv[3] && path.resolve(process.argv[3]),
  );
}
