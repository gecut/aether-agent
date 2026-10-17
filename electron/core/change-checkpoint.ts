import { createHash } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { inside, validateScopes } from "./security";

export async function checkpointFingerprint(cwd: string, files: string[]) {
  validateScopes(files);
  if (files.length > 1000 || files.includes("*"))
    throw new Error("Change checkpoint exceeds file limits");
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(JSON.stringify(file));
    let info;
    try {
      info = await lstat(path.resolve(cwd, file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hash.update("missing\0");
      continue;
    }
    if (!info.isFile() || info.isSymbolicLink() || info.size > 20_000_000)
      throw new Error("Only bounded regular files support change checkpoints");
    const content = await readFile(await inside(cwd, file));
    hash.update(String(info.mode & 0o777));
    hash.update(createHash("sha256").update(content).digest());
  }
  return hash.digest("hex");
}
