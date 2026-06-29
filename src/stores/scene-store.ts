import { create } from 'zustand';
import { useAgentStore } from './agent-store';

type Scene = 'welcome' | 'chat' | 'settings' | 'terminal_spike' | 'code_mode';
export type SettingsTab = 'work' | 'code' | 'workspace';

interface SceneState {
  currentScene: Scene;
  settingsInitialTab: SettingsTab | null;
  navigate: (scene: Scene) => void;
  openSettings: (tab: SettingsTab) => void;
  consumeSettingsInitialTab: () => SettingsTab | null;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  currentScene: 'welcome',
  settingsInitialTab: null,

  navigate: (scene: Scene) => {
    if (scene === get().currentScene) return;
    set({ currentScene: scene });
    const agentState = useAgentStore.getState();
    if (scene === 'code_mode' && agentState.activeMode !== 'code') {
      useAgentStore.setState({ activeMode: 'code' });
    } else if (scene === 'chat' && agentState.activeMode === 'code') {
      useAgentStore.setState({ activeMode: 'work' });
    }
  },

  openSettings: (tab: SettingsTab) => {
    set({ currentScene: 'settings', settingsInitialTab: tab });
  },

  consumeSettingsInitialTab: () => {
    const t = get().settingsInitialTab;
    if (t) set({ settingsInitialTab: null });
    return t;
  },
}));
