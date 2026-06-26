import { useEffect } from 'react';
import { AppLayout } from './app/layout/AppLayout';
import { useChatStore } from './stores/chat-store';
import { useThemeStore } from './stores/theme-store';

export function App() {
  useEffect(() => {
    useChatStore.getState().hydrateSettings();
    useThemeStore.getState().hydrateFromNative();
  }, []);

  return <AppLayout />;
}
