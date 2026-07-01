export type RunStatus =
  | 'idle'
  | 'thinking'
  | 'streaming'
  | 'calling_tool'
  | 'waiting_model'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ToolCallStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface RunState {
  id: string;
  sessionId: string;
  status: RunStatus;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  toolCallIds: string[];
  currentToolCallId?: string;
  lastEventType?: string;
}

export interface ToolCallState {
  id: string;
  runId: string;
  name: string;
  status: ToolCallStatus;
  summary?: string;
  args?: unknown;
  result?: unknown;
  diff?: string;
  error?: string;
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface RawEventEntry {
  ts: number;
  type: string;
  data: unknown;
}

export interface CodeRunNormalizedState {
  runsById: Record<string, RunState>;
  toolCallsById: Record<string, ToolCallState>;
  /** runId order per session */
  runOrderBySession: Record<string, string[]>;
  /** Currently active runId per session */
  activeRunBySession: Record<string, string>;
  /** Raw events for debug, capped per session */
  rawEventsBySession: Record<string, RawEventEntry[]>;
}

export type AgentEvent =
  | { type: 'run_started'; sessionId: string; runId: string; timestamp: number }
  | { type: 'thinking_delta'; sessionId: string; runId: string; text: string; timestamp: number }
  | { type: 'text_delta'; sessionId: string; runId: string; text: string; timestamp: number }
  | { type: 'tool_call_started'; sessionId: string; runId: string; toolCallId: string; toolName: string; summary?: string; args?: unknown; timestamp: number }
  | { type: 'tool_call_result'; sessionId: string; runId: string; toolCallId: string; result?: unknown; diff?: string; timestamp: number }
  | { type: 'tool_call_failed'; sessionId: string; runId: string; toolCallId: string; error: string; timestamp: number }
  | { type: 'progress'; sessionId: string; runId: string; text: string; timestamp: number }
  | { type: 'run_completed'; sessionId: string; runId: string; timestamp: number }
  | { type: 'run_failed'; sessionId: string; runId: string; error: string; timestamp: number }
  | { type: 'run_cancelled'; sessionId: string; runId: string; timestamp: number }
  | { type: 'raw_event'; sessionId: string; runId: string; rawType: string; data: unknown; timestamp: number };

export interface CodeRunStoreActions {
  dispatchEvent: (event: AgentEvent) => void;
  startRun: (sessionId: string) => string;
  cancelRun: (sessionId: string) => void;
  clearSession: (sessionId: string) => void;

  getActiveRun: (sessionId: string) => RunState | undefined;
  getRunToolCalls: (runId: string) => ToolCallState[];
  getSessionRuns: (sessionId: string) => RunState[];
  getRawEvents: (sessionId: string) => RawEventEntry[];
}

export type CodeRunStore = CodeRunNormalizedState & CodeRunStoreActions;
