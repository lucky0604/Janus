/** Current Kavis localStorage / Electron settings key names. */
export const STORAGE_KEYS = {
  apiKey: 'kavis_api_key',
  baseUrl: 'kavis_base_url',
  model: 'kavis_model',
  workspace: 'kavis_workspace',
  theme: 'kavis_theme',
  projects: 'kavis_projects',
  activeProjectId: 'kavis_active_project_id',
  sidebarWidth: 'kavis_sidebar_w',
  inspectorWidth: 'kavis_inspector_w',
  ptyHeight: 'kavis_pty_h',
  codeModeSessionId: 'kavis_code_mode_session_id',
  codeModeSessionProject: 'kavis_code_mode_session_project',
  codeModeApiKey: 'kavis_code_api_key',
  codeModeBaseUrl: 'kavis_code_base_url',
  codeModeModel: 'kavis_code_model',
  codeModeUseOverride: 'kavis_code_use_override',
} as const;

/** Legacy Janus-era localStorage keys (pre-migration). */
const LEGACY_KEYS: Record<keyof typeof STORAGE_KEYS, string> = {
  apiKey: 'janus_api_key',
  baseUrl: 'janus_base_url',
  model: 'janus_model',
  workspace: 'janus_workspace',
  theme: 'janus_theme',
  projects: 'janus_projects',
  activeProjectId: 'janus_active_project_id',
  sidebarWidth: 'janus_sidebar_w',
  inspectorWidth: 'janus_inspector_w',
  ptyHeight: 'janus_pty_h',
  codeModeSessionId: 'janus_code_mode_session_id',
  codeModeSessionProject: 'janus_code_mode_session_project',
  codeModeApiKey: 'janus_code_api_key',
  codeModeBaseUrl: 'janus_code_base_url',
  codeModeModel: 'janus_code_model',
  codeModeUseOverride: 'janus_code_use_override',
};

let migrationDone = false;

/**
 * Migrate legacy `janus_*` localStorage keys to `kavis_*`.
 * Idempotent — safe to call on every app boot.
 */
export function migrateLocalStorageKeys(): void {
  if (migrationDone || typeof localStorage === 'undefined') return;
  migrationDone = true;

  for (const key of Object.keys(STORAGE_KEYS) as Array<keyof typeof STORAGE_KEYS>) {
    const newKey = STORAGE_KEYS[key];
    const legacyKey = LEGACY_KEYS[key];
    const legacyValue = localStorage.getItem(legacyKey);
    if (legacyValue !== null && localStorage.getItem(newKey) === null) {
      localStorage.setItem(newKey, legacyValue);
    }
    if (legacyValue !== null) {
      localStorage.removeItem(legacyKey);
    }
  }
}

/** Read a setting value, falling back to legacy key during transition. */
export function readStorage(key: keyof typeof STORAGE_KEYS, fallback = ''): string {
  migrateLocalStorageKeys();
  return localStorage.getItem(STORAGE_KEYS[key]) ?? fallback;
}
