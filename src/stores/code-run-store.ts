import { create } from 'zustand';
import type {
  AgentEvent,
  CodeRunStore,
  CodeRunNormalizedState,
  RunState,
  ToolCallState,
  RawEventEntry,
} from './code-run-types';
import { reduceCodeRunEvent } from './code-run-reducer';

const INITIAL_STATE: CodeRunNormalizedState = {
  runsById: {},
  toolCallsById: {},
  runOrderBySession: {},
  activeRunBySession: {},
  rawEventsBySession: {},
};

export const useCodeRunStore = create<CodeRunStore>((set, get) => ({
  ...INITIAL_STATE,

  dispatchEvent: (event: AgentEvent) => {
    set((state) => reduceCodeRunEvent(state, event));
  },

  startRun: (sessionId: string): string => {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const now = Date.now();
    get().dispatchEvent({
      type: 'run_started',
      sessionId,
      runId,
      timestamp: now,
    });
    return runId;
  },

  cancelRun: (sessionId: string) => {
    const activeRunId = get().activeRunBySession[sessionId];
    if (!activeRunId) return;
    const run = get().runsById[activeRunId];
    if (!run || run.status === 'completed' || run.status === 'failed' || run.status === 'cancelled') return;
    get().dispatchEvent({
      type: 'run_cancelled',
      sessionId,
      runId: activeRunId,
      timestamp: Date.now(),
    });
  },

  clearSession: (sessionId: string) => {
    set((state) => {
      const runIds = state.runOrderBySession[sessionId] ?? [];
      const nextRunsById = { ...state.runsById };
      const nextToolCallsById = { ...state.toolCallsById };
      for (const runId of runIds) {
        const run = nextRunsById[runId];
        if (run) {
          for (const tcId of run.toolCallIds) {
            delete nextToolCallsById[tcId];
          }
          delete nextRunsById[runId];
        }
      }
      const nextRunOrder = { ...state.runOrderBySession };
      delete nextRunOrder[sessionId];
      const nextActiveRun = { ...state.activeRunBySession };
      delete nextActiveRun[sessionId];
      const nextRawEvents = { ...state.rawEventsBySession };
      delete nextRawEvents[sessionId];
      return {
        runsById: nextRunsById,
        toolCallsById: nextToolCallsById,
        runOrderBySession: nextRunOrder,
        activeRunBySession: nextActiveRun,
        rawEventsBySession: nextRawEvents,
      };
    });
  },

  getActiveRun: (sessionId: string): RunState | undefined => {
    const activeRunId = get().activeRunBySession[sessionId];
    return activeRunId ? get().runsById[activeRunId] : undefined;
  },

  getRunToolCalls: (runId: string): ToolCallState[] => {
    const run = get().runsById[runId];
    if (!run) return [];
    return run.toolCallIds
      .map((id) => get().toolCallsById[id])
      .filter((tc): tc is ToolCallState => !!tc);
  },

  getSessionRuns: (sessionId: string): RunState[] => {
    const runIds = get().runOrderBySession[sessionId] ?? [];
    return runIds
      .map((id) => get().runsById[id])
      .filter((r): r is RunState => !!r);
  },

  getRawEvents: (sessionId: string): RawEventEntry[] => {
    return get().rawEventsBySession[sessionId] ?? [];
  },
}));
