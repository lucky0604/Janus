import { useState } from 'react';
import { useFocusTrap } from './useFocusTrap';
import styles from './InspectorPane.module.css';

export interface ToolCardData {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
  summary: string;
  diff?: string;
}

export interface ApprovalCardData {
  id: string;
  title: string;
  description: string;
  diff?: string;
  status: 'pending' | 'approved' | 'denied' | 'locked_timeout';
  onApprove?: () => void;
  onDeny?: () => void;
  onRetry?: () => void;
}

interface Props {
  tools?: ToolCardData[];
  approvals?: ApprovalCardData[];
  onClose?: () => void;
}

function DiffView({ diff }: { diff: string }) {
  return (
    <div className={styles.diffBlock}>
      {diff.split('\n').map((line, i) => {
        let cls = '';
        if (line.startsWith('+') && !line.startsWith('+++')) cls = styles.diffAdd;
        else if (line.startsWith('-') && !line.startsWith('---')) cls = styles.diffRemove;
        else if (line.startsWith('@@') || line.startsWith('diff ') || line.startsWith('index '))
          cls = styles.diffMeta;
        return (
          <div key={i} className={cls}>
            {line}
          </div>
        );
      })}
    </div>
  );
}

function ToolCard({ card }: { card: ToolCardData }) {
  const [expanded, setExpanded] = useState(false);

  const statusCls =
    card.status === 'running'
      ? styles.statusRunning
      : card.status === 'done'
        ? styles.statusDone
        : styles.statusError;

  return (
    <div className={styles.toolCard}>
      <div className={styles.toolCardHeader} onClick={() => setExpanded(!expanded)}>
        <span className={styles.toolCardIcon}>{expanded ? '▾' : '▸'}</span>
        <span className={styles.toolCardName}>{card.name}</span>
        <span className={statusCls}>{card.status}</span>
      </div>
      {expanded && (
        <div className={styles.toolCardBody}>
          <div>{card.summary}</div>
          {card.diff && <DiffView diff={card.diff} />}
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
        {card.diff && <DiffView diff={card.diff} />}
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

export interface RawEventEntry {
  ts: number;
  type: string;
  data: unknown;
}

interface InspectorProps extends Props {
  rawEvents?: RawEventEntry[];
  contextPreview?: string;
}

export function InspectorPane({ tools = [], approvals = [], rawEvents = [], contextPreview, onClose }: InspectorProps) {
  const [tab, setTab] = useState<'tools' | 'events' | 'context'>('tools');
  const hasContent = tools.length > 0 || approvals.length > 0;

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
          Tools {tools.length > 0 && `(${tools.length})`}
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

      <div className={styles.cardList}>
        {tab === 'tools' && (
          <>
            {!hasContent && (
              <div className={styles.emptyInspector}>No active tool calls or approvals</div>
            )}
            {approvals.map((a) => (
              <ApprovalCard key={a.id} card={a} />
            ))}
            {tools.map((t) => (
              <ToolCard key={t.id} card={t} />
            ))}
          </>
        )}
        {tab === 'events' && (
          <div className={styles.eventPanel}>
            {rawEvents.length === 0 ? (
              <div className={styles.emptyInspector}>No events captured yet</div>
            ) : (
              rawEvents.slice(-50).map((ev, i) => (
                <div key={i} className={styles.eventEntry}>
                  <span className={styles.eventTs}>{new Date(ev.ts).toLocaleTimeString()}</span>{' '}
                  <span className={styles.eventType}>{ev.type}</span>
                  <pre className={styles.eventData}>
                    {JSON.stringify(ev.data, null, 2).slice(0, 200)}
                  </pre>
                </div>
              ))
            )}
          </div>
        )}
        {tab === 'context' && (
          <div className={styles.contextPanel}>
            {contextPreview || 'No handoff context has been generated for this session yet.'}
          </div>
        )}
      </div>
    </div>
  );
}
