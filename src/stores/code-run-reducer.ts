import type {
  AgentEvent,
  CodeRunNormalizedState,
  RunState,
  ToolCallState,
  RawEventEntry,
} from './code-run-types';

const MAX_RAW_EVENTS = 200;
const IS_DEV = typeof process !== 'undefined'
  ? process.env.NODE_ENV !== 'production'
  : import.meta.env?.DEV ?? false;

function debugLog(label: string, ...args: unknown[]) {
  if (IS_DEV) {
    console.debug(`[CodeRun] ${label}`, ...args);
  }
}

function warnLog(label: string, ...args: unknown[]) {
  if (IS_DEV) {
    console.warn(`[CodeRun] ${label}`, ...args);
  }
}

export function reduceCodeRunEvent(
  state: CodeRunNormalizedState,
  event: AgentEvent,
): CodeRunNormalizedState {
  const now = event.type === 'raw_event'
    ? event.timestamp
    : ('timestamp' in event ? event.timestamp : Date.now());

  switch (event.type) {
    case 'run_started': {
      const { runId, sessionId } = event;
      if (state.runsById[runId]) {
        warnLog('duplicate run_started', runId);
        return state;
      }
      debugLog('run_started', runId);
      const run: RunState = {
        id: runId,
        sessionId,
        status: 'thinking',
        startedAt: now,
        updatedAt: now,
        toolCallIds: [],
        lastEventType: 'run_started',
      };
      const sessionRuns = state.runOrderBySession[sessionId] ?? [];
      return {
        ...state,
        runsById: { ...state.runsById, [runId]: run },
        runOrderBySession: {
          ...state.runOrderBySession,
          [sessionId]: [...sessionRuns, runId],
        },
        activeRunBySession: {
          ...state.activeRunBySession,
          [sessionId]: runId,
        },
      };
    }

    case 'thinking_delta': {
      const run = state.runsById[event.runId];
      if (!run) return state;
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [event.runId]: {
            ...run,
            status: run.status === 'idle' || run.status === 'waiting_model' ? 'thinking' : run.status,
            updatedAt: now,
            lastEventType: 'thinking_delta',
          },
        },
      };
    }

    case 'text_delta': {
      const run = state.runsById[event.runId];
      if (!run) return state;
      const newStatus = run.status === 'thinking' || run.status === 'waiting_model' || run.status === 'calling_tool'
        ? 'streaming'
        : run.status;
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [event.runId]: {
            ...run,
            status: newStatus,
            updatedAt: now,
            lastEventType: 'text_delta',
          },
        },
      };
    }

    case 'tool_call_started': {
      const { runId, toolCallId, toolName, summary, args } = event;
      const run = state.runsById[runId];
      if (!run) {
        warnLog('tool_call_started for unknown run', runId);
        return state;
      }
      if (state.toolCallsById[toolCallId]) {
        warnLog('duplicate tool_call_started', toolCallId);
        return state;
      }
      debugLog('tool_call_started', toolName, toolCallId);
      const tc: ToolCallState = {
        id: toolCallId,
        runId,
        name: toolName,
        status: 'running',
        summary,
        args,
        startedAt: now,
        updatedAt: now,
      };
      const newToolCallIds = run.toolCallIds.includes(toolCallId)
        ? run.toolCallIds
        : [...run.toolCallIds, toolCallId];
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            status: 'calling_tool',
            currentToolCallId: toolCallId,
            toolCallIds: newToolCallIds,
            updatedAt: now,
            lastEventType: 'tool_call_started',
          },
        },
        toolCallsById: {
          ...state.toolCallsById,
          [toolCallId]: tc,
        },
      };
    }

    case 'tool_call_result': {
      const { runId, toolCallId, result, diff } = event;
      const run = state.runsById[runId];
      const tc = state.toolCallsById[toolCallId];
      if (!run || !tc) {
        warnLog('tool_call_result for unknown', { runId, toolCallId });
        return state;
      }
      debugLog('tool_call_result', tc.name, toolCallId);
      const hasMore = run.toolCallIds.some(
        (id) => id !== toolCallId && state.toolCallsById[id]?.status === 'running',
      );
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            status: hasMore ? 'calling_tool' : 'waiting_model',
            currentToolCallId: hasMore ? run.currentToolCallId : undefined,
            updatedAt: now,
            lastEventType: 'tool_call_result',
          },
        },
        toolCallsById: {
          ...state.toolCallsById,
          [toolCallId]: {
            ...tc,
            status: 'succeeded',
            result,
            diff: diff ?? tc.diff,
            completedAt: now,
            updatedAt: now,
          },
        },
      };
    }

    case 'tool_call_failed': {
      const { runId, toolCallId, error } = event;
      const run = state.runsById[runId];
      const tc = state.toolCallsById[toolCallId];
      if (!run || !tc) {
        warnLog('tool_call_failed for unknown', { runId, toolCallId });
        return state;
      }
      debugLog('tool_call_failed', tc.name, toolCallId, error);
      const hasMore = run.toolCallIds.some(
        (id) => id !== toolCallId && state.toolCallsById[id]?.status === 'running',
      );
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [runId]: {
            ...run,
            status: hasMore ? 'calling_tool' : 'waiting_model',
            currentToolCallId: hasMore ? run.currentToolCallId : undefined,
            updatedAt: now,
            lastEventType: 'tool_call_failed',
          },
        },
        toolCallsById: {
          ...state.toolCallsById,
          [toolCallId]: {
            ...tc,
            status: 'failed',
            error,
            completedAt: now,
            updatedAt: now,
          },
        },
      };
    }

    case 'progress': {
      const run = state.runsById[event.runId];
      if (!run) return state;
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [event.runId]: {
            ...run,
            updatedAt: now,
            lastEventType: 'progress',
          },
        },
      };
    }

    case 'run_completed': {
      const run = state.runsById[event.runId];
      if (!run) {
        warnLog('run_completed for unknown run', event.runId);
        return state;
      }
      debugLog('run_completed', event.runId);
      const updatedToolCalls = { ...state.toolCallsById };
      for (const tcId of run.toolCallIds) {
        const tc = updatedToolCalls[tcId];
        if (tc && tc.status === 'running') {
          updatedToolCalls[tcId] = {
            ...tc,
            status: 'succeeded',
            completedAt: now,
            updatedAt: now,
          };
        }
      }
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [event.runId]: {
            ...run,
            status: 'completed',
            completedAt: now,
            updatedAt: now,
            currentToolCallId: undefined,
            lastEventType: 'run_completed',
          },
        },
        toolCallsById: updatedToolCalls,
      };
    }

    case 'run_failed': {
      const run = state.runsById[event.runId];
      if (!run) {
        warnLog('run_failed for unknown run', event.runId);
        return state;
      }
      debugLog('run_failed', event.runId, event.error);
      const updatedToolCalls = { ...state.toolCallsById };
      for (const tcId of run.toolCallIds) {
        const tc = updatedToolCalls[tcId];
        if (tc && tc.status === 'running') {
          updatedToolCalls[tcId] = {
            ...tc,
            status: 'cancelled',
            completedAt: now,
            updatedAt: now,
          };
        }
      }
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [event.runId]: {
            ...run,
            status: 'failed',
            error: event.error,
            completedAt: now,
            updatedAt: now,
            currentToolCallId: undefined,
            lastEventType: 'run_failed',
          },
        },
        toolCallsById: updatedToolCalls,
      };
    }

    case 'run_cancelled': {
      const run = state.runsById[event.runId];
      if (!run) return state;
      debugLog('run_cancelled', event.runId);
      const updatedToolCalls = { ...state.toolCallsById };
      for (const tcId of run.toolCallIds) {
        const tc = updatedToolCalls[tcId];
        if (tc && tc.status === 'running') {
          updatedToolCalls[tcId] = {
            ...tc,
            status: 'cancelled',
            completedAt: now,
            updatedAt: now,
          };
        }
      }
      return {
        ...state,
        runsById: {
          ...state.runsById,
          [event.runId]: {
            ...run,
            status: 'cancelled',
            completedAt: now,
            updatedAt: now,
            currentToolCallId: undefined,
            lastEventType: 'run_cancelled',
          },
        },
        toolCallsById: updatedToolCalls,
      };
    }

    case 'raw_event': {
      const { sessionId, rawType, data } = event;
      const existing = state.rawEventsBySession[sessionId] ?? [];
      const entry: RawEventEntry = { ts: now, type: rawType, data };
      const capped = existing.length >= MAX_RAW_EVENTS
        ? [...existing.slice(-MAX_RAW_EVENTS + 1), entry]
        : [...existing, entry];
      return {
        ...state,
        rawEventsBySession: {
          ...state.rawEventsBySession,
          [sessionId]: capped,
        },
      };
    }

    default: {
      warnLog('unknown event type', (event as { type: string }).type);
      return state;
    }
  }
}
