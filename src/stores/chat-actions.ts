/**
 * Extracted actions for chat-store to keep it under 300 lines.
 */
import type { Message } from '../../shared/types';
import { STORAGE_KEYS } from '../lib/storage-keys';

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
  if (typeof window === 'undefined' || !window.kavisNative?.getSettings) return;
  try {
    const nativeSettings = await window.kavisNative.getSettings();
    const updates: Record<string, string> = {};
    if (nativeSettings[STORAGE_KEYS.apiKey]) updates.apiKey = nativeSettings[STORAGE_KEYS.apiKey];
    if (nativeSettings[STORAGE_KEYS.baseUrl]) updates.baseUrl = nativeSettings[STORAGE_KEYS.baseUrl];
    if (nativeSettings[STORAGE_KEYS.model]) updates.modelName = nativeSettings[STORAGE_KEYS.model];
    if (nativeSettings[STORAGE_KEYS.workspace]) updates.workspacePath = nativeSettings[STORAGE_KEYS.workspace];

    if (Object.keys(updates).length > 0) {
      set(updates);
      if (updates.apiKey) localStorage.setItem(STORAGE_KEYS.apiKey, updates.apiKey);
      if (updates.baseUrl) localStorage.setItem(STORAGE_KEYS.baseUrl, updates.baseUrl);
      if (updates.modelName) localStorage.setItem(STORAGE_KEYS.model, updates.modelName);
      if (updates.workspacePath) localStorage.setItem(STORAGE_KEYS.workspace, updates.workspacePath);
    }
  } catch {
    // IPC unavailable — keep localStorage values
  }
}
