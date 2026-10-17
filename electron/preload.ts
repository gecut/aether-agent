import { contextBridge, ipcRenderer } from "electron";
import type { RunEvent } from "../shared/types";
contextBridge.exposeInMainWorld("aether", {
  desktop: true,
  invoke: (command: string, payload: unknown) =>
    ipcRenderer.invoke("aether:command", command, payload),
  onNavigate: (
    callback: (target: { runId: string; taskId?: string }) => void,
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      target: { runId: string; taskId?: string },
    ) => callback(target);
    ipcRenderer.on("aether:navigate", listener);
    return () => ipcRenderer.removeListener("aether:navigate", listener);
  },
  onEvent: (callback: (event: RunEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: RunEvent) =>
      callback(data);
    ipcRenderer.on("aether:event", listener);
    return () => ipcRenderer.removeListener("aether:event", listener);
  },
});
