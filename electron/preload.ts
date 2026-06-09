/**
 * Janus Preload Script
 *
 * Exposes a safe bridge from renderer to main process via contextBridge.
 * Currently minimal — the renderer talks to the embedded server via HTTP/SSE,
 * so no IPC is needed for chat. This bridge is for future native features:
 * - File dialog (select workspace folder)
 * - Native menu actions
 * - System info (platform, paths)
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('janusNative', {
  /** Get the platform (darwin, win32, linux) */
  platform: process.platform,

  /** Open a native folder picker dialog */
  selectFolder: async (): Promise<string | null> => {
    return ipcRenderer.invoke('select-folder');
  },

  /** Get app version */
  getVersion: (): string => {
    return ipcRenderer.sendSync('get-version');
  },

  /** Listen for menu events from main process */
  onMenuAction: (callback: (action: string) => void) => {
    ipcRenderer.on('menu-action', (_event, action) => callback(action));
  },
});
