import { useEffect, useState } from 'react';
import type { CliToolId } from '../../../../shared/types';
import { useCodeModeSessionStore } from '../../../stores/code-mode-session-store';

export function getPreviousCliFromMessages(sessionId: string): CliToolId | undefined {
  const store = useCodeModeSessionStore.getState();
  const messages = store.sessionCache[sessionId] ?? store.messages;
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === 'assistant' && msg.cliId) {
      return msg.cliId;
    }
  }
  return undefined;
}

export function useIsNarrow(breakpoint = 768): boolean {
  const [narrow, setNarrow] = useState(
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setNarrow(e.matches);
    setNarrow(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return narrow;
}
