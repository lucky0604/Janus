import { useSceneStore } from '../../stores/app-stores';
import { ChatPane } from '../scenes/chat/ChatPane';
import { WelcomeScene } from '../scenes/welcome/WelcomeScene';
import { SettingsScene } from '../scenes/settings/SettingsScene';

export function SceneArea() {
  const { currentScene } = useSceneStore();

  switch (currentScene) {
    case 'welcome':
      return <WelcomeScene />;
    case 'chat':
      return <ChatPane />;
    case 'settings':
      return <SettingsScene />;
    default:
      return <ChatPane />;
  }
}
