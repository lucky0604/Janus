import { create } from 'zustand';
import type { SlashItem, SlashItemsResponse } from '../../shared/types';

interface SlashState {
  items: SlashItem[];
  loaded: boolean;
  loading: boolean;
  error: string | null;
  load: (force?: boolean) => Promise<void>;
}

export const useSlashStore = create<SlashState>((set, get) => ({
  items: [],
  loaded: false,
  loading: false,
  error: null,

  load: async (force = false) => {
    const state = get();
    if (state.loading) return;
    if (state.loaded && !force) return;
    set({ loading: true, error: null });
    try {
      const res = await fetch('/api/skills');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: SlashItemsResponse = await res.json();
      set({ items: data.items, loaded: true, loading: false });
    } catch (err) {
      set({
        loading: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },
}));
