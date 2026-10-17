import { BrowserWindow, WebContentsView, shell } from "electron";
import { z } from "zod";
import type { Project } from "../../shared/types";
import { IDERuntime } from "./runtime";

export const ideBounds = z
  .object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().finite().min(0),
    height: z.number().finite().min(0),
  })
  .strict();
export type IDEBounds = z.infer<typeof ideBounds>;
export class IDEView {
  private view?: WebContentsView;
  private attached = false;
  private url?: string;
  private generation = 0;
  constructor(
    private window: BrowserWindow,
    private runtime: IDERuntime,
  ) {}
  async show(project: Project, bounds: IDEBounds, theme: "dark" | "light") {
    const generation = ++this.generation;
    const url = await this.runtime.start(project, theme);
    if (generation !== this.generation || this.window.isDestroyed())
      return false;
    if (!this.view) {
      this.view = new WebContentsView({
        webPreferences: {
          partition: "persist:aether-ide",
          contextIsolation: true,
          sandbox: true,
          nodeIntegration: false,
          webSecurity: true,
        },
      });
      this.view.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith("https://")) void shell.openExternal(url);
        return { action: "deny" };
      });
      this.view.webContents.on("will-navigate", (event, next) => {
        if (!this.url || new URL(next).origin !== new URL(this.url).origin)
          event.preventDefault();
      });
    }
    if (this.url !== url) {
      this.url = url;
      try {
        await this.view.webContents.loadURL(url);
      } catch (error) {
        if (generation === this.generation) {
          this.url = undefined;
          this.hide();
        }
        throw error;
      }
    }
    if (generation !== this.generation || this.window.isDestroyed())
      return false;
    if (!this.attached) {
      this.window.contentView.addChildView(this.view);
      this.attached = true;
    }
    this.resize(bounds);
    if (this.attached && generation === this.generation)
      this.view.webContents.focus();
    return true;
  }
  resize(bounds: IDEBounds) {
    if (!this.view || !this.attached) return;
    const factor = this.window.webContents.getZoomFactor();
    const [width, height] = this.window.getContentSize();
    const x = Math.max(0, Math.min(width, Math.round(bounds.x * factor)));
    const y = Math.max(0, Math.min(height, Math.round(bounds.y * factor)));
    this.view.setBounds({
      x,
      y,
      width: Math.max(
        0,
        Math.min(width - x, Math.round(bounds.width * factor)),
      ),
      height: Math.max(
        0,
        Math.min(height - y, Math.round(bounds.height * factor)),
      ),
    });
  }
  hide() {
    this.generation++;
    if (this.view && this.attached && !this.window.isDestroyed()) {
      this.window.contentView.removeChildView(this.view);
      this.window.webContents.focus();
    }
    this.attached = false;
  }
  dispose() {
    this.hide();
    this.view?.webContents.close();
    this.view = undefined;
  }
}
