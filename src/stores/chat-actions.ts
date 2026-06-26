/**
 * Extracted actions for chat-store to keep it under 300 lines.
 */
import type { Message } from '../../shared/types';

interface ChatStoreApi {
  set: (partial: Record<string, unknown>) => void;
  get: () => { messages: Message[] };
}

/** Submit tool approval response to server and update local state. */
export async function respondToApproval(
  approvalId: string,
  approved: boolean,
  api: ChatStoreApi,
): Promise<void> {
  const msgs = [...api.get().messages];
  const idx = msgs.findIndex(
    (m) => m.eventMeta?.type === 'tool_approval' &&
      m.eventMeta.approvalId === approvalId &&
      m.eventMeta.status === 'pending',
  );
  if (idx < 0) return;

  try {
    const res = await fetch('/api/chat/approval', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalId, approved }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      api.set({ errorMessage: (err as { error?: string }).error || 'Failed to submit approval' });
      return;
    }

    if (msgs[idx].eventMeta?.type === 'tool_approval') {
      msgs[idx] = {
        ...msgs[idx],
        eventMeta: { ...msgs[idx].eventMeta!, status: approved ? 'approved' : 'denied' },
      };
      api.set({ messages: [...msgs] });
    }
  } catch (err) {
    api.set({ errorMessage: err instanceof Error ? err.message : 'Failed to submit approval' });
  }
}

/** Hydrate settings from Electron's file-based persistence (IPC bridge). */
export async function hydrateSettings(
  set: (partial: Record<string, unknown>) => void,
): Promise<void> {
  if (typeof window === 'undefined' || !window.janusNative?.getSettings) return;
  try {
    const nativeSettings = await window.janusNative.getSettings();
    const updates: Record<string, string> = {};
    if (nativeSettings.janus_api_key) updates.apiKey = nativeSettings.janus_api_key;
    if (nativeSettings.janus_base_url) updates.baseUrl = nativeSettings.janus_base_url;
    if (nativeSettings.janus_model) updates.modelName = nativeSettings.janus_model;
    if (nativeSettings.janus_workspace) updates.workspacePath = nativeSettings.janus_workspace;

    if (Object.keys(updates).length > 0) {
      set(updates);
      if (updates.apiKey) localStorage.setItem('janus_api_key', updates.apiKey);
      if (updates.baseUrl) localStorage.setItem('janus_base_url', updates.baseUrl);
      if (updates.modelName) localStorage.setItem('janus_model', updates.modelName);
      if (updates.workspacePath) localStorage.setItem('janus_workspace', updates.workspacePath);
    }
  } catch {
    // IPC unavailable — keep localStorage values
  }
}
