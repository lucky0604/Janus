import type { Message } from '@shared/types';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { CodeBlock } from './CodeBlock';
import { ToolCallBlock, ExpandableOutput } from './ToolCallBlock';
import { EventCard } from './EventCards';
import { ThinkingLoader } from './ThinkingLoader';
import styles from './MessageList.module.css';

// ---- MessageBubble ----
export function MessageBubble({ message, isStreaming, i: msgIndex, messagesCount }: {
  message: Message;
  isStreaming: boolean;
  i: number;
  messagesCount: number;
}) {
  // Tool messages with meta get rich rendering
  if (message.role === 'tool' && message.toolMeta) {
    return (
      <div className={`${styles.message} ${styles.toolMessage}`}>
        <ToolCallBlock meta={message.toolMeta} />
        {message.toolMeta.rawOutput && <ExpandableOutput output={message.toolMeta.rawOutput} />}
      </div>
    );
  }

  // System messages with eventMeta get rich event cards
  if (message.role === 'system' && message.eventMeta) {
    return (
      <div className={`${styles.message} ${styles.eventMessage}`}>
        <EventCard meta={message.eventMeta} />
      </div>
    );
  }

  // Legacy tool messages without meta (backward compat)
  if (message.role === 'tool' && !message.toolMeta) {
    return null; // Skip bare tool messages with no metadata
  }

  // System messages without eventMeta — skip (internal prompts not shown)
  if (message.role === 'system' && !message.eventMeta) {
    return null;
  }

  const cls = () => {
    switch (message.role) {
      case 'user': return styles.userMessage;
      case 'assistant': return styles.assistantMessage;
      default: return styles.assistantMessage;
    }
  };

  const renderHeader = () => {
    if (message.role === 'user') {
      return (
        <div className={styles.messageHeader}>
          <div className={styles.avatarUser}>U</div>
          <span className={styles.senderName}>You</span>
        </div>
      );
    }
    if (message.role === 'assistant') {
      return (
        <div className={styles.messageHeader}>
          <div className={styles.avatarAssistant}>J</div>
          <span className={`${styles.senderName} ${styles.senderNameAssistant}`}>Janus</span>
          <span className={styles.aiBadge}>Agent</span>
        </div>
      );
    }
    return null;
  };

  const isAssistant = message.role === 'assistant';

  // Show "Thinking..." only for the LAST assistant message that is still
  // empty AND streaming is active. This handles the initial "waiting for
  // first token" state as well as new rounds that haven't produced text yet.
  const showThinking = isStreaming &&
    isAssistant &&
    !message.content &&
    msgIndex === messagesCount - 1;

  return (
    <div className={`${styles.message} ${cls()}`}>
      {renderHeader()}
      <div className={styles.content}>
        {message.content ? (
          isAssistant ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children, ...props }: any) => {
                  const isCodeBlock = children && (
                    (children.type === 'code') ||
                    (Array.isArray(children) && children.some((c: any) => c && c.type === 'code'))
                  );
                  if (isCodeBlock) {
                    return <CodeBlock>{children}</CodeBlock>;
                  }
                  return <pre {...props}>{children}</pre>;
                }
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            message.content
          )
        ) : (showThinking ? (
          <ThinkingLoader />
        ) : null)}
      </div>
    </div>
  );
}
