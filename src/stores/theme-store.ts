import { create } from 'zustand';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  try {
    return (localStorage.getItem('janus_theme') as Theme) || 'dark';
  } catch {
    return 'dark';
  }
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  hydrateFromNative: () => Promise<void>;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),

  toggle: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('janus_theme', next);
    window.janusNative?.setSetting?.('janus_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    set({ theme: next });
  },

  hydrateFromNative: async () => {
    if (typeof window === 'undefined' || !window.janusNative?.getSettings) {
      return;
    }
    try {
      const settings = await window.janusNative.getSettings();
      if (settings.janus_theme && (settings.janus_theme === 'dark' || settings.janus_theme === 'light')) {
        const theme = settings.janus_theme as Theme;
        localStorage.setItem('janus_theme', theme);
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      }
    } catch {
      // IPC unavailable — keep localStorage value
    }
  },
}));

document.documentElement.setAttribute('data-theme', getInitialTheme());
