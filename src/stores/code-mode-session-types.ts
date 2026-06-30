import type { CliToolId } from '../../shared/types';

export interface CodeModeToolCall {
  id: string;
  name: string;
  status: 'running' | 'done' | 'error';
  summary?: string;
}

export interface CodeModeHookEvent {
  id: string;
  hookType: string;
  status: 'start' | 'continue' | 'rewrite' | 'abort';
  round?: number;
  detail?: string;
}

export interface CodeModeMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  cliId?: CliToolId;
  nativeSessionId?: string;
  toolCalls?: CodeModeToolCall[];
  hookEvents?: CodeModeHookEvent[];
  thinking?: string;
  progress?: string[];
  /** For role==='system': the slash command name that produced this message (e.g. 'mode', 'clear'). */
  systemKind?: 'command' | 'skill-error' | 'info';
  /** For role==='system': the command name shown as a prefix tag. */
  systemTag?: string;
}

export interface CodeModeSessionState {
  activeSessionId: string | null;
  activeProjectPath: string | null;
  messages: CodeModeMessage[];
  sessionCache: Record<string, CodeModeMessage[]>;
  executingSessions: Record<string, boolean>;
  sessionListVersion: number;

  createSession: (projectPath: string, name?: string) => Promise<string>;
  blockAutoInit: () => void;
  switchToProject: (projectPath: string) => Promise<void>;
  ensureSessionForProject: (projectPath: string, preferFresh?: boolean) => Promise<void>;
  ensureSessionBeforeSend: () => Promise<boolean>;
  loadSession: (sessionId: string, projectPath?: string) => Promise<void>;
  clearActiveSession: () => void;
  appendExchange: (userContent: string, cliId?: CliToolId) => void;
  appendLocalSystemMessage: (sessionId: string, content: string, tag?: string, kind?: 'command' | 'skill-error' | 'info') => void;
  applyStreamEvent: (sessionId: string, event: { type: string; data: unknown }) => void;
  setSessionExecuting: (sessionId: string, executing: boolean) => void;
  isSessionExecuting: (sessionId: string) => boolean;
  persistSession: (sessionId?: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  bumpSessionList: () => void;
}
