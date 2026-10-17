import { BrowserWindow, ipcMain, screen } from "electron";
import path from "node:path";
import { z } from "zod";
import type { Project, Run, RunEvent } from "../shared/types";
import { widgetActivity } from "../shared/widget";
import type { Store } from "./core/store";
import type { Service } from "./core/service";
import { trustedRendererURL } from "./core/security";

const preferences = z.object({
  version: z.literal(1).default(1),
  visible: z.boolean().default(true),
  compact: z.boolean().default(false),
  pinned: z.boolean().default(true),
  projectId: z.string().default(""),
  position: z.object({ x: z.number().int(), y: z.number().int() }).optional(),
});
export class DesktopWidget {
  private window?: BrowserWindow;
  private prefs: z.infer<typeof preferences>;
  private timer?: NodeJS.Timeout;
  private moveTimer?: NodeJS.Timeout;
  private pointerTimer?: NodeJS.Timeout;
  private disposed = false;
  constructor(
    private store: Store,
    private service: Service,
    private entry: string,
    private devURL: string | undefined,
    private open: (runId: string, taskId?: string) => void,
  ) {
    const saved = preferences.safeParse(store.get("widget", "global"));
    this.prefs = saved.success ? saved.data : preferences.parse({});
    ipcMain.handle(
      "widget:command",
      (event, command: unknown, payload: unknown) => {
        const window = this.window;
        if (
          !window ||
          event.sender !== window.webContents ||
          event.senderFrame !== window.webContents.mainFrame ||
          !trustedRendererURL(
            event.senderFrame?.url ?? "",
            this.entry,
            this.devURL,
          )
        )
          throw new Error("Untrusted widget frame");
        if (
          typeof command !== "string" ||
          JSON.stringify(payload ?? "").length > 2000
        )
          throw new Error("Invalid widget command");
        return this.command(command, payload);
      },
    );
  }
  private save() {
    this.store.put("widget", "global", this.prefs);
  }
  async start() {
    if (this.prefs.visible) await this.show();
  }
  async show(projectId?: string) {
    if (projectId !== undefined) {
      if (projectId) this.service.project(projectId);
      this.prefs.projectId = projectId;
    }
    this.prefs.visible = true;
    this.save();
    if (!this.window || this.window.isDestroyed()) {
      const area = this.prefs.position
        ? screen.getDisplayNearestPoint(this.prefs.position).workArea
        : screen.getPrimaryDisplay().workArea;
      const width = 360,
        height = this.prefs.compact ? 155 : 500;
      const x = Math.round(
        Math.max(
          area.x,
          Math.min(
            this.prefs.position?.x ?? area.x + area.width - width - 24,
            area.x + area.width - width,
          ),
        ),
      );
      const y = Math.round(
        Math.max(
          area.y,
          Math.min(
            this.prefs.position?.y ?? area.y + area.height - height - 24,
            area.y + area.height - height,
          ),
        ),
      );
      this.window = new BrowserWindow({
        width,
        height,
        x,
        y,
        show: false,
        frame: false,
        resizable: false,
        minimizable: false,
        maximizable: false,
        fullscreenable: false,
        skipTaskbar: true,
        alwaysOnTop: this.prefs.pinned,
        title: "Aether activity",
        backgroundColor: "#131416",
        webPreferences: {
          preload: path.join(__dirname, "widget-preload.cjs"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
        },
      });
      this.window.on("page-title-updated", (event) => event.preventDefault());
      this.window.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
      });
      this.window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      this.window.webContents.on("will-navigate", (event) =>
        event.preventDefault(),
      );
      this.window.on("close", (event) => {
        if (!this.disposed) {
          event.preventDefault();
          this.hide();
        }
      });
      this.window.on("moved", () => {
        clearTimeout(this.moveTimer);
        this.moveTimer = setTimeout(() => {
          if (!this.disposed && this.window && !this.window.isDestroyed()) {
            const { x, y } = this.window.getBounds();
            this.prefs.position = { x, y };
            this.save();
          }
        }, 300);
      });
      if (this.devURL) {
        const url = new URL(this.devURL);
        url.searchParams.set("widget", "1");
        await this.window.loadURL(url.toString());
      } else await this.window.loadFile(this.entry, { query: { widget: "1" } });
    }
    this.window.setAlwaysOnTop(this.prefs.pinned, "floating");
    this.keepOnScreen();
    this.window.showInactive();
    if (!this.pointerTimer) {
      let previous = "";
      this.pointerTimer = setInterval(() => {
        if (
          !this.window ||
          this.window.isDestroyed() ||
          !this.window.isVisible()
        )
          return;
        const point = screen.getCursorScreenPoint();
        const key = `${point.x}:${point.y}`;
        if (key === previous) return;
        previous = key;
        const bounds = this.window.getBounds();
        this.window.webContents.send("widget:pointer", {
          clientX: point.x - bounds.x,
          clientY: point.y - bounds.y,
        });
      }, 50);
      this.pointerTimer.unref();
    }
    this.window.webContents.send("widget:update");
  }
  private keepOnScreen() {
    if (!this.window) return;
    const bounds = this.window.getBounds(),
      area = screen.getDisplayMatching(bounds).workArea;
    this.window.setPosition(
      Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width)),
      Math.max(
        area.y,
        Math.min(bounds.y, area.y + area.height - bounds.height),
      ),
    );
  }
  hide() {
    clearInterval(this.pointerTimer);
    this.pointerTimer = undefined;
    this.prefs.visible = false;
    this.save();
    this.window?.hide();
  }
  changed(event: RunEvent) {
    if (event.type === "agent.output" || !this.prefs.visible || this.timer)
      return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.window && !this.window.isDestroyed())
        this.window.webContents.send("widget:update");
    }, 250);
  }
  private command(command: string, payload: unknown) {
    switch (command) {
      case "snapshot": {
        const offset = z
          .number()
          .int()
          .min(0)
          .max(10000000)
          .default(0)
          .parse(payload);
        const projects = this.store.all<Project>("project");
        if (
          this.prefs.projectId &&
          !projects.some((project) => project.id === this.prefs.projectId)
        ) {
          this.prefs.projectId = "";
          this.save();
        }
        return {
          ...widgetActivity(
            projects,
            this.store.all<Run>("run"),
            this.prefs.projectId,
            offset,
          ),
          compact: this.prefs.compact,
          pinned: this.prefs.pinned,
        };
      }
      case "project": {
        const id = z.string().max(100).parse(payload);
        if (id) this.service.project(id);
        this.prefs.projectId = id;
        this.save();
        this.window?.webContents.send("widget:update");
        return;
      }
      case "open": {
        const p = z
          .object({
            runId: z.string().max(100),
            taskId: z.string().max(100).optional(),
          })
          .parse(payload);
        const run = this.service.run(p.runId);
        if (p.taskId && !run.tasks.some((task) => task.id === p.taskId))
          throw new Error("Task not found");
        this.open(run.id, p.taskId);
        return;
      }
      case "compact": {
        this.prefs.compact = z.boolean().parse(payload);
        this.save();
        if (this.window) {
          this.window.setSize(360, this.prefs.compact ? 155 : 500);
          this.keepOnScreen();
          this.window.webContents.send("widget:update");
        }
        return;
      }
      case "pin":
        this.prefs.pinned = z.boolean().parse(payload);
        this.save();
        this.window?.setAlwaysOnTop(this.prefs.pinned, "floating");
        this.window?.webContents.send("widget:update");
        return;
      case "hide":
        this.hide();
        return;
      default:
        throw new Error("Unsupported widget command");
    }
  }
  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    clearTimeout(this.moveTimer);
    clearInterval(this.pointerTimer);
    ipcMain.removeHandler("widget:command");
    this.window?.destroy();
  }
}
