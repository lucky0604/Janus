import { create } from 'zustand';
import { useProjectStore } from './project-store';
import { useChatStore } from './chat-store';
import type { CodeModeSessionState, CodeModeMessage } from './code-mode-session-types';
import {
  sessionGuards,
  loadActiveSessionId,
  saveActiveSessionId,
  loadActiveSessionProjectPath,
  toStoreMessages,
  toPersistMessages,
  flushActiveToCache,
} from './code-mode-session-helpers';
import { applyEventToMessages } from './code-mode-session-events';

export { type CodeModeToolCall, type CodeModeMessage, type CodeModeSessionState } from './code-mode-session-types';

export const useCodeModeSessionStore = create<CodeModeSessionState>((set, get) => ({
  activeSessionId: loadActiveSessionId(),
  activeProjectPath: loadActiveSessionProjectPath(),
  messages: [],
  sessionCache: {},
  executingSessions: {},
  sessionListVersion: 0,

  blockAutoInit: () => {
    const currentProject = get().activeProjectPath;
    if (currentProject) {
      sessionGuards.blockAutoInitForProject = currentProject;
    }
  },

  createSession: async (projectPath, name) => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectPath, name, agentType: 'code-mode' }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as { error?: string }).error || 'Failed to create session');
    }
    const data = await res.json();
    const sessionId = data.session.sessionId as string;
    sessionGuards.lastRequestedSessionId = sessionId;
    saveActiveSessionId(sessionId, projectPath);
    // Use functional set to flush current session atomically with fresh state
    set((state) => {
      const flushed = flushActiveToCache(state.activeSessionId, state.messages, state.sessionCache);
      return {
        activeSessionId: sessionId,
        activeProjectPath: projectPath,
        messages: [],
        sessionCache: { ...flushed, [sessionId]: [] },
        sessionListVersion: state.sessionListVersion + 1,
      };
    });
    return sessionId;
  },

  switchToProject: async (projectPath) => {
    if (sessionGuards.blockAutoInitForProject === projectPath) {
      sessionGuards.blockAutoInitForProject = null;
      return;
    }
    const { activeSessionId, activeProjectPath } = get();
    if (activeSessionId && activeProjectPath === projectPath) {
      // Only reload if session has NEVER been loaded into cache (undefined).
      // An empty array [] means the session is genuinely blank.
      const cached = get().sessionCache[activeSessionId];
      if (cached === undefined && !get().executingSessions[activeSessionId]) {
        await get().loadSession(activeSessionId, projectPath);
      }
      return;
    }
    await get().ensureSessionForProject(projectPath);
  },

  ensureSessionForProject: async (projectPath, preferFresh = false) => {
    const snap = get();
    if (snap.activeSessionId && snap.activeProjectPath === projectPath) {
      return;
    }
    if (!preferFresh) {
      try {
        const res = await fetch(
          `/api/sessions?scope=code-mode&workspace=${encodeURIComponent(projectPath)}`,
        );
        if (res.ok) {
          const data = await res.json();
          const sessions = (data.sessions || []) as Array<{ sessionId: string }>;
          if (sessions.length > 0) {
            await get().loadSession(sessions[0].sessionId, projectPath);
            return;
          }
        }
      } catch {
        // fall through to create
      }
    }
    const { activeSessionId, activeProjectPath } = get();
    if (activeSessionId && activeProjectPath === projectPath) {
      return;
    }
    await get().createSession(projectPath);
  },

  ensureSessionBeforeSend: async () => {
    if (get().activeSessionId) return true;
    const project = useProjectStore.getState().getActiveProject();
    if (!project) return false;
    try {
      await get().createSession(project.path);
      return true;
    } catch {
      return false;
    }
  },

  loadSession: async (sessionId, projectPath) => {
    const { activeSessionId, messages, sessionCache } = get();
    const nextCache = flushActiveToCache(activeSessionId, messages, sessionCache);
    const cached = nextCache[sessionId];
    // cached !== undefined means we already have this session's state in memory
    // (including empty [] for blank sessions). Only fall through to API when
    // the session has never been loaded into the cache at all.
    if (cached !== undefined) {
      const resolvedProjectPath = projectPath ?? get().activeProjectPath;
      saveActiveSessionId(sessionId, resolvedProjectPath ?? null);
      set({
        activeSessionId: sessionId,
        activeProjectPath: resolvedProjectPath ?? null,
        messages: cached,
        sessionCache: nextCache,
      });
      return;
    }
    sessionGuards.lastRequestedSessionId = sessionId;
    const res = await fetch(`/api/sessions/${sessionId}/load`, { method: 'POST' });
    if (!res.ok) {
      throw new Error('Failed to load session');
    }
    const data = await res.json();
    if (sessionGuards.lastRequestedSessionId !== sessionId) return;
    const loaded = toStoreMessages(data.messages || []);
    const resolvedProjectPath =
      projectPath ||
      (data.metadata as { projectPath?: string } | undefined)?.projectPath ||
      get().activeProjectPath;
    saveActiveSessionId(sessionId, resolvedProjectPath ?? null);
    // Use functional set to merge with LATEST sessionCache, avoiding stale data
    set((state) => ({
      activeSessionId: sessionId,
      activeProjectPath: resolvedProjectPath ?? null,
      messages: loaded,
      sessionCache: { ...state.sessionCache, [sessionId]: loaded },
    }));
  },

  clearActiveSession: () => {
    saveActiveSessionId(null);
    set({ activeSessionId: null, activeProjectPath: null, messages: [] });
  },

  appendExchange: (userContent, cliId) => {
    const sessionId = get().activeSessionId;
    if (!sessionId) return;
    const userMsg: CodeModeMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      content: userContent,
    };
    const aiMsg: CodeModeMessage = {
      id: `a-${Date.now()}`,
      role: 'assistant',
      content: '',
      ...(cliId && { cliId }),
    };
    set((state) => {
      const base = state.sessionCache[sessionId] ?? state.messages;
      const nextMessages = [...base, userMsg, aiMsg];
      return {
        messages: nextMessages,
        sessionCache: { ...state.sessionCache, [sessionId]: nextMessages },
      };
    });
  },

  appendLocalSystemMessage: (sessionId, content, tag, kind = 'command') => {
    if (!sessionId) return;
    const sysMsg: CodeModeMessage = {
      id: `s-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: 'system',
      content,
      systemKind: kind,
      ...(tag && { systemTag: tag }),
    };
    set((state) => {
      const base = state.sessionCache[sessionId] ?? (state.activeSessionId === sessionId ? state.messages : []);
      const nextMessages = [...base, sysMsg];
      const sessionCache = { ...state.sessionCache, [sessionId]: nextMessages };
      if (state.activeSessionId !== sessionId) return { sessionCache };
      return { messages: nextMessages, sessionCache };
    });
  },

  applyStreamEvent: (sessionId, event) => {
    set((state) => {
      const source =
        state.sessionCache[sessionId] ??
        (state.activeSessionId === sessionId ? state.messages : []);
      const updated = applyEventToMessages(source, event);
      const sessionCache = { ...state.sessionCache, [sessionId]: updated };
      if (state.activeSessionId !== sessionId) return { sessionCache };
      return { messages: updated, sessionCache };
    });
  },

  setSessionExecuting: (sessionId, executing) => {
    set((state) => {
      const executingSessions = { ...state.executingSessions };
      if (executing) {
        executingSessions[sessionId] = true;
      } else {
        delete executingSessions[sessionId];
      }
      return { executingSessions };
    });
  },

  isSessionExecuting: (sessionId) => Boolean(get().executingSessions[sessionId]),

  persistSession: async (sessionId) => {
    const id = sessionId ?? get().activeSessionId;
    if (!id) return;
    const messages = get().sessionCache[id] ?? get().messages;
    if (messages.length === 0) return;
    const project = useProjectStore.getState().getActiveProject();
    await fetch(`/api/sessions/${id}/save`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: toPersistMessages(messages),
        projectPath: project?.path,
        agentType: 'code-mode',
      }),
    });
    set({ sessionListVersion: get().sessionListVersion + 1 });
    const hasUserAndAssistant =
      messages.some((m) => m.role === 'user') &&
      messages.some((m) => m.role === 'assistant' && m.content.trim());
    if (hasUserAndAssistant) {
      const { apiKey, baseUrl, modelName } = useChatStore.getState();
      if (apiKey) {
        fetch(`/api/sessions/${id}/regenerate-title`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            apiKey,
            baseUrl: baseUrl?.trim() || undefined,
            modelName: modelName?.trim() || undefined,
          }),
        })
          .then(() => {
            set({ sessionListVersion: get().sessionListVersion + 1 });
          })
          .catch(() => {});
      }
    }
  },

  deleteSession: async (sessionId) => {
    const res = await fetch(`/api/sessions/${sessionId}`, { method: 'DELETE' });
    if (!res.ok) {
      throw new Error('Failed to delete session');
    }
    const { activeSessionId, sessionCache, executingSessions } = get();
    const nextCache = { ...sessionCache };
    delete nextCache[sessionId];
    const nextExecuting = { ...executingSessions };
    delete nextExecuting[sessionId];
    if (activeSessionId === sessionId) {
      saveActiveSessionId(null);
      set({
        activeSessionId: null,
        activeProjectPath: null,
        messages: [],
        sessionCache: nextCache,
        executingSessions: nextExecuting,
        sessionListVersion: get().sessionListVersion + 1,
      });
    } else {
      set({
        sessionCache: nextCache,
        executingSessions: nextExecuting,
        sessionListVersion: get().sessionListVersion + 1,
      });
    }
  },

  bumpSessionList: () => {
    set({ sessionListVersion: get().sessionListVersion + 1 });
  },
}));
