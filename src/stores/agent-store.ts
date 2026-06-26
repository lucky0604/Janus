import { create } from 'zustand';
import { useChatStore } from './chat-store';
import { useSceneStore } from './scene-store';
import type { OperatingModeId, AgentRoleId } from '../../shared/types';

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
    const { activeRole, activeMode: prevMode } = get();
    if (modeId === prevMode) return;
    set({ activeMode: modeId });
    const key = compositeKey(modeId, modeId === 'code' ? activeRole : undefined);
    useChatStore.getState().switchAgent(key);
    const sceneStore = useSceneStore.getState();
    if (modeId === 'code' && sceneStore.currentScene !== 'code_mode') {
      set({ activeMode: modeId });
      useSceneStore.setState({ currentScene: 'code_mode' });
    } else if (modeId !== 'code' && sceneStore.currentScene === 'code_mode') {
      useSceneStore.setState({ currentScene: 'chat' });
    }
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
