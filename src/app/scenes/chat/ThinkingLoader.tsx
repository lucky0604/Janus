import styles from './MessageList.module.css';

// ---- Beautiful CSS-only Thinking Loader ----
export function ThinkingLoader() {
  return (
    <div className={styles.thinkingContainer}>
      <div className={styles.thinkingDot} />
      <div className={styles.thinkingDot} />
      <div className={styles.thinkingDot} />
      <span className={styles.thinkingText}>Thinking...</span>
    </div>
  );
}
