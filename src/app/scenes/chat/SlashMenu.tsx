import { useEffect, useRef } from 'react';
import type { SlashItem } from '../../../../shared/types';
import styles from './SlashMenu.module.css';

interface SlashMenuProps {
  items: SlashItem[];
  activeIndex: number;
  onSelect: (item: SlashItem) => void;
  onHover: (idx: number) => void;
}

function scopeLabel(item: SlashItem): string {
  if (item.kind === 'builtin') return 'builtin';
  if (item.scope === 'project') return `project · ${item.source ?? ''}`.trim();
  return `user · ${item.source ?? ''}`.trim();
}

export function SlashMenu({ items, activeIndex, onSelect, onHover }: SlashMenuProps) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const node = listRef.current?.children[activeIndex] as HTMLElement | undefined;
    node?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (items.length === 0) return null;

  return (
    <div className={styles.menu} role="listbox">
      <ul ref={listRef} className={styles.list}>
        {items.map((item, idx) => (
          <li
            key={`${item.scope}:${item.kind}:${item.name}`}
            className={`${styles.item} ${idx === activeIndex ? styles.active : ''}`}
            role="option"
            aria-selected={idx === activeIndex}
            onMouseEnter={() => onHover(idx)}
            onMouseDown={(e) => {
              e.preventDefault();
              onSelect(item);
            }}
          >
            <div className={styles.row}>
              <span className={styles.name}>
                /{item.name}
                {item.argumentHint && (
                  <span className={styles.argHint}> {item.argumentHint}</span>
                )}
              </span>
              <span className={styles.scope}>{scopeLabel(item)}</span>
            </div>
            {item.description && (
              <div className={styles.desc} title={item.description}>
                {item.description}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
