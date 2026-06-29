import { useMemo, useState, useEffect, useCallback } from 'react';
import type { SlashItem } from '../../../../shared/types';
import { useSlashStore } from '../../../stores/slash-store';

interface UseSlashMenuOptions {
  value: string;
}

interface UseSlashMenuResult {
  open: boolean;
  items: SlashItem[];
  activeIndex: number;
  query: string;
  setActiveIndex: (idx: number) => void;
  close: () => void;
  reset: () => void;
}

function isSlashTrigger(value: string): { matched: boolean; query: string } {
  if (!value.startsWith('/')) return { matched: false, query: '' };
  const firstLine = value.split('\n', 1)[0];
  if (firstLine.includes(' ')) return { matched: false, query: '' };
  return { matched: true, query: firstLine.slice(1) };
}

function fuzzyMatch(item: SlashItem, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  const name = item.name.toLowerCase();
  const desc = item.description.toLowerCase();
  if (name === q) return 1000;
  if (name.startsWith(q)) return 500 - (name.length - q.length);
  if (name.includes(q)) return 200;
  if (desc.includes(q)) return 50;
  let qi = 0;
  for (let i = 0; i < name.length && qi < q.length; i++) {
    if (name[i] === q[qi]) qi++;
  }
  if (qi === q.length) return 10;
  return 0;
}

export function useSlashMenu({ value }: UseSlashMenuOptions): UseSlashMenuResult {
  const allItems = useSlashStore((s) => s.items);
  const loaded = useSlashStore((s) => s.loaded);
  const load = useSlashStore((s) => s.load);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!loaded) load();
  }, [loaded, load]);

  const trigger = isSlashTrigger(value);

  useEffect(() => {
    if (!trigger.matched) setDismissed(false);
  }, [trigger.matched]);

  const items = useMemo(() => {
    if (!trigger.matched) return [];
    const scored = allItems
      .map((item) => ({ item, score: fuzzyMatch(item, trigger.query) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.item);
  }, [allItems, trigger.matched, trigger.query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [trigger.query, items.length]);

  const open = trigger.matched && !dismissed && items.length > 0;

  const close = useCallback(() => setDismissed(true), []);
  const reset = useCallback(() => {
    setDismissed(false);
    setActiveIndex(0);
  }, []);

  return {
    open,
    items,
    activeIndex,
    query: trigger.query,
    setActiveIndex,
    close,
    reset,
  };
}
