import { create } from 'zustand';
import { migrateLocalStorageKeys, readStorage, STORAGE_KEYS } from '../lib/storage-keys';

interface LayoutState {
  sidebarWidth: number;
  inspectorWidth: number;
  ptyHeight: number;
  setSidebarWidth: (w: number) => void;
  setInspectorWidth: (w: number) => void;
  setPtyHeight: (h: number) => void;
}

migrateLocalStorageKeys();

function loadNum(key: keyof typeof STORAGE_KEYS, fallback: number): number {
  try {
    const v = readStorage(key);
    return v ? Number(v) : fallback;
  } catch {
    return fallback;
  }
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarWidth: loadNum('sidebarWidth', 260),
  inspectorWidth: loadNum('inspectorWidth', 380),
  ptyHeight: loadNum('ptyHeight', 40),

  setSidebarWidth: (w) => {
    localStorage.setItem(STORAGE_KEYS.sidebarWidth, String(w));
    set({ sidebarWidth: w });
  },
  setInspectorWidth: (w) => {
    localStorage.setItem(STORAGE_KEYS.inspectorWidth, String(w));
    set({ inspectorWidth: w });
  },
  setPtyHeight: (h) => {
    localStorage.setItem(STORAGE_KEYS.ptyHeight, String(h));
    set({ ptyHeight: h });
  },
}));
