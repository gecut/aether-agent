import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("aetherWidget", {
  invoke: (command: string, payload: unknown) =>
    ipcRenderer.invoke("widget:command", command, payload),
  onUpdate: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on("widget:update", listener);
    return () => ipcRenderer.removeListener("widget:update", listener);
  },
});
