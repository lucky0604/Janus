import { create } from 'zustand';
import type { Message, StreamEvent, StreamErrorEventData } from '../../shared/types';
import { useAgentStore } from './agent-store';
import { useSessionStore } from './session-store';
import { generateId, processSSEEvent } from './chat-sse-handler';
import { respondToApproval as doRespondToApproval, hydrateSettings as doHydrateSettings } from './chat-actions';

interface ChatState {
  messages: Message[];
  isStreaming: boolean;
  isConnecting: boolean;
  connectionError: boolean;
  errorMessage: string | null;
  lastError: StreamErrorEventData | null;
  apiKey: string;
  baseUrl: string;
  modelName: string;
  workspacePath: string;
  sessionId: string;

  // Actions
  sendMessage: (content: string) => Promise<void>;
  retryLastMessage: () => Promise<void>;
  stopGeneration: () => void;
  setApiKey: (key: string) => void;
  setBaseUrl: (url: string) => void;
  setModelName: (model: string) => void;
  setWorkspacePath: (path: string) => void;
  clearError: () => void;
  addMessage: (msg: Message) => void;
  switchAgent: (agentId: string) => void;
  resetSession: () => void;
  respondToApproval: (approvalId: string, approved: boolean) => Promise<void>;
  hydrateSettings: () => Promise<void>;
}

let abortController: AbortController | null = null;

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isStreaming: false,
  isConnecting: false,
  connectionError: false,
  errorMessage: null,
  lastError: null,
  apiKey: localStorage.getItem('janus_api_key') || '',
  baseUrl: localStorage.getItem('janus_base_url') || 'https://api.openai.com/v1',
  modelName: localStorage.getItem('janus_model') || 'gpt-4o',
  workspacePath: localStorage.getItem('janus_workspace') || '',
  sessionId: generateId(),

  sendMessage: async (content: string) => {
    const { apiKey, baseUrl, modelName, workspacePath, sessionId, messages } = get();
    const { activeMode, activeRole } = useAgentStore.getState();
    if (!apiKey) {
      set({ errorMessage: 'API key required' });
      return;
    }

    const userMsg: Message = {
      id: generateId(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set({
      messages: [...messages, userMsg],
      isStreaming: true,
      isConnecting: true,
      connectionError: false,
      errorMessage: null,
      lastError: null,
    });

    const requestMessages = [...messages, userMsg];

    abortController = new AbortController();

    const pendingToolCalls = new Map<string, { name: string; args: Record<string, unknown> }>();

    try {
      const response = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
        },
        body: JSON.stringify({
          messages: requestMessages,
          workspacePath: workspacePath.trim(),
          sessionId,
          baseUrl: baseUrl.trim(),
          modelName: modelName.trim(),
          agentId: activeMode === 'code' ? `${activeMode}/${activeRole}` : activeMode,
          mode: activeMode,
          role: activeMode === 'code' ? activeRole : undefined,
        }),
        signal: abortController.signal,
      });

      set({ isConnecting: false });

      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        set({
          isStreaming: false,
          errorMessage: err.error || `Request failed (${response.status})`,
        });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        set({ isStreaming: false, errorMessage: 'No response stream' });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        const eventBlocks = buffer.split(/\n\n/);
        buffer = eventBlocks.pop() || '';

        for (const block of eventBlocks) {
          const dataLines: string[] = [];
          for (const line of block.split(/\r?\n/)) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data:')) {
              dataLines.push(trimmed.slice(5).trimStart());
            }
          }

          if (dataLines.length === 0) continue;

          const json = dataLines.join('');
          if (json === '[DONE]') continue;

          try {
            const event: StreamEvent = JSON.parse(json);

            const shouldStop = processSSEEvent(event, {
              set: set as (partial: Record<string, unknown>) => void,
              getMessages: () => get().messages,
              pendingToolCalls,
              onDone: () => {
                useSessionStore.getState().refreshSessions();
                setTimeout(() => { useSessionStore.getState().refreshSessions(); }, 3000);
              },
            });
            if (shouldStop) return;
          } catch {
            // Skip malformed events
          }
        }
      }

      set({ isStreaming: false });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        const msgs = [...get().messages];
        const last = msgs[msgs.length - 1];
        if (last && last.role === 'assistant' && !last.content) {
          last.content = '[Stopped]';
        }
        set({ messages: [...msgs], isStreaming: false, isConnecting: false });
      } else if (err instanceof TypeError && err.message.includes('fetch')) {
        const message = err.message || 'Connection failed';
        set({
          isStreaming: false,
          isConnecting: false,
          connectionError: true,
          errorMessage: `[Network] ${message}`,
          lastError: { message, kind: 'unknown', code: 'NETWORK_ERROR' },
        });
      } else {
        const message = err instanceof Error ? err.message : 'Connection failed';
        const code = err instanceof Error ? (err as { code?: string }).code : undefined;
        set({
          isStreaming: false,
          isConnecting: false,
          errorMessage: `[Client] ${message}`,
          lastError: { message, kind: 'unknown', code },
        });
      }
    }
  },

  stopGeneration: () => {
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  },

  retryLastMessage: async () => {
    const { messages, isStreaming } = get();
    if (isStreaming) return;
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') { lastUserIdx = i; break; }
    }
    if (lastUserIdx === -1) return;
    const content = messages[lastUserIdx].content;
    set({
      messages: messages.slice(0, lastUserIdx),
      lastError: null,
      errorMessage: null,
      connectionError: false,
    });
    await get().sendMessage(content);
  },

  setApiKey: (key: string) => {
    localStorage.setItem('janus_api_key', key);
    window.janusNative?.setSetting?.('janus_api_key', key);
    set({ apiKey: key, errorMessage: null });
  },

  setBaseUrl: (url: string) => {
    localStorage.setItem('janus_base_url', url);
    window.janusNative?.setSetting?.('janus_base_url', url);
    set({ baseUrl: url });
  },

  setModelName: (model: string) => {
    localStorage.setItem('janus_model', model);
    window.janusNative?.setSetting?.('janus_model', model);
    set({ modelName: model });
  },

  setWorkspacePath: (path: string) => {
    localStorage.setItem('janus_workspace', path);
    window.janusNative?.setSetting?.('janus_workspace', path);
    set({ workspacePath: path });
  },

  clearError: () => set({ errorMessage: null, connectionError: false, lastError: null }),

  addMessage: (msg: Message) => {
    set({ messages: [...get().messages, msg] });
  },

  /** Switch agent/mode without clearing conversation history. */
  switchAgent: (_agentId: string) => {
    abortController?.abort();
    abortController = null;
    set({
      sessionId: crypto.randomUUID(),
      isStreaming: false,
      isConnecting: false,
      connectionError: false,
      errorMessage: null,
    });
  },

  /** Clear all messages and start fresh. Used by /clear command. */
  resetSession: () => {
    abortController?.abort();
    abortController = null;
    set({
      sessionId: crypto.randomUUID(),
      messages: [],
      isStreaming: false,
      isConnecting: false,
      connectionError: false,
      errorMessage: null,
    });
    // Refresh session list after clearing
    useSessionStore.getState().refreshSessions();
  },

  respondToApproval: async (approvalId, approved) => {
    return doRespondToApproval(approvalId, approved, { set: set as (p: Record<string, unknown>) => void, get });
  },

  hydrateSettings: async () => {
    await doHydrateSettings(set as (p: Record<string, unknown>) => void);
  },
}));