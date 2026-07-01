import { useState, useMemo } from 'react';
import type { ToolCallState } from '../../../stores/code-run-types';
import msgStyles from '../chat/MessageList.module.css';

interface Props {
  toolCalls: ToolCallState[];
}

/**
 * Codex-style aggregated tool activity summary.
 * Default: single compact line. Click to expand the full list.
 */
export function ToolActivityBlock({ toolCalls }: Props) {
  const [expanded, setExpanded] = useState(false);

  const stats = useMemo(() => {
    let running = 0;
    let succeeded = 0;
    let failed = 0;
    for (const tc of toolCalls) {
      switch (tc.status) {
        case 'running':
        case 'pending': running++; break;
        case 'succeeded':
        case 'cancelled': succeeded++; break;
        case 'failed': failed++; break;
      }
    }
    return { running, succeeded, failed, total: toolCalls.length };
  }, [toolCalls]);

  if (toolCalls.length === 0) return null;

  const isActive = stats.running > 0;
  const latestRunning = toolCalls.find((tc) => tc.status === 'running');

  const bulletColor = stats.failed > 0
    ? 'var(--color-error, #ef4444)'
    : isActive
      ? 'var(--color-accent-500, #2dd4bf)'
      : 'var(--color-text-muted, #666)';

  const summaryParts: string[] = [];
  if (stats.running > 0) summaryParts.push(`${stats.running} running`);
  if (stats.succeeded > 0) summaryParts.push(`${stats.succeeded} done`);
  if (stats.failed > 0) summaryParts.push(`${stats.failed} failed`);

  return (
    <div style={{ margin: '6px 0' }}>
      {/* Compact single-line summary — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '4px 0',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: 'var(--text-sm, 13px)',
          color: 'var(--color-text-muted)',
        }}
      >
        {/* Bullet indicator */}
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: bulletColor,
          flexShrink: 0,
          ...(isActive ? { animation: 'pulse-dot 1.4s infinite ease-in-out' } : {}),
        }} />

        {/* Expand arrow */}
        <span style={{ fontSize: 10, opacity: 0.5, width: 10, textAlign: 'center' }}>
          {expanded ? '▾' : '▸'}
        </span>

        {/* Tool count or name */}
        <span style={{ color: 'var(--color-text-secondary)', fontWeight: 500 }}>
          {stats.total === 1
            ? toolCalls[0].name
            : `${stats.total} tool calls`}
        </span>

        {/* Currently running tool name */}
        {latestRunning && stats.total > 1 && (
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-xs, 11px)',
            opacity: 0.6,
            maxWidth: 140,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}>
            {latestRunning.name}
          </span>
        )}

        {/* Status summary */}
        <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs, 11px)', opacity: 0.7 }}>
          {summaryParts.join(', ')}
        </span>

        {isActive && (
          <span className={msgStyles.toolSpinner} style={{ width: 10, height: 10 }} />
        )}
      </div>

      {/* Expanded detail list — only on click */}
      {expanded && (
        <div style={{
          margin: '2px 0 4px 12px',
          borderLeft: '2px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
          paddingLeft: 10,
          maxHeight: 320,
          overflow: 'auto',
        }}>
          {toolCalls.map((tc) => (
            <ToolCallRow key={tc.id} tc={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

function ToolCallRow({ tc }: { tc: ToolCallState }) {
  const elapsed = tc.completedAt
    ? tc.completedAt - tc.startedAt
    : Date.now() - tc.startedAt;

  const bullet = tc.status === 'running'
    ? '●'
    : tc.status === 'failed'
      ? '✗'
      : '•';

  const bulletColor = tc.status === 'running'
    ? 'var(--color-accent-500, #2dd4bf)'
    : tc.status === 'failed'
      ? 'var(--color-error, #ef4444)'
      : 'var(--color-text-muted, #555)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '2px 0',
        fontSize: 'var(--text-xs, 11px)',
        lineHeight: 1.5,
      }}
    >
      <span style={{ color: bulletColor, fontSize: 8, width: 10, textAlign: 'center', flexShrink: 0 }}>
        {bullet}
      </span>
      <span style={{
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text-secondary)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}>
        {tc.name}
      </span>
      <span style={{ color: 'var(--color-text-muted)', opacity: 0.5, flexShrink: 0 }}>
        {formatElapsed(elapsed)}
      </span>
      {tc.status === 'running' && (
        <span className={msgStyles.toolSpinner} style={{ width: 8, height: 8 }} />
      )}
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `<1s`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m${rem}s`;
}
