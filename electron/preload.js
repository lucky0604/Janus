// electron/preload.ts
import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("janusNative", {
  /** Get the platform (darwin, win32, linux) */
  platform: process.platform,
  /** Open a native folder picker dialog */
  selectFolder: async () => {
    return ipcRenderer.invoke("select-folder");
  },
  /** Get app version */
  getVersion: () => {
    return ipcRenderer.sendSync("get-version");
  },
  /** Listen for menu events from main process */
  onMenuAction: (callback) => {
    ipcRenderer.on("menu-action", (_event, action) => callback(action));
  }
});
