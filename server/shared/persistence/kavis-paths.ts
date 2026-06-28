import fs from 'fs';
import path from 'path';
import os from 'os';

/** Legacy home directory from Janus-era installs. */
export const LEGACY_JANUS_HOME = path.join(os.homedir(), '.janus');

/** Current Kavis home directory for sessions, memory, projects, logs. */
export const KAVIS_HOME = path.join(os.homedir(), '.kavis');

export const SESSIONS_DIR = path.join(KAVIS_HOME, 'sessions');
export const PROJECTS_FILE = path.join(KAVIS_HOME, 'projects.json');
export const LOG_DIR = path.join(KAVIS_HOME, 'logs');

/** Legacy workspace-local cache directory name. */
export const LEGACY_WORKSPACE_DIR = '.janus';

/** Current workspace-local cache directory name. */
export const KAVIS_WORKSPACE_DIR = '.kavis';

let homeMigrationDone = false;

/**
 * One-time migration: rename ~/.janus → ~/.kavis when the new dir does not exist.
 * Safe to call on every server startup (idempotent).
 */
export function migrateLegacyHomeDir(): void {
  if (homeMigrationDone) return;
  homeMigrationDone = true;

  if (!fs.existsSync(LEGACY_JANUS_HOME)) return;
  if (fs.existsSync(KAVIS_HOME)) return;

  try {
    fs.renameSync(LEGACY_JANUS_HOME, KAVIS_HOME);
    console.log('[Kavis] Migrated ~/.janus → ~/.kavis');
  } catch (err) {
    console.warn('[Kavis] Failed to rename ~/.janus → ~/.kavis, attempting copy:', err);
    try {
      copyDirRecursive(LEGACY_JANUS_HOME, KAVIS_HOME);
      console.log('[Kavis] Copied ~/.janus → ~/.kavis');
    } catch (copyErr) {
      console.error('[Kavis] Legacy home migration failed:', copyErr);
    }
  }
}

/**
 * Migrate workspace-local `.janus/` → `.kavis/` when opening a project.
 * Returns the resolved `.kavis` directory path.
 */
export function resolveWorkspaceDataDir(workspacePath: string): string {
  const legacyDir = path.join(workspacePath, LEGACY_WORKSPACE_DIR);
  const kavisDir = path.join(workspacePath, KAVIS_WORKSPACE_DIR);

  if (fs.existsSync(legacyDir) && !fs.existsSync(kavisDir)) {
    try {
      fs.renameSync(legacyDir, kavisDir);
      console.log(`[Kavis] Migrated ${LEGACY_WORKSPACE_DIR}/ → ${KAVIS_WORKSPACE_DIR}/ in ${workspacePath}`);
    } catch (err) {
      console.warn(`[Kavis] Failed to migrate workspace dir in ${workspacePath}:`, err);
    }
  }

  return kavisDir;
}

function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
