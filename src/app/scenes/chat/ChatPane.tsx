import { useEffect, useRef, useState } from 'react';
import { useChatStore } from '../../../stores/chat-store';
import { useAgentStore } from '../../../stores/app-stores';
import { MessageList } from './MessageList';
import { ChatInput } from './ChatInput';
import { ModeSelector } from './ModeSelector';
import styles from './ChatPane.module.css';

export function ChatPane() {
  const { messages, isStreaming, isConnecting, connectionError, errorMessage, sendMessage, stopGeneration, clearError } =
    useChatStore();
  const { activeMode, activeRole, modes, roles } = useAgentStore();
  const listRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const currentMode = modes.find(m => m.id === activeMode);
  const currentRole = activeMode === 'code' ? roles.find(r => r.id === activeRole) : undefined;

  const placeholderMap: Record<string, string> = {
    work: 'Describe the task, goal, or bug',
    code_agentic: 'Describe the task, goal, or bug for the AI agent',
    code_plan: 'What do you want to plan or explore?',
    code_debug: 'Describe the error or unexpected behavior',
    code_ask: 'Ask any question about the codebase',
  };

  function getPlaceholder(): string {
    if (activeMode === 'code') {
      return placeholderMap[`code_${activeRole}`] || placeholderMap.work;
    }
    return placeholderMap.work;
  }

  useEffect(() => {
    if (!userScrolledUp && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages, userScrolledUp]);

  const handleScroll = () => {
    if (!listRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = listRef.current;
    setUserScrolledUp(scrollHeight - scrollTop - clientHeight > 100);
  };

  const emptyName = currentMode?.name || 'Janus';
  const emptyDescription = activeMode === 'code' && currentRole
    ? currentRole.description
    : (currentMode?.description || 'Ask Janus to investigate, build, or plan');

  return (
    <div className={styles.chatPane}>
      {/* Mode selector (segmented control) */}
      <div className={styles.agentHeader}>
        <ModeSelector />
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className={styles.errorBanner}>
          <span>{errorMessage}</span>
          <button className={styles.errorDismiss} onClick={clearError} title="Dismiss">×</button>
        </div>
      )}

      {/* Connection error banner */}
      {connectionError && (
        <div className={styles.reconnectBanner}>
          Connection interrupted. Reconnecting...
        </div>
      )}

      {/* Message list */}
      <div className={styles.messageArea} ref={listRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <h2 className={styles.emptyTitle}>{emptyName}</h2>
            <p className={styles.emptyText}>{emptyDescription}</p>
          </div>
        ) : (
          <div className={styles.messageColumn}>
            <MessageList
              messages={messages}
              isStreaming={isStreaming}
            />
          </div>
        )}
      </div>

      {/* Composer */}
      <ChatInput
        onSend={sendMessage}
        onStop={stopGeneration}
        isStreaming={isStreaming}
        isConnecting={isConnecting}
        placeholder={getPlaceholder()}
      />
    </div>
  );
}