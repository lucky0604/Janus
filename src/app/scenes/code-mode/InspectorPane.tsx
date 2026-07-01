import { useState, useMemo } from 'react';
import { useFocusTrap } from '../../../hooks/useFocusTrap';
import { UnifiedDiffViewFromPreview } from '../../../components/UnifiedDiffView';
import { useCodeRunStore } from '../../../stores/code-run-store';
import type { ToolCallState, RunState, RawEventEntry } from '../../../stores/code-run-types';
import styles from './InspectorPane.module.css';

const EMPTY_RUNS: RunState[] = [];
const EMPTY_TOOL_CALLS: ToolCallState[] = [];
const EMPTY_RAW_EVENTS: RawEventEntry[] = [];

export interface ApprovalCardData {
  id: string;
  title: string;
  description: string;
  diff?: string;
  unifiedDiff?: string;
  contentPreview?: string;
  path?: string;
  status: 'pending' | 'approved' | 'denied' | 'locked_timeout';
  onApprove?: () => void;
  onDeny?: () => void;
  onRetry?: () => void;
}

interface Props {
  sessionId: string | null;
  approvals?: ApprovalCardData[];
  onClose?: () => void;
}

function ToolCard({ tc }: { tc: ToolCallState }) {
  const [expanded, setExpanded] = useState(false);

  const elapsed = tc.completedAt
    ? tc.completedAt - tc.startedAt
    : Date.now() - tc.startedAt;

  const statusCls =
    tc.status === 'running'
      ? styles.statusRunning
      : tc.status === 'succeeded'
        ? styles.statusDone
        : tc.status === 'failed'
          ? styles.statusError
          : styles.statusDone;

  const statusLabel = tc.status === 'running'
    ? 'running'
    : tc.status === 'succeeded'
      ? 'done'
      : tc.status === 'failed'
        ? 'failed'
        : tc.status === 'cancelled'
          ? 'cancelled'
          : tc.status;

  return (
    <div className={styles.toolCard}>
      <div className={styles.toolCardHeader} onClick={() => setExpanded(!expanded)}>
        <span className={styles.toolCardIcon}>{expanded ? '▾' : '▸'}</span>
        <span className={styles.toolCardName}>{tc.name}</span>
        <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0 }}>
          {formatElapsed(elapsed)}
        </span>
        <span className={statusCls}>{statusLabel}</span>
      </div>
      {expanded && (
        <div className={styles.toolCardBody}>
          {tc.summary && <div style={{ marginBottom: 4 }}>{tc.summary}</div>}
          {tc.args != null && (
            <details style={{ marginBottom: 4 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--color-text-muted)' }}>
                Arguments
              </summary>
              <pre style={{
                fontSize: 10,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 120,
                overflow: 'auto',
                background: 'var(--color-bg-primary)',
                padding: 6,
                borderRadius: 4,
                marginTop: 4,
              }}>
                {typeof tc.args === 'string' ? tc.args : JSON.stringify(tc.args, null, 2)}
              </pre>
            </details>
          )}
          {tc.result != null && (
            <details style={{ marginBottom: 4 }}>
              <summary style={{ cursor: 'pointer', fontSize: 11, color: 'var(--color-text-muted)' }}>
                Result
              </summary>
              <pre style={{
                fontSize: 10,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                maxHeight: 120,
                overflow: 'auto',
                background: 'var(--color-bg-primary)',
                padding: 6,
                borderRadius: 4,
                marginTop: 4,
              }}>
                {typeof tc.result === 'string' ? tc.result : JSON.stringify(tc.result, null, 2)}
              </pre>
            </details>
          )}
          {tc.error && (
            <div style={{ color: 'var(--color-error, #ef4444)', fontSize: 11 }}>
              Error: {tc.error}
            </div>
          )}
          {tc.diff && (
            <UnifiedDiffViewFromPreview
              unifiedDiff={tc.diff}
              path={tc.summary}
            />
          )}
        </div>
      )}
    </div>
  );
}

function ApprovalCard({ card }: { card: ApprovalCardData }) {
  const isLocked = card.status === 'locked_timeout';
  const isPending = card.status === 'pending';

  const trapRef = useFocusTrap(isPending, {
    onApprove: card.onApprove,
    onDeny: card.onDeny,
    onEscape: card.onDeny,
  });

  return (
    <div ref={trapRef} className={`${styles.approvalCard} ${isLocked ? styles.approvalLocked : ''} ${isPending ? styles.approvalFocused : ''}`}>
      <div className={styles.approvalHeader}>
        <span>⚡</span>
        <span>{card.title}</span>
      </div>
      <div className={styles.approvalBody}>
        <div style={{ fontSize: '12px', marginBottom: '8px' }}>{card.description}</div>
        {(card.unifiedDiff || card.diff || card.contentPreview) && (
          <UnifiedDiffViewFromPreview
            unifiedDiff={card.unifiedDiff ?? card.diff}
            contentPreview={card.contentPreview}
            path={card.path}
          />
        )}
      </div>
      {isPending && (
        <div className={styles.approvalActions}>
          <button className={styles.approveBtn} onClick={card.onApprove} tabIndex={0}>
            Approve (Y)
          </button>
          <button className={styles.denyBtn} onClick={card.onDeny} tabIndex={0}>
            Deny (N)
          </button>
        </div>
      )}
      {isLocked && (
        <div className={styles.lockOverlay}>
          <div className={styles.lockText}>Waiting Timeout — Process Paused</div>
          <button className={styles.retryBtn} onClick={card.onRetry}>
            Re-activate
          </button>
        </div>
      )}
    </div>
  );
}

function RunSelector({
  runs,
  activeRunId,
  onSelect,
}: {
  runs: RunState[];
  activeRunId: string | undefined;
  onSelect: (runId: string) => void;
}) {
  if (runs.length <= 1) return null;

  return (
    <div style={{
      display: 'flex',
      gap: 4,
      padding: '4px 12px',
      borderBottom: '1px solid var(--border-secondary, #333)',
      overflowX: 'auto',
    }}>
      {runs.map((run, i) => (
        <button
          key={run.id}
          onClick={() => onSelect(run.id)}
          style={{
            padding: '2px 8px',
            fontSize: 10,
            background: run.id === activeRunId ? 'rgba(45, 212, 191, 0.15)' : 'transparent',
            border: run.id === activeRunId ? '1px solid rgba(45, 212, 191, 0.3)' : '1px solid transparent',
            borderRadius: 4,
            color: run.id === activeRunId ? 'var(--color-accent-500)' : 'var(--color-text-muted)',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          Run {i + 1}
          <span style={{
            marginLeft: 4,
            fontSize: 9,
            color: run.status === 'failed' ? 'var(--color-error)' : run.status === 'completed' ? 'var(--color-success, #22c55e)' : undefined,
          }}>
            {run.status === 'completed' ? '✓' : run.status === 'failed' ? '✗' : run.status === 'cancelled' ? '—' : '●'}
          </span>
        </button>
      ))}
    </div>
  );
}

interface ToolGroup {
  name: string;
  items: ToolCallState[];
}

function GroupedToolList({ toolCalls }: { toolCalls: ToolCallState[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, ToolCallState[]>();
    for (const tc of toolCalls) {
      const existing = map.get(tc.name);
      if (existing) {
        existing.push(tc);
      } else {
        map.set(tc.name, [tc]);
      }
    }
    const result: ToolGroup[] = [];
    for (const [name, items] of map) {
      result.push({ name, items });
    }
    return result;
  }, [toolCalls]);

  return (
    <>
      {groups.map((group) =>
        group.items.length === 1 ? (
          <ToolCard key={group.items[0].id} tc={group.items[0]} />
        ) : (
          <ToolGroupCard key={group.name} group={group} />
        ),
      )}
    </>
  );
}

function ToolGroupCard({ group }: { group: ToolGroup }) {
  const [expanded, setExpanded] = useState(false);
  const running = group.items.filter((t) => t.status === 'running').length;
  const failed = group.items.filter((t) => t.status === 'failed').length;
  const allDone = running === 0;

  const statusCls = failed > 0
    ? styles.statusError
    : !allDone
      ? styles.statusRunning
      : styles.statusDone;

  const statusLabel = !allDone
    ? `${running} running`
    : failed > 0
      ? `${failed} failed`
      : 'done';

  return (
    <div className={styles.toolCard}>
      <div className={styles.toolCardHeader} onClick={() => setExpanded(!expanded)}>
        <span className={styles.toolCardIcon}>{expanded ? '▾' : '▸'}</span>
        <span className={styles.toolCardName}>{group.name}</span>
        <span style={{ fontSize: 10, opacity: 0.5, flexShrink: 0 }}>
          ×{group.items.length}
        </span>
        <span className={statusCls}>{statusLabel}</span>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--color-border, rgba(255,255,255,0.06))' }}>
          {group.items.map((tc) => (
            <ToolCard key={tc.id} tc={tc} />
          ))}
        </div>
      )}
    </div>
  );
}

function RawEventsPanel({ events }: { events: RawEventEntry[] }) {
  if (events.length === 0) {
    return <div className={styles.emptyInspector}>No events captured yet</div>;
  }

  return (
    <div className={styles.eventPanel}>
      {events.slice(-50).map((ev, i) => (
        <div key={i} className={styles.eventEntry}>
          <span className={styles.eventTs}>{new Date(ev.ts).toLocaleTimeString()}</span>{' '}
          <span className={styles.eventType}>{ev.type}</span>
          <pre className={styles.eventData}>
            {JSON.stringify(ev.data, null, 2).slice(0, 300)}
          </pre>
        </div>
      ))}
    </div>
  );
}

export function InspectorPane({ sessionId, approvals = [], onClose }: Props) {
  const [tab, setTab] = useState<'tools' | 'events' | 'context'>('tools');
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();

  // Selectors return stable references from the store; derived arrays use useMemo
  const runIds = useCodeRunStore((s) =>
    sessionId ? (s.runOrderBySession[sessionId] ?? undefined) : undefined,
  );
  const runsById = useCodeRunStore((s) => s.runsById);
  const toolCallsById = useCodeRunStore((s) => s.toolCallsById);

  const runs = useMemo(() => {
    if (!runIds) return EMPTY_RUNS;
    const result = runIds.map((id) => runsById[id]).filter((r): r is RunState => !!r);
    return result.length > 0 ? result : EMPTY_RUNS;
  }, [runIds, runsById]);

  const activeStoreRunId = useCodeRunStore((s) =>
    sessionId ? s.activeRunBySession[sessionId] : undefined,
  );

  const effectiveRunId = selectedRunId && runs.some((r) => r.id === selectedRunId)
    ? selectedRunId
    : activeStoreRunId;

  const effectiveRun = useCodeRunStore((s) =>
    effectiveRunId ? s.runsById[effectiveRunId] : undefined,
  );

  const toolCalls = useMemo(() => {
    if (!effectiveRun) return EMPTY_TOOL_CALLS;
    const result = effectiveRun.toolCallIds
      .map((id) => toolCallsById[id])
      .filter((tc): tc is ToolCallState => !!tc);
    return result.length > 0 ? result : EMPTY_TOOL_CALLS;
  }, [effectiveRun, toolCallsById]);

  const rawEvents = useCodeRunStore((s) =>
    sessionId ? (s.rawEventsBySession[sessionId] ?? EMPTY_RAW_EVENTS) : EMPTY_RAW_EVENTS,
  );

  const hasContent = toolCalls.length > 0 || approvals.length > 0;

  return (
    <div className={styles.inspectorPane}>
      <div className={styles.header}>
        <span>Inspector</span>
        {onClose && (
          <button className={styles.closeBtn} onClick={onClose} title="Close inspector">
            ×
          </button>
        )}
      </div>

      <div className={styles.tabBar}>
        <button
          onClick={() => setTab('tools')}
          className={`${styles.tabBtn} ${tab === 'tools' ? styles.tabBtnActive : ''}`}
        >
          Tools {toolCalls.length > 0 && `(${toolCalls.length})`}
        </button>
        <button
          onClick={() => setTab('events')}
          className={`${styles.tabBtn} ${tab === 'events' ? styles.tabBtnActive : ''}`}
        >
          Raw Events {rawEvents.length > 0 && `(${rawEvents.length})`}
        </button>
        <button
          onClick={() => setTab('context')}
          className={`${styles.tabBtn} ${tab === 'context' ? styles.tabBtnActive : ''}`}
        >
          Context
        </button>
      </div>

      {tab === 'tools' && runs.length > 1 && (
        <RunSelector
          runs={runs}
          activeRunId={effectiveRunId}
          onSelect={setSelectedRunId}
        />
      )}

      <div className={styles.cardList}>
        {tab === 'tools' && (
          <>
            {!hasContent && (
              <div className={styles.emptyInspector}>No active tool calls or approvals</div>
            )}
            {approvals.map((a) => (
              <ApprovalCard key={a.id} card={a} />
            ))}
            <GroupedToolList toolCalls={toolCalls} />
          </>
        )}
        {tab === 'events' && (
          <RawEventsPanel events={rawEvents} />
        )}
        {tab === 'context' && (
          <div className={styles.contextPanel}>
            No handoff context has been generated for this session yet.
          </div>
        )}
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  return `${min}m${rem}s`;
}
