import { useMemo } from 'react';
import type { Message } from '@shared/types';
import { MessageBubble } from './MessageBubble';
import { ThinkingLoader } from './ThinkingLoader';
import styles from './MessageList.module.css';

interface MessageListProps {
  messages: Message[];
  isStreaming: boolean;
}

export function MessageList({ messages, isStreaming }: MessageListProps) {
  const renderedMessages = useMemo(() => {
    return messages.map((msg, i) => (
      <MessageBubble
        key={msg.id}
        message={msg}
        i={i}
        isStreaming={isStreaming}
        messagesCount={messages.length}
      />
    ));
  }, [messages, isStreaming]);

  // Show a single "Thinking..." indicator when streaming and the last message
  // is a tool result (agent is processing next round but hasn't produced text yet).
  // This is the only case where we insert a non-message skeleton element.
  const showThinkingSkeleton = isStreaming &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'tool';

  return (
    <div className={styles.messageList}>
      {renderedMessages}
      {showThinkingSkeleton && (
        <div className={`${styles.message} ${styles.assistantMessage}`}>
          <div className={styles.messageHeader}>
            <div className={styles.avatarAssistant}>J</div>
            <span className={`${styles.senderName} ${styles.senderNameAssistant}`}>Janus</span>
            <span className={styles.aiBadge}>Agent</span>
          </div>
          <div className={styles.content}>
            <ThinkingLoader />
          </div>
        </div>
      )}
    </div>
  );
}
