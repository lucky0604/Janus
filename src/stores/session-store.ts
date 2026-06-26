import { create } from 'zustand';

export interface SessionMetaUI {
  sessionId: string;
  name: string;
  agentType: string;
  turnCount: number;
  lastActiveAt: string;
}

interface SessionState {
  sessions: SessionMetaUI[];
  currentSessionId: string | null;
  setSessions: (sessions: SessionMetaUI[]) => void;
  setCurrentSession: (id: string | null) => void;
  addSession: (session: SessionMetaUI) => void;
  removeSession: (id: string) => void;
  refreshSessions: () => Promise<void>;
}

export const useSessionStore = create<SessionState>((set) => ({
  sessions: [],
  currentSessionId: null,

  setSessions: (sessions) => set({ sessions }),
  setCurrentSession: (id) => set({ currentSessionId: id }),
  addSession: (session) =>
    set((s) => ({ sessions: [session, ...s.sessions] })),
  removeSession: (id) =>
    set((s) => ({ sessions: s.sessions.filter((sess) => sess.sessionId !== id) })),

  refreshSessions: async () => {
    try {
      const res = await fetch('/api/sessions?scope=work');
      if (res.ok) {
        const data = await res.json();
        set({ sessions: data.sessions || [] });
      }
    } catch {
      // ignore
    }
  },
}));
