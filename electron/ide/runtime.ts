import { createHash, randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  writeFile,
  rm,
  rename,
  open,
  copyFile,
  access,
  statfs,
  mkdtemp,
} from "node:fs/promises";
import path from "node:path";
import { createServer } from "node:net";
import type { Session } from "electron";
import { safeEnv } from "../core/security";
import { ideRelease } from "./release";
import { runtimeArchiveError, runtimeTar } from "./archive";
import type { IDERuntimeStatus, Project } from "../../shared/types";

export function validateArchiveEntries(list: string) {
  const entries = list.split("\n").filter(Boolean);
  if (
    entries.length > 100000 ||
    entries.some(
      (name) =>
        /^[\\/]|^[A-Za-z]:/.test(name) || name.split(/[\\/]/).includes(".."),
    )
  )
    throw new Error("IDE archive contains unsafe paths");
}
const exists = async (file: string) =>
  access(file).then(
    () => true,
    () => false,
  );
export class IDERuntime {
  private state: IDERuntimeStatus = {
    version: 1,
    state: "missing",
    progress: 0,
    release: ideRelease.version,
  };
  private installation?: Promise<IDERuntimeStatus>;
  private starting?: Promise<string>;
  private child?: ChildProcess;
  private baseURL?: string;
  private ipcDirectory?: string;
  private asset =
    ideRelease.assets[
      `${process.platform}-${process.arch}` as keyof typeof ideRelease.assets
    ];
  private root: string;
  private disposed = false;
  private installationAbort = new AbortController();
  constructor(
    private directory: string,
    private session: Session,
    private archiveFixture?: string,
  ) {
    this.root = path.join(
      directory,
      "ide-runtime",
      `code-server-${ideRelease.version}-${process.platform}-${process.arch}`,
    );
  }
  async status(): Promise<IDERuntimeStatus> {
    if (
      this.state.state === "missing" &&
      (await exists(path.join(this.root, "aether-runtime.json")))
    ) {
      try {
        const manifest = JSON.parse(
          await readFile(path.join(this.root, "aether-runtime.json"), "utf8"),
        );
        if (
          manifest.version === 1 &&
          manifest.sha256 === this.asset?.sha256 &&
          (await exists(
            path.join(
              this.root,
              "lib",
              process.platform === "win32" ? "node.exe" : "node",
            ),
          )) &&
          (await exists(path.join(this.root, "out", "node", "entry.js")))
        )
          this.state = { ...this.state, state: "ready", progress: 100 };
        else throw new Error("Invalid runtime manifest");
      } catch {
        this.state = {
          ...this.state,
          state: "error",
          error:
            "IDE installation is incomplete or damaged. Set up the full IDE again.",
        };
      }
    }
    return {
      ...this.state,
      downloadMB: this.asset
        ? Math.ceil(this.asset.bytes / 1_000_000)
        : undefined,
      supported: !!this.asset,
    };
  }
  install(): Promise<IDERuntimeStatus> {
    if (this.installation) return this.installation;
    this.installation = this.installRuntime().finally(() => {
      this.installation = undefined;
    });
    return this.installation;
  }
  private async installRuntime() {
    if (!this.asset)
      throw new Error(
        "The full IDE runtime is unavailable for this platform. Use the quick editor.",
      );
    if (["ready", "running"].includes((await this.status()).state))
      return this.status();
    const parent = path.dirname(this.root);
    const archive = this.root + ".tar.gz";
    const staging = this.root + ".installing";
    await mkdir(parent, { recursive: true, mode: 0o700 });
    this.state = {
      ...this.state,
      state: "downloading",
      progress: 0,
      error: undefined,
    };
    try {
      await rm(staging, { recursive: true, force: true });
      await rm(archive, { force: true });
      const disk = await statfs(parent);
      if (disk.bavail * disk.bsize < this.asset.bytes * 6)
        throw new Error(
          `IDE setup needs at least ${((this.asset.bytes * 6) / 1_000_000_000).toFixed(1)} GB of free disk space to download and unpack. Free space and retry.`,
        );
      if (this.archiveFixture) await copyFile(this.archiveFixture, archive);
      else {
        const response = await fetch(
          `https://github.com/coder/code-server/releases/download/v${ideRelease.version}/code-server-${ideRelease.version}-${this.asset.name}.tar.gz`,
          {
            signal: AbortSignal.any([
              this.installationAbort.signal,
              AbortSignal.timeout(900000),
            ]),
          },
        );
        if (
          !response.ok ||
          !response.body ||
          ![
            "github.com",
            "release-assets.githubusercontent.com",
            "objects.githubusercontent.com",
          ].includes(new URL(response.url).hostname)
        )
          throw new Error("IDE runtime download failed");
        const target = await open(archive, "w", 0o600);
        const reader = response.body.getReader();
        let bytes = 0;
        try {
          while (true) {
            const { value: chunk, done } = await reader.read();
            if (done) break;
            if (this.disposed) throw new Error("IDE installation cancelled");
            bytes += chunk.length;
            if (bytes > this.asset.bytes)
              throw new Error(
                "IDE runtime download exceeds its published size",
              );
            await target.writeFile(chunk);
            this.state.progress = Math.floor((bytes / this.asset.bytes) * 90);
          }
        } finally {
          await reader.cancel().catch(() => {});
          await target.close();
        }
      }
      this.state.state = "verifying";
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(archive)) {
        if (this.disposed) throw new Error("IDE installation cancelled");
        hash.update(chunk);
      }
      if (hash.digest("hex") !== this.asset.sha256)
        throw new Error(
          "IDE runtime checksum does not match the pinned release",
        );
      this.state.state = "installing";
      const list = await runtimeTar(
        ["-tzf", archive],
        this.installationAbort.signal,
      );
      if (list.code) throw new Error("Cannot inspect the IDE runtime archive");
      validateArchiveEntries(list.stdout);
      await mkdir(staging, { mode: 0o700 });
      const extracted = await runtimeTar(
        [
          "-xzf",
          archive,
          "--strip-components=1",
          "--no-same-owner",
          "-C",
          staging,
        ],
        this.installationAbort.signal,
      );
      if (extracted.code)
        throw new Error(runtimeArchiveError(extracted.stderr));
      const node = path.join(
        staging,
        "lib",
        process.platform === "win32" ? "node.exe" : "node",
      );
      if (
        !(await exists(node)) ||
        !(await exists(path.join(staging, "out", "node", "entry.js")))
      )
        throw new Error("IDE runtime is incomplete");
      await writeFile(
        path.join(staging, "aether-runtime.json"),
        JSON.stringify({
          version: 1,
          sha256: this.asset.sha256,
          release: ideRelease.version,
          installedAt: new Date().toISOString(),
        }),
        { mode: 0o600 },
      );
      await rm(this.root, { recursive: true, force: true });
      await rename(staging, this.root);
      this.state = { ...this.state, state: "ready", progress: 100 };
      return this.status();
    } catch (error) {
      this.state = {
        ...this.state,
        state: "error",
        error: String(error).replace(/^Error: /, ""),
      };
      throw error;
    } finally {
      await rm(archive, { force: true });
      await rm(staging, { recursive: true, force: true });
    }
  }
  async start(project: Project, theme: "dark" | "light" = "dark") {
    if (this.disposed) throw new Error("Aether is shutting down");
    if (this.baseURL && this.child && this.child.exitCode === null)
      return this.workspaceURL(project);
    if (this.starting) {
      await this.starting;
      return this.workspaceURL(project);
    }
    this.starting = this.startServer(project, theme).finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }
  private workspaceURL(project: Project) {
    const url = new URL(this.baseURL!);
    url.searchParams.set("folder", project.path);
    return url.toString();
  }
  private async startServer(project: Project, theme: "dark" | "light") {
    if (
      !this.asset ||
      !["ready", "running"].includes((await this.status()).state)
    )
      throw new Error("Install the IDE runtime first");
    const data = path.join(this.directory, "ide-data");
    await mkdir(data, { recursive: true, mode: 0o700 });
    const config = path.join(data, "config.yaml");
    await writeFile(config, "{}\n", { mode: 0o600 });
    const preferences = path.join(data, "user", "User", "settings.json");
    if (!(await exists(preferences))) {
      await mkdir(path.dirname(preferences), { recursive: true, mode: 0o700 });
      await writeFile(
        preferences,
        JSON.stringify({
          "workbench.startupEditor": "none",
          "workbench.colorTheme":
            theme === "light" ? "Default Light Modern" : "Default Dark Modern",
          "workbench.secondarySideBar.defaultVisibility": "hidden",
          "chat.disableAIFeatures": true,
          "telemetry.telemetryLevel": "off",
          "update.mode": "none",
        }),
        { mode: 0o600 },
      );
    }
    const socket = createServer();
    await new Promise<void>((resolve, reject) => {
      socket.once("error", reject);
      socket.listen(0, "127.0.0.1", resolve);
    });
    const address = socket.address();
    if (!address || typeof address === "string")
      throw new Error("Unable to allocate IDE port");
    const port = address.port;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
    const password = randomBytes(32).toString("hex");
    if (process.platform !== "win32")
      this.ipcDirectory ??= await mkdtemp("/tmp/aether-ide-");
    const child = spawn(
      path.join(
        this.root,
        "lib",
        process.platform === "win32" ? "node.exe" : "node",
      ),
      [
        path.join(this.root, "out", "node", "entry.js"),
        "--config",
        config,
        "--bind-addr",
        `127.0.0.1:${port}`,
        "--auth",
        "password",
        "--cookie-suffix",
        "aether",
        "--disable-telemetry",
        "--disable-update-check",
        "--disable-proxy",
        "--disable-getting-started-override",
        "--locale",
        "en",
        "--app-name",
        "Aether IDE",
        "--enable-remote-storage",
        ...(this.ipcDirectory
          ? ["--session-socket", path.join(this.ipcDirectory, "session.sock")]
          : []),
        "--user-data-dir",
        path.join(data, "user"),
        "--extensions-dir",
        path.join(data, "extensions"),
        project.path,
      ],
      {
        cwd: project.path,
        env: safeEnv({ PASSWORD: password }),
        shell: false,
        detached: process.platform !== "win32",
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    this.child = child;
    this.state = { ...this.state, state: "starting", error: undefined };
    let exited = false,
      spawnError = false;
    child.on("error", () => {
      spawnError = true;
    });
    child.on("exit", () => {
      exited = true;
      this.baseURL = undefined;
      if (!this.disposed) this.state = { ...this.state, state: "ready" };
    });
    child.stdout?.on("data", () => {});
    child.stderr?.on("data", () => {});
    const base = `http://127.0.0.1:${port}/`;
    try {
      for (let attempt = 0; attempt < 150; attempt++) {
        if (exited || spawnError || this.disposed)
          throw new Error("The IDE runtime stopped before startup completed");
        try {
          const response = await fetch(base + "login", {
            signal: AbortSignal.timeout(1000),
          });
          if (response.ok) break;
        } catch {
          /* Server may still be starting. */
        }
        if (attempt === 149) throw new Error("IDE startup timed out");
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const login = await fetch(base + "login", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Origin: base.slice(0, -1),
        },
        body: new URLSearchParams({ password }),
        redirect: "manual",
        signal: AbortSignal.timeout(10000),
      });
      const cookie = login.headers.get("set-cookie")?.split(";")[0];
      if (!cookie || ![200, 302].includes(login.status))
        throw new Error("Could not authenticate the private IDE session");
      const equals = cookie.indexOf("=");
      await this.session.cookies.set({
        url: base,
        name: cookie.slice(0, equals),
        value: cookie.slice(equals + 1),
        httpOnly: true,
        sameSite: "lax",
        path: "/",
      });
      this.baseURL = base;
      this.state = { ...this.state, state: "running", progress: 100 };
      return this.workspaceURL(project);
    } catch (error) {
      await this.stopServer();
      this.state = {
        ...this.state,
        state: "ready",
        error: "The IDE could not start. Choose Open full IDE to retry.",
      };
      throw error;
    }
  }
  async close() {
    this.disposed = true;
    this.installationAbort.abort();
    await Promise.allSettled([
      this.installation,
      this.starting,
      this.stopServer(),
    ]);
  }
  private async stopServer() {
    const child = this.child;
    if (!child?.pid || child.exitCode !== null || child.signalCode !== null) {
      if (this.ipcDirectory)
        await rm(this.ipcDirectory, { recursive: true, force: true });
      this.ipcDirectory = undefined;
      return;
    }
    const exited = new Promise((resolve) => child.once("exit", resolve));
    const terminate = (signal: NodeJS.Signals) => {
      try {
        if (process.platform !== "win32" && child.pid)
          process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch {}
    };
    const timer = setTimeout(() => terminate("SIGKILL"), 3000);
    terminate("SIGTERM");
    await exited;
    clearTimeout(timer);
    this.child = undefined;
    this.baseURL = undefined;
    if (this.ipcDirectory)
      await rm(this.ipcDirectory, { recursive: true, force: true });
    this.ipcDirectory = undefined;
  }
}
