import type { Message } from '../../shared/types';
import type { CodeModeMessage } from './code-mode-session-types';
import { migrateLocalStorageKeys, readStorage, STORAGE_KEYS } from '../lib/storage-keys';

migrateLocalStorageKeys();

// ── Module-level atomic guards (exported as object so store can mutate properties) ──
/**
 * Atomic guard: tracks the most recently requested session ID for async ops.
 * - createSession sets it (any in-flight loadSession will bail)
 * - loadSession sets it before fetch, checks after fetch
 */
export const sessionGuards = {
  /** Set by createSession / loadSession — in-flight guard for stale async responses */
  lastRequestedSessionId: null as string | null,
  /** Set by ProjectItem when user explicitly opens a session — switchToProject skips auto-init */
  blockAutoInitForProject: null as string | null,
};

// ── localStorage helpers ──

export function loadActiveSessionId(): string | null {
  try {
    const id = readStorage('codeModeSessionId');
    return id || null;
  } catch {
    return null;
  }
}

export function saveActiveSessionId(sessionId: string | null, projectPath: string | null = null): void {
  try {
    if (sessionId) {
      localStorage.setItem(STORAGE_KEYS.codeModeSessionId, sessionId);
      if (projectPath) {
        localStorage.setItem(STORAGE_KEYS.codeModeSessionProject, projectPath);
      }
    } else {
      localStorage.removeItem(STORAGE_KEYS.codeModeSessionId);
      localStorage.removeItem(STORAGE_KEYS.codeModeSessionProject);
    }
  } catch {
    // ignore
  }
}

export function loadActiveSessionProjectPath(): string | null {
  try {
    const path = readStorage('codeModeSessionProject');
    return path || null;
  } catch {
    return null;
  }
}

// ── Message conversion (API Message ↔ store CodeModeMessage) ──

function tryParseMeta(m: Message): Partial<CodeModeMessage> | undefined {
  if (!m.toolCallId && (m as unknown as Record<string, unknown>)._codeMeta) {
    return (m as unknown as Record<string, unknown>)._codeMeta as Partial<CodeModeMessage>;
  }
  return undefined;
}

export function toStoreMessages(messages: Message[]): CodeModeMessage[] {
  return messages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const meta = m.toolCallId ? undefined : tryParseMeta(m);
      return {
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
        ...(meta?.cliId && { cliId: meta.cliId }),
        ...(meta?.nativeSessionId && { nativeSessionId: meta.nativeSessionId }),
        ...(meta?.toolCalls && { toolCalls: meta.toolCalls }),
        ...(meta?.thinking && { thinking: meta.thinking }),
      };
    });
}

export function toPersistMessages(messages: CodeModeMessage[]): Message[] {
  const now = Date.now();
  return messages.map((m, i) => {
    const base: Message = {
      id: m.id,
      role: m.role,
      content: m.content,
      timestamp: now + i,
    };
    const hasMeta = m.cliId || m.nativeSessionId || m.toolCalls || m.thinking;
    if (hasMeta) {
      (base as unknown as Record<string, unknown>)._codeMeta = {
        ...(m.cliId && { cliId: m.cliId }),
        ...(m.nativeSessionId && { nativeSessionId: m.nativeSessionId }),
        ...(m.toolCalls && { toolCalls: m.toolCalls }),
        ...(m.thinking && { thinking: m.thinking }),
      };
    }
    return base;
  });
}

// ── Cache helper ──

export function flushActiveToCache(
  activeSessionId: string | null,
  messages: CodeModeMessage[],
  sessionCache: Record<string, CodeModeMessage[]>,
): Record<string, CodeModeMessage[]> {
  if (!activeSessionId) return sessionCache;
  // Only update sessions that already exist in the cache (were loaded from
  // API or created via createSession).  On cold start the activeSessionId
  // comes from localStorage but sessionCache is empty — writing an empty []
  // there would trick the warm-cache check into thinking the session was
  // already loaded, preventing the real API fetch.
  if (!(activeSessionId in sessionCache)) return sessionCache;
  return { ...sessionCache, [activeSessionId]: messages };
}
