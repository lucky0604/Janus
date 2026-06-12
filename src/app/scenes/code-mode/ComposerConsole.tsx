import { useEffect, useRef, useState, useCallback } from 'react';
import { useCodeModeStore } from '../../../stores/app-stores';
import type { CliDetectionResult, CliToolId } from '../../../../shared/types';
import styles from './ComposerConsole.module.css';

function useIsNarrow(breakpoint = 768): boolean {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return narrow;
}

interface PickerSheetProps {
  title: string;
  options: Array<{ id: string; label: string; disabled?: boolean; active?: boolean }>;
  onSelect: (id: string) => void;
  onClose: () => void;
}

function PickerSheet({ title, options, onSelect, onClose }: PickerSheetProps) {
  return (
    <div className={styles.sheetOverlay} onClick={onClose}>
      <div className={styles.sheetPanel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.sheetHeader}>
          <span className={styles.sheetTitle}>{title}</span>
          <button className={styles.sheetCloseBtn} onClick={onClose}>×</button>
        </div>
        {options.map((opt) => (
          <button
            key={opt.id}
            className={
              opt.disabled
                ? styles.sheetOptionDisabled
                : opt.active
                  ? styles.sheetOptionActive
                  : styles.sheetOption
            }
            onClick={() => !opt.disabled && onSelect(opt.id)}
            disabled={opt.disabled}
          >
            <span>{opt.label}</span>
            <span className={styles.sheetOptionStatus}>
              {opt.disabled ? '✗' : opt.active ? '●' : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

interface Props {
  onStreamEvent?: (event: { type: string; data: unknown }) => void;
  onSend?: (prompt: string) => void;
  workspacePath?: string;
}

export function ComposerConsole({ onStreamEvent, onSend, workspacePath }: Props) {
  const { activeCli, activeModel, isExecuting, setActiveCli, setActiveModel, setExecuting } = useCodeModeStore();
  const [cliResults, setCliResults] = useState<CliDetectionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [sheetType, setSheetType] = useState<'cli' | 'model' | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const isNarrow = useIsNarrow();

  useEffect(() => {
    setLoading(true);
    fetch('/api/code-mode/detect')
      .then((r) => r.json())
      .then((data: { clis: CliDetectionResult[] }) => {
        setCliResults(data.clis);
        const available = data.clis.find((c) => c.available);
        if (available) {
          setActiveCli(available.id);
          setActiveModel(available.models?.[0] ?? '');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleCliChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const id = e.target.value as CliToolId;
    setActiveCli(id);
    const cli = cliResults.find((c) => c.id === id);
    setActiveModel(cli?.models?.[0] ?? '');
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || isExecuting) return;

    setInput('');
    setExecuting(true);
    onSend?.(prompt);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const wsParam = workspacePath ? `?workspace=${encodeURIComponent(workspacePath)}` : '';
      const res = await fetch(`/api/code-mode/stream${wsParam}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cliId: activeCli, prompt, model: activeModel }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        onStreamEvent?.({ type: 'error', data: { message: `HTTP ${res.status}` } });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6));
              onStreamEvent?.(event);
            } catch { /* skip malformed */ }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        onStreamEvent?.({ type: 'error', data: { message: String(err) } });
      }
    } finally {
      setExecuting(false);
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
  };

  const currentCli = cliResults.find((c) => c.id === activeCli);
  const models = currentCli?.models ?? [];
  const displayPath = workspacePath || (typeof window !== 'undefined' ? window.location.origin : '');

  const handleCliSheetSelect = useCallback((id: string) => {
    setActiveCli(id as CliToolId);
    const cli = cliResults.find((c) => c.id === id);
    setActiveModel(cli?.models?.[0] ?? '');
    setSheetType(null);
  }, [cliResults, setActiveCli, setActiveModel]);

  const handleModelSheetSelect = useCallback((id: string) => {
    setActiveModel(id);
    setSheetType(null);
  }, [setActiveModel]);

  return (
    <div className={styles.composerContainer}>
      <div className={styles.pathIndicator}>
        会话位于 {displayPath}
      </div>

      <div className={styles.dropdownRow}>
        <div className={styles.selectWrapper}>
          <div className={styles.selectLabel}>Agent CLI</div>
          <select
            className={styles.select}
            value={activeCli}
            onChange={handleCliChange}
            disabled={loading || isExecuting}
            onClick={isNarrow ? (e) => { e.preventDefault(); setSheetType('cli'); } : undefined}
          >
            {loading ? (
              <option>Detecting...</option>
            ) : (
              cliResults.map((cli) => (
                <option key={cli.id} value={cli.id} disabled={!cli.available}>
                  {cli.displayName} {cli.available ? '✓' : '✗ Not installed'}
                </option>
              ))
            )}
          </select>
          <span className={styles.selectArrow}>▾</span>
        </div>

        <div className={styles.selectWrapper}>
          <div className={styles.selectLabel}>Model</div>
          <input
            className={styles.select}
            list={isNarrow ? undefined : `models-${activeCli}`}
            value={activeModel}
            onChange={(e) => setActiveModel(e.target.value)}
            disabled={isExecuting}
            placeholder="Select or type model..."
            onClick={isNarrow ? () => setSheetType('model') : undefined}
            readOnly={isNarrow}
          />
          {!isNarrow && (
            <datalist id={`models-${activeCli}`}>
              {models.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          type="text"
          className={styles.textInput}
          placeholder={isExecuting ? 'Executing...' : 'Type a message to relay...'}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={isExecuting}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
        />
        {isExecuting && (
          <button
            onClick={handleCancel}
            style={{
              padding: '8px 16px',
              background: 'rgba(239, 68, 68, 0.15)',
              color: '#ef4444',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            Cancel
          </button>
        )}
      </div>

      {sheetType === 'cli' && (
        <PickerSheet
          title="Select Agent CLI"
          options={cliResults.map((cli) => ({
            id: cli.id,
            label: `${cli.displayName} ${cli.available ? '✓' : '✗'}`,
            disabled: !cli.available,
            active: cli.id === activeCli,
          }))}
          onSelect={handleCliSheetSelect}
          onClose={() => setSheetType(null)}
        />
      )}

      {sheetType === 'model' && (
        <PickerSheet
          title="Select Model"
          options={models.map((m) => ({
            id: m,
            label: m,
            active: m === activeModel,
          }))}
          onSelect={handleModelSheetSelect}
          onClose={() => setSheetType(null)}
        />
      )}
    </div>
  );
}
