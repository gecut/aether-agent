import { fileURLToPath } from "node:url";
import { realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { runtimePath } from "./environment";
export const redact = (text: string) =>
  text
    .replace(
      /\b(sk-[\w-]{10,}|gh[pousr]_[\w]{15,}|AIza[\w-]{20,})\b/g,
      "[REDACTED]",
    )
    .replace(
      /((?:api[_-]?key|token|password|authorization)\s*[=:]\s*["']?)([^\s"']{6,})/gi,
      "$1[REDACTED]",
    );
export function safeEnv(extra: Record<string, string> = {}) {
  const env: NodeJS.ProcessEnv = {};
  for (const key of [
    "PATH",
    "HOME",
    "USER",
    "TMPDIR",
    "TEMP",
    "SystemRoot",
    "LANG",
    "LC_ALL",
    "USERPROFILE",
    "APPDATA",
    "LOCALAPPDATA",
    "HOMEDRIVE",
    "HOMEPATH",
    "COMSPEC",
    "PATHEXT",
    "WINDIR",
    "XDG_CONFIG_HOME",
    "XDG_DATA_HOME",
    "XDG_RUNTIME_DIR",
    "DBUS_SESSION_BUS_ADDRESS",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "HTTPS_PROXY",
    "HTTP_PROXY",
    "NO_PROXY",
  ])
    if (process.env[key]) env[key] = process.env[key];
  return { ...env, PATH: runtimePath(), NO_COLOR: "1", ...extra };
}
export async function inside(root: string, relative: string) {
  if (path.isAbsolute(relative) || relative.includes("\0"))
    throw new Error("A relative project path is required");
  const base = await realpath(root);
  const target = await realpath(path.resolve(base, relative));
  if (target !== base && !target.startsWith(base + path.sep))
    throw new Error("Path leaves the project boundary");
  return target;
}
export async function projectPath(input: string) {
  const resolved = await realpath(input);
  if (!(await lstat(resolved)).isDirectory())
    throw new Error("Select a local directory");
  if (resolved === path.parse(resolved).root)
    throw new Error("A filesystem root cannot be a project");
  return resolved;
}
export function sensitive(file: string) {
  return /(^|\/)(\.env(?:\..*)?|\.git|node_modules|dist|build|\.ssh|\.aws|credentials|secrets?)(\/|$)|\.(pem|key|p12|pfx)$|(?:^|\/)(?:auth|credentials)\.json$/i.test(
    file,
  );
}
export function owned(file: string, scopes: string[]) {
  return scopes.some(
    (scope) =>
      scope === "*" ||
      file === scope ||
      file.startsWith(scope.replace(/\/$/, "") + "/"),
  );
}
export function validateScopes(scopes: string[]) {
  for (const file of scopes)
    if (
      file !== "*" &&
      (path.isAbsolute(file) ||
        file.split(/[\\/]/).includes("..") ||
        sensitive(file))
    )
      throw new Error("Unsafe file scope: " + file);
}

export function trustedRendererURL(
  url: string,
  entry: string,
  devURL?: string,
) {
  try {
    const parsed = new URL(url);
    if (devURL) return parsed.origin === new URL(devURL).origin;
    return (
      parsed.protocol === "file:" &&
      path.resolve(fileURLToPath(parsed)) === path.resolve(entry)
    );
  } catch {
    return false;
  }
}
