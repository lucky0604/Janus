import { create } from 'zustand';

interface LayoutState {
  sidebarWidth: number;
  inspectorWidth: number;
  ptyHeight: number;
  setSidebarWidth: (w: number) => void;
  setInspectorWidth: (w: number) => void;
  setPtyHeight: (h: number) => void;
}

function loadNum(key: string, fallback: number): number {
  try {
    const v = localStorage.getItem(key);
    return v ? Number(v) : fallback;
  } catch {
    return fallback;
  }
}

export const useLayoutStore = create<LayoutState>((set) => ({
  sidebarWidth: loadNum('janus_sidebar_w', 260),
  inspectorWidth: loadNum('janus_inspector_w', 380),
  ptyHeight: loadNum('janus_pty_h', 40),

  setSidebarWidth: (w) => {
    localStorage.setItem('janus_sidebar_w', String(w));
    set({ sidebarWidth: w });
  },
  setInspectorWidth: (w) => {
    localStorage.setItem('janus_inspector_w', String(w));
    set({ inspectorWidth: w });
  },
  setPtyHeight: (h) => {
    localStorage.setItem('janus_pty_h', String(h));
    set({ ptyHeight: h });
  },
}));
