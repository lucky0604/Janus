import { create } from 'zustand';
import { migrateLocalStorageKeys, readStorage, STORAGE_KEYS } from '../lib/storage-keys';

type Theme = 'dark' | 'light';

migrateLocalStorageKeys();

function getInitialTheme(): Theme {
  try {
    return (readStorage('theme', 'dark') as Theme) || 'dark';
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
    localStorage.setItem(STORAGE_KEYS.theme, next);
    window.kavisNative?.setSetting?.(STORAGE_KEYS.theme, next);
    document.documentElement.setAttribute('data-theme', next);
    set({ theme: next });
  },

  hydrateFromNative: async () => {
    if (typeof window === 'undefined' || !window.kavisNative?.getSettings) {
      return;
    }
    try {
      const settings = await window.kavisNative.getSettings();
      const themeValue = settings[STORAGE_KEYS.theme];
      if (themeValue && (themeValue === 'dark' || themeValue === 'light')) {
        const theme = themeValue as Theme;
        localStorage.setItem(STORAGE_KEYS.theme, theme);
        document.documentElement.setAttribute('data-theme', theme);
        set({ theme });
      }
    } catch {
      // IPC unavailable — keep localStorage value
    }
  },
}));

document.documentElement.setAttribute('data-theme', getInitialTheme());
