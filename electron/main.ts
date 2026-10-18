import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  safeStorage,
  shell,
  session,
} from "electron";
import path from "node:path";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { z } from "zod";
import { DesktopWidget } from "./desktop-widget";
import { Store } from "./core/store";
import { Service } from "./core/service";
import { trustedRendererURL } from "./core/security";
import { checkForRelease } from "./core/release-check";
import type { ReleaseInfo } from "../shared/types";
import { IDERuntime } from "./ide/runtime";
import { IDEView, ideBounds } from "./ide/view";
import { configureProviderRuntime } from "./providers/runtime";
import { launchProviderTerminal } from "./providers/terminal";
let window: BrowserWindow | undefined,
  service: Service,
  store: Store,
  quitting = false;
let widget: DesktopWidget | undefined;
let checkedRelease: ReleaseInfo | undefined;
let ide: IDERuntime | undefined;
let ideView: IDEView | undefined;
const devURL = process.env.AETHER_DEV_URL;
if (process.env.AETHER_TEST_DATA)
  app.setPath("userData", path.resolve(process.env.AETHER_TEST_DATA));
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) app.quit();
app.on("second-instance", () => {
  if (window?.isMinimized()) window.restore();
  window?.show();
  window?.focus();
});
function trusted(event: Electron.IpcMainInvokeEvent) {
  const url = event.senderFrame?.url ?? "";
  if (
    event.sender !== window?.webContents ||
    !event.senderFrame ||
    event.senderFrame !== window.webContents.mainFrame
  )
    throw new Error("Untrusted application frame");
  if (
    !trustedRendererURL(url, path.join(__dirname, "../dist/index.html"), devURL)
  )
    throw new Error("Untrusted application origin");
}
async function boot() {
  if (process.env.AETHER_TEST_DATA)
    app.setPath("userData", path.resolve(process.env.AETHER_TEST_DATA));
  const data = app.getPath("userData");
  configureProviderRuntime(
    app.isPackaged
      ? path.join(process.resourcesPath, "provider-runtime")
      : path.resolve(".cache/provider-runtime"),
  );
  store = new Store(data);
  await store.open(path.join(__dirname, "sql-wasm.wasm"));
  const keyFile = path.join(data, "api-key.enc");
  const key = () => {
    if (!existsSync(keyFile)) return undefined;
    if (!safeStorage.isEncryptionAvailable())
      throw new Error("OS secret storage unavailable");
    return safeStorage.decryptString(readFileSync(keyFile));
  };
  service = new Service(store, key, (file) =>
    launchProviderTerminal(file, (target) => shell.openPath(target)),
  );
  window = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 980,
    minHeight: 680,
    title: "Aether Code",
    backgroundColor: "#101113",
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 18, y: 17 },
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  window.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  const ideSession = session.fromPartition("persist:aether-ide");
  ideSession.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  ide = new IDERuntime(
    data,
    ideSession,
    process.env.AETHER_TEST_DATA ? process.env.AETHER_IDE_ARCHIVE : undefined,
  );
  ideView = new IDEView(window, ide);
  window.on("close", (event) => {
    if (!quitting && widget) {
      event.preventDefault();
      window?.hide();
    }
  });
  service.subscribe((event) => {
    widget?.changed(event);
    if (window && !window.isDestroyed())
      window.webContents.send("aether:event", event);
  });
  const initialization = service.initialize({ background: true });
  ipcMain.handle("aether:command", async (event, command, payload) => {
    trusted(event);
    await initialization;
    z.string().max(80).parse(command);
    if (JSON.stringify(payload ?? "").length > 500000)
      throw new Error("Command payload exceeds limit");
    if (command === "ide.runtime.status") return ide!.status();
    if (command === "ide.runtime.install") return ide!.install();
    if (command === "ide.view.open") {
      const p = z
        .object({ projectId: z.string().uuid(), bounds: ideBounds })
        .strict()
        .parse(payload);
      return ideView!.show(
        service.project(p.projectId),
        p.bounds,
        service.settings().theme,
      );
    }
    if (command === "ide.view.overlay") {
      ideView!.setObscured(z.boolean().parse(payload));
      return true;
    }
    if (command === "ide.view.terminal") {
      z.undefined().parse(payload);
      return ideView!.openTerminal();
    }
    if (command === "ide.view.bounds") {
      ideView!.resize(ideBounds.parse(payload));
      return true;
    }
    if (command === "ide.view.hide") {
      ideView!.hide();
      return true;
    }
    if (command === "project.reveal") {
      const project = service.project(z.string().uuid().parse(payload));
      const error = await shell.openPath(project.path);
      if (error) throw new Error(error);
      return true;
    }
    if (command === "widget.show") {
      const id = z.string().max(100).optional().parse(payload);
      await widget?.show(id);
      return;
    }
    if (command === "update.check") {
      checkedRelease = await checkForRelease(app.getVersion());
      return checkedRelease;
    }
    if (command === "update.open") {
      if (!checkedRelease)
        throw new Error("Check for updates before opening a release");
      await shell.openExternal(checkedRelease.url);
      return true;
    }
    if (command === "ide.open-vscode") {
      const project = service.project(z.string().parse(payload));
      const url = "vscode://file/" + encodeURI(project.path);
      await shell.openExternal(url);
      return true;
    }
    if (command === "skill.source") {
      const url = z
        .string()
        .max(1000)
        .regex(
          /^https:\/\/github\.com\/(?:openai\/skills|anthropics\/skills|vercel-labs\/agent-skills)\/tree\/[a-f0-9]{40}\/[a-zA-Z0-9_./-]+$/,
        )
        .parse(payload);
      await shell.openExternal(url);
      return;
    }
    if (command === "project.clone.parent") {
      const result = await dialog.showOpenDialog(window!, {
        properties: ["openDirectory", "createDirectory"],
        title: "Choose where to clone the repository",
      });
      return result.canceled ? null : result.filePaths[0];
    }
    if (command === "project.choose") {
      const result = await dialog.showOpenDialog(window!, {
        properties: ["openDirectory"],
        title: "Open a local project",
      });
      return result.canceled ? null : service.addProject(result.filePaths[0]);
    }
    if (command === "prompt.attachment.choose") {
      const result = await dialog.showOpenDialog(window!, {
        properties: ["openFile"],
        title: "Attach reference material to your prompt",
        filters: [
          { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif"] },
          {
            name: "Documents",
            extensions: [
              "pdf",
              "docx",
              "doc",
              "txt",
              "md",
              "csv",
              "json",
              "log",
            ],
          },
        ],
      });
      return result.canceled
        ? null
        : service.importPromptAttachment(result.filePaths[0]);
    }
    if (command === "secret.save") {
      const value = z.string().max(2000).parse(payload);
      if (!safeStorage.isEncryptionAvailable())
        throw new Error("OS secret storage unavailable");
      writeFileSync(keyFile, safeStorage.encryptString(value), { mode: 0o600 });
      return true;
    }
    if (command === "export") {
      const p = z
        .object({
          name: z.string().regex(/^[\w.-]+$/),
          content: z.string().max(200000),
        })
        .parse(payload);
      const result = await dialog.showSaveDialog(window!, {
        defaultPath: p.name,
      });
      if (result.canceled || !result.filePath) return false;
      writeFileSync(result.filePath, p.content, { mode: 0o600 });
      return true;
    }
    if (command === "skill.import") {
      const result = await dialog.showOpenDialog(window!, {
        properties: ["openFile"],
        filters: [{ name: "Agent skill", extensions: ["md"] }],
      });
      if (result.canceled) return null;
      const content = readFileSync(result.filePaths[0], "utf8");
      if (content.length > 50000) throw new Error("Skill exceeds size limit");
      return content;
    }
    return service.command(command, payload);
  });
  await Promise.all([
    initialization,
    devURL
      ? window.loadURL(devURL)
      : window.loadFile(path.join(__dirname, "../dist/index.html")),
  ]);
  widget = new DesktopWidget(
    store,
    service,
    path.join(__dirname, "../dist/index.html"),
    devURL,
    (runId, taskId) => {
      if (!window || window.isDestroyed()) return;
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
      window.webContents.send("aether:navigate", { runId, taskId });
    },
  );
  await widget.start();
}
app
  .whenReady()
  .then(() => (hasInstanceLock ? boot() : undefined))
  .catch((error) => {
    dialog.showErrorBox("Aether could not start", String(error));
    app.quit();
  });
app.on("activate", () => {
  if (window?.isDestroyed()) return;
  window?.show();
  window?.focus();
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (!quitting && service) {
    event.preventDefault();
    quitting = true;
    widget?.dispose();
    ideView?.dispose();
    void Promise.allSettled([service.shutdown(), ide?.close()]).finally(() => {
      store.close();
      app.quit();
    });
  }
});
