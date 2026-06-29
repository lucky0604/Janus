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
    const updates: Record<string, string | boolean> = {};
    if (nativeSettings[STORAGE_KEYS.apiKey]) updates.apiKey = nativeSettings[STORAGE_KEYS.apiKey];
    if (nativeSettings[STORAGE_KEYS.baseUrl]) updates.baseUrl = nativeSettings[STORAGE_KEYS.baseUrl];
    if (nativeSettings[STORAGE_KEYS.model]) updates.modelName = nativeSettings[STORAGE_KEYS.model];
    if (nativeSettings[STORAGE_KEYS.workspace]) updates.workspacePath = nativeSettings[STORAGE_KEYS.workspace];
    if (nativeSettings[STORAGE_KEYS.codeModeApiKey]) updates.codeModeApiKey = nativeSettings[STORAGE_KEYS.codeModeApiKey];
    if (nativeSettings[STORAGE_KEYS.codeModeBaseUrl]) updates.codeModeBaseUrl = nativeSettings[STORAGE_KEYS.codeModeBaseUrl];
    if (nativeSettings[STORAGE_KEYS.codeModeModel]) updates.codeModeModel = nativeSettings[STORAGE_KEYS.codeModeModel];
    if (nativeSettings[STORAGE_KEYS.codeModeUseOverride] !== undefined) {
      updates.codeModeUseOverride = nativeSettings[STORAGE_KEYS.codeModeUseOverride] === 'true';
    }

    if (Object.keys(updates).length > 0) {
      set(updates);
      if (typeof updates.baseUrl === 'string') localStorage.setItem(STORAGE_KEYS.baseUrl, updates.baseUrl);
      if (typeof updates.modelName === 'string') localStorage.setItem(STORAGE_KEYS.model, updates.modelName);
      if (typeof updates.workspacePath === 'string') localStorage.setItem(STORAGE_KEYS.workspace, updates.workspacePath);
      if (typeof updates.codeModeBaseUrl === 'string') localStorage.setItem(STORAGE_KEYS.codeModeBaseUrl, updates.codeModeBaseUrl);
      if (typeof updates.codeModeModel === 'string') localStorage.setItem(STORAGE_KEYS.codeModeModel, updates.codeModeModel);
      if (typeof updates.codeModeUseOverride === 'boolean') {
        localStorage.setItem(STORAGE_KEYS.codeModeUseOverride, updates.codeModeUseOverride ? 'true' : 'false');
      }
    }
    set({ settingsHydrated: true });
  } catch {
    set({ settingsHydrated: true });
    // IPC unavailable — keep localStorage values
  }
}
