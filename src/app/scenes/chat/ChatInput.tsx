import { useRef, useState, useCallback, KeyboardEvent, useEffect } from 'react';
import { useAgentStore } from '../../../stores/agent-store';
import { useChatStore } from '../../../stores/chat-store';
import { RoleSelector } from './RoleSelector';
import { SlashMenu } from './SlashMenu';
import { useSlashMenu } from './useSlashMenu';
import { executeBuiltinCommand, parseSlashLine } from './builtin-commands';
import { expandSkill } from './skill-loader';
import type { SlashItem } from '../../../../shared/types';
import styles from './ChatInput.module.css';

interface ChatInputProps {
  onSend: (message: string) => void;
  onStop: () => void;
  isStreaming: boolean;
  isConnecting: boolean;
  placeholder?: string;
}

function postSystemMessage(content: string) {
  useChatStore.getState().addMessage({
    id: crypto.randomUUID(),
    role: 'system',
    content,
    timestamp: Date.now(),
  });
}

export function ChatInput({ onSend, onStop, isStreaming, isConnecting, placeholder }: ChatInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const slash = useSlashMenu({ value });

  useEffect(() => {
    const handle = (e: globalThis.KeyboardEvent) => {
      if (e.key === '.' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        const store = useAgentStore.getState();
        if (store.activeMode !== 'code') return;
        const roles = store.roles;
        if (roles.length === 0) return;
        const idx = roles.findIndex((r) => r.id === store.activeRole);
        const next = roles[(idx + 1) % roles.length];
        store.setRole(next.id);
      }
    };
    document.addEventListener('keydown', handle);
    return () => document.removeEventListener('keydown', handle);
  }, []);

  const resetInput = useCallback(() => {
    setValue('');
    slash.reset();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [slash]);

  const triggerSlashItem = useCallback(
    async (item: SlashItem, rawValue: string) => {
      const parsed = parseSlashLine(rawValue);
      const args = parsed?.args ?? [];

      if (item.kind === 'builtin') {
        const result = executeBuiltinCommand(item.name, args);
        if (result.handled && result.message) postSystemMessage(result.message);
        resetInput();
        return;
      }

      try {
        const body = await expandSkill(item, args.join(' '));
        const trimmed = body.trim();
        if (!trimmed) {
          postSystemMessage(`Skill "${item.name}" produced empty content.`);
          resetInput();
          return;
        }
        resetInput();
        onSend(trimmed);
      } catch (err) {
        postSystemMessage(
          `Failed to load skill "${item.name}": ${err instanceof Error ? err.message : String(err)}`,
        );
        resetInput();
      }
    },
    [onSend, resetInput],
  );

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || isStreaming || isConnecting) return;

    if (slash.open && slash.items[slash.activeIndex]) {
      void triggerSlashItem(slash.items[slash.activeIndex], value);
      return;
    }

    const parsed = parseSlashLine(trimmed);
    if (parsed) {
      const result = executeBuiltinCommand(parsed.command, parsed.args);
      if (result.handled) {
        if (result.message) postSystemMessage(result.message);
        resetInput();
        return;
      }
    }

    onSend(trimmed);
    resetInput();
  }, [value, isStreaming, isConnecting, onSend, slash, triggerSlashItem, resetInput]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.open) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        slash.setActiveIndex((slash.activeIndex + 1) % slash.items.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        slash.setActiveIndex(
          (slash.activeIndex - 1 + slash.items.length) % slash.items.length,
        );
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        const item = slash.items[slash.activeIndex];
        if (item) void triggerSlashItem(item, value);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        slash.close();
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        onStop();
      } else {
        handleSend();
      }
      return;
    }

    if (e.key === 'Escape' && isStreaming) {
      onStop();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    const ta = e.target;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
  };

  const isEmpty = value.trim().length === 0;
  const isDisabled = isEmpty || isConnecting;

  return (
    <div className={styles.composer}>
      <div className={styles.composerInner}>
        <div className={styles.inputArea}>
          {slash.open && (
            <SlashMenu
              items={slash.items}
              activeIndex={slash.activeIndex}
              onSelect={(item) => void triggerSlashItem(item, value)}
              onHover={slash.setActiveIndex}
            />
          )}
          <textarea
            ref={textareaRef}
            className={styles.textarea}
            value={value}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={placeholder || 'Describe the task, goal, or bug'}
            rows={1}
            disabled={isConnecting}
            autoFocus
          />
        </div>
        <div className={styles.toolbar}>
          <div className={styles.toolbarLeft}>
            <RoleSelector />
            <span className={styles.shortcutHint}>⌘Enter to send</span>
          </div>
          <div className={styles.toolbarRight}>
            {isStreaming ? (
              <button
                className={styles.stopButton}
                onClick={onStop}
                title="Stop generation (Esc)"
                aria-label="停止生成"
              >
                <span className={styles.stopIcon}>■</span>
              </button>
            ) : (
              <button
                className={`${styles.sendButton} ${isDisabled ? styles.sendButtonDisabled : ''}`}
                onClick={handleSend}
                disabled={isDisabled}
                title="Send message (Enter)"
                aria-label="发送消息"
                aria-disabled={isDisabled}
              >
                <span className={styles.sendIcon}>↑</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
