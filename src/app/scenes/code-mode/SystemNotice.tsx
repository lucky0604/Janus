import styles from './SystemNotice.module.css';

interface SystemNoticeProps {
  tag?: string;
  kind?: 'command' | 'skill-error' | 'info';
  content: string;
}

export function SystemNotice({ tag, kind = 'command', content }: SystemNoticeProps) {
  const isError = kind === 'skill-error';
  const lines = content.split('\n');
  const isMultiline = lines.length > 1;

  return (
    <div className={`${styles.notice} ${isError ? styles.error : ''}`}>
      {tag && (
        <span className={styles.tag} aria-label="command">
          /{tag}
        </span>
      )}
      <div className={`${styles.body} ${isMultiline ? styles.multiline : ''}`}>
        {isMultiline ? <pre className={styles.pre}>{content}</pre> : <span>{content}</span>}
      </div>
    </div>
  );
}
