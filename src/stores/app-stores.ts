import { create } from 'zustand';
import { useChatStore } from './chat-store';
import type { OperatingModeId, AgentRoleId } from '../../shared/types';

type Theme = 'dark' | 'light';

function getInitialTheme(): Theme {
  try {
    return (localStorage.getItem('janus_theme') as Theme) || 'dark';
  } catch {
    return 'dark';
  }
}

interface ThemeState {
  theme: Theme;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: getInitialTheme(),

  toggle: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('janus_theme', next);
    document.documentElement.setAttribute('data-theme', next);
    set({ theme: next });
  },
}));

document.documentElement.setAttribute('data-theme', getInitialTheme());

// ---- Operating Mode + Agent Role UI metadata ----

export interface ModeUI {
  id: OperatingModeId;
  name: string;
  description: string;
  iconKey: string;
}

export interface RoleUI {
  id: AgentRoleId;
  name: string;
  description: string;
}

const DEFAULT_MODES: ModeUI[] = [
  {
    id: 'work',
    name: 'Work Mode',
    description: 'Daily productivity — search, read, write files, run commands',
    iconKey: 'briefcase',
  },
  {
    id: 'code',
    name: 'Code Mode',
    description: 'AI-powered coding — read, edit, debug, and review code',
    iconKey: 'code2',
  },
];

const DEFAULT_ROLES: RoleUI[] = [
  { id: 'agentic', name: 'Agentic', description: 'Full autonomy — reads, edits, debugs, and completes tasks' },
  { id: 'plan',    name: 'Plan',    description: 'Plan before acting — clarifies requirements then creates plans' },
  { id: 'ask',     name: 'Ask',     description: 'Read-only research — search, read, analyze, explain' },
  { id: 'debug',   name: 'Debug',   description: 'Systematic debugging — investigate, diagnose, and fix issues' },
];

export function compositeKey(modeId: OperatingModeId, roleId?: AgentRoleId): string {
  return roleId ? `${modeId}/${roleId}` : modeId;
}

interface AgentState {
  modes: ModeUI[];
  roles: RoleUI[];
  activeMode: OperatingModeId;
  activeRole: AgentRoleId;
  setMode: (mode: OperatingModeId) => void;
  setRole: (role: AgentRoleId) => void;
  fetchAgents: () => Promise<void>;
}

export const useAgentStore = create<AgentState>((set, get) => ({
  modes: DEFAULT_MODES,
  roles: DEFAULT_ROLES,
  activeMode: 'work',
  activeRole: 'agentic',

  setMode: (modeId: OperatingModeId) => {
    const { activeRole } = get();
    set({ activeMode: modeId });
    const key = compositeKey(modeId, modeId === 'code' ? activeRole : undefined);
    useChatStore.getState().switchAgent(key);
  },

  setRole: (roleId: AgentRoleId) => {
    const { activeMode } = get();
    set({ activeRole: roleId });
    const key = compositeKey(activeMode, roleId);
    useChatStore.getState().switchAgent(key);
  },

  fetchAgents: async () => {
    try {
      const res = await fetch('/api/agents');
      if (res.ok) {
        const data = await res.json();
        if (data.modes) {
          set({
            modes: data.modes.map((m: Record<string, unknown>) => ({
              id: m.id as OperatingModeId,
              name: m.name as string,
              description: m.description as string,
              iconKey: (m.iconKey as string) || 'circle',
            })),
          });
        }
        if (data.roles) {
          set({
            roles: data.roles.map((r: Record<string, unknown>) => ({
              id: r.id as AgentRoleId,
              name: r.name as string,
              description: r.description as string,
            })),
          });
        }
      }
    } catch {
      // Backend unavailable — keep defaults
    }
  },
}));

// ---- Scene Store ----
type Scene = 'welcome' | 'chat' | 'settings';

interface SceneState {
  currentScene: Scene;
  navigate: (scene: Scene) => void;
}

export const useSceneStore = create<SceneState>((set) => ({
  currentScene: 'welcome',

  navigate: (scene: Scene) => {
    set({ currentScene: scene });
  },
}));

// ---- Session Store ----
interface SessionMetaUI {
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
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        set({ sessions: data.sessions || [] });
      }
    } catch {
      // ignore
    }
  },
}));