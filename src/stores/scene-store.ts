import { create } from 'zustand';
import { useAgentStore } from './agent-store';

type Scene = 'welcome' | 'chat' | 'settings' | 'terminal_spike' | 'code_mode';

interface SceneState {
  currentScene: Scene;
  navigate: (scene: Scene) => void;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  currentScene: 'welcome',

  navigate: (scene: Scene) => {
    if (scene === get().currentScene) return;
    set({ currentScene: scene });
    // Sync agent mode when navigating to/from code_mode via NavBar
    const agentState = useAgentStore.getState();
    if (scene === 'code_mode' && agentState.activeMode !== 'code') {
      useAgentStore.setState({ activeMode: 'code' });
    } else if (scene === 'chat' && agentState.activeMode === 'code') {
      useAgentStore.setState({ activeMode: 'work' });
    }
  },
}));
