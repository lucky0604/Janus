import { useState } from 'react';
import type { ToolMeta } from '@shared/types';
import styles from './MessageList.module.css';

// ---- Tool icon mapping ----
const TOOL_ICONS: Record<string, string> = {
  web_search: '🔍',
  web_fetch: '🌐',
  read_file: '📄',
  write_file: '✏️',
  list_dir: '📁',
  search_content: '🔎',
  shell_exec: '⌨️',
  git_status: '📋',
  git_diff: '📝',
};

const TOOL_LABELS: Record<string, string> = {
  web_search: 'Searching the web',
  web_fetch: 'Fetching page',
  read_file: 'Reading file',
  write_file: 'Writing file',
  list_dir: 'Listing directory',
  search_content: 'Searching code',
  shell_exec: 'Running command',
  git_status: 'Checking git status',
  git_diff: 'Viewing diff',
};

function sourceDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function sourceIcon(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.includes('github.com')) return '🐙 ';
    if (host.includes('stackoverflow.com')) return '📚 ';
    if (host.includes('wikipedia.org')) return '📖 ';
    if (host.includes('docs.')) return '📑 ';
    return '🔗 ';
  } catch {
    return '🔗 ';
  }
}

// ---- ToolCallBlock ----
export function ToolCallBlock({ meta }: { meta: ToolMeta }) {
  const icon = TOOL_ICONS[meta.name] || '⚙️';
  const label = TOOL_LABELS[meta.name] || meta.name;
  const isRunning = meta.status === 'running';

  return (
    <div className={`${styles.toolBlock} ${isRunning ? styles.toolRunning : styles.toolDone}`}>
      <div className={styles.toolHeader}>
        <span className={styles.toolIcon}>{icon}</span>
        <span className={styles.toolLabel}>{label}</span>
        {meta.argSummary && (
          <span className={styles.toolArgSummary}>{meta.argSummary}</span>
        )}
        {isRunning ? (
          <span className={styles.toolSpinner} />
        ) : meta.status === 'error' ? (
          <span className={styles.toolStatusError}>✗</span>
        ) : (
          <span className={styles.toolStatusOk}>✓</span>
        )}
      </div>
      {/* Source links for search results */}
      {meta.sources && meta.sources.length > 0 && (
        <div className={styles.toolSources}>
          {meta.sources.map((s, i) => (
            <a
              key={i}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.sourceLink}
              title={s.url}
            >
              {sourceIcon(s.url)}{sourceDomain(s.url)}
            </a>
          ))}
        </div>
      )}
      {/* Result summary */}
      {meta.resultSummary && meta.status === 'done' && !meta.sources?.length && (
        <div className={styles.toolResultSummary}>{meta.resultSummary}</div>
      )}
    </div>
  );
}

// ---- Expandable raw output ----
export function ExpandableOutput({ output }: { output: string }) {
  const [expanded, setExpanded] = useState(false);
  if (!output) return null;

  return (
    <div className={styles.expandableOutput}>
      <button className={styles.expandToggle} onClick={() => setExpanded(!expanded)}>
        {expanded ? '▼ Hide output' : '▶ Show output'}
      </button>
      {expanded && (
        <pre className={styles.rawOutput}>{output.slice(0, 2000)}{output.length > 2000 ? '\n... (truncated)' : ''}</pre>
      )}
    </div>
  );
}
