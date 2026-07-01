import { useEffect, useState } from 'react';
import type { RunState, ToolCallState } from '../../../stores/code-run-types';

interface Props {
  run: RunState | undefined;
  currentToolCall: ToolCallState | undefined;
  onCancel?: () => void;
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Idle',
  thinking: 'Thinking',
  streaming: 'Streaming answer',
  calling_tool: 'Running tool',
  waiting_model: 'Waiting for model',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export function RunStatusBar({ run, currentToolCall, onCancel }: Props) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!run || run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') {
      return;
    }
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [run?.status]);

  if (!run) return null;

  const isActive = run.status !== 'completed' && run.status !== 'failed' && run.status !== 'cancelled';
  const elapsed = (isActive ? now : (run.completedAt ?? run.updatedAt)) - run.startedAt;
  const lastEventAgo = now - run.updatedAt;

  if (!isActive && elapsed < 1000) return null;

  const statusLabel = STATUS_LABELS[run.status] ?? run.status;
  const toolCount = run.toolCallIds.length;

  const statusColor = run.status === 'failed'
    ? 'var(--color-error, #ef4444)'
    : run.status === 'cancelled'
      ? 'var(--color-text-muted)'
      : run.status === 'completed'
        ? 'var(--color-success, #22c55e)'
        : 'var(--color-accent-500, #2dd4bf)';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 16px',
        fontSize: 'var(--text-xs, 11px)',
        color: 'var(--color-text-muted)',
        borderTop: '1px solid var(--color-border-subtle, rgba(255,255,255,0.06))',
        background: 'var(--color-bg-surface, #161616)',
        minHeight: 28,
        userSelect: 'none',
      }}
    >
      {/* Animated dot for active state */}
      {isActive && (
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: statusColor,
          flexShrink: 0,
          animation: 'pulse-dot 1.4s infinite ease-in-out',
        }} />
      )}

      {/* Status label */}
      <span style={{ color: statusColor, fontWeight: 600 }}>
        {statusLabel}
      </span>

      {/* Current tool name */}
      {isActive && currentToolCall && run.status === 'calling_tool' && (
        <span style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--color-text-secondary)',
          maxWidth: 160,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {currentToolCall.name}
        </span>
      )}

      {/* Tool count */}
      {toolCount > 0 && (
        <span style={{ opacity: 0.6 }}>
          {toolCount} tool{toolCount !== 1 ? 's' : ''}
        </span>
      )}

      {/* Elapsed time */}
      <span style={{ opacity: 0.5 }}>
        {formatDuration(elapsed)}
      </span>

      {/* Last event indicator for long waits */}
      {isActive && lastEventAgo > 5000 && (
        <span style={{ opacity: 0.4, fontSize: 10 }}>
          last event {formatDuration(lastEventAgo)} ago
        </span>
      )}

      <span style={{ flex: 1 }} />

      {/* Cancel button */}
      {isActive && onCancel && (
        <button
          onClick={onCancel}
          style={{
            background: 'transparent',
            border: '1px solid var(--color-border-default)',
            borderRadius: 4,
            color: 'var(--color-text-muted)',
            fontSize: 10,
            padding: '2px 8px',
            cursor: 'pointer',
            transition: 'border-color 0.15s, color 0.15s',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-error, #ef4444)';
            e.currentTarget.style.color = 'var(--color-error, #ef4444)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = 'var(--color-border-default)';
            e.currentTarget.style.color = 'var(--color-text-muted)';
          }}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function formatDuration(ms: number): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return `${min}m${rem ? `${rem}s` : ''}`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h${remMin ? `${remMin}m` : ''}`;
}
