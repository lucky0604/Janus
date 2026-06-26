import { useSceneStore } from '../../stores/scene-store';
import { ChatScene } from '../scenes/chat/ChatScene';
import { WelcomeScene } from '../scenes/welcome/WelcomeScene';
import { SettingsScene } from '../scenes/settings/SettingsScene';
import { TerminalSpikeScene } from '../scenes/terminal-spike/TerminalSpikeScene';
import { CodeModeScene } from '../scenes/code-mode/CodeModeScene';

export function SceneArea() {
  const { currentScene } = useSceneStore();

  switch (currentScene) {
    case 'welcome':
      return <WelcomeScene />;
    case 'chat':
      return <ChatScene />;
    case 'settings':
      return <SettingsScene />;
    case 'terminal_spike':
      return <TerminalSpikeScene />;
    case 'code_mode':
      return <CodeModeScene />;
    default:
      return <ChatScene />;
  }
}
