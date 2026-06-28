/**
 * Hook for accessing native Electron bridge functions.
 * Provides safe fallbacks when running in non-Electron environments.
 */
export function useNativeBridge() {
  const selectFolder = async (): Promise<string | null> => {
    if (typeof window === 'undefined') return null;

    if (!window.kavisNative?.selectFolder) {
      console.warn('[useNativeBridge] Electron IPC bridge not available');
      return null;
    }

    try {
      return await window.kavisNative.selectFolder();
    } catch (err) {
      console.error('[useNativeBridge] selectFolder failed:', err);
      return null;
    }
  };

  return { selectFolder };
}
