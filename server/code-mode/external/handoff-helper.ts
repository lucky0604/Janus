import fs from 'fs';
import path from 'path';
import type { HandoffContext } from '../../../shared/types';
import {
  KAVIS_WORKSPACE_DIR,
  LEGACY_WORKSPACE_DIR,
  resolveWorkspaceDataDir,
} from '../../shared/persistence/kavis-paths';

const HANDOFF_FILE = 'handoff.json';
const SCHEMA_VERSION = 1;

function handoffPath(workspacePath: string): string {
  const dataDir = resolveWorkspaceDataDir(workspacePath);
  return path.join(dataDir, HANDOFF_FILE);
}

/** Read handoff from .kavis or legacy .janus location. */
function readHandoffFromDirs(workspacePath: string): HandoffContext | null {
  const candidates = [
    path.join(workspacePath, KAVIS_WORKSPACE_DIR, HANDOFF_FILE),
    path.join(workspacePath, LEGACY_WORKSPACE_DIR, HANDOFF_FILE),
  ];

  for (const filePath of candidates) {
    try {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as HandoffContext;
      if (parsed.version !== SCHEMA_VERSION) {
        throw new Error(`Unsupported handoff version: ${parsed.version}`);
      }
      return parsed;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
  }
  return null;
}

export function readHandoff(workspacePath: string): HandoffContext | null {
  return readHandoffFromDirs(workspacePath);
}

export function writeHandoff(
  workspacePath: string,
  context: HandoffContext,
): void {
  const dirPath = resolveWorkspaceDataDir(workspacePath);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
  const target = handoffPath(workspacePath);
  const tmpPath = target + '.tmp';
  fs.writeFileSync(tmpPath, JSON.stringify(context, null, 2), 'utf-8');
  fs.renameSync(tmpPath, target);
}

export function deleteHandoff(workspacePath: string): boolean {
  const filePath = handoffPath(workspacePath);
  try {
    fs.unlinkSync(filePath);
    return true;
  } catch {
    return false;
  }
}

export function ensureGitignore(workspacePath: string): void {
  const gitignorePath = path.join(workspacePath, '.gitignore');
  const entries = [`${KAVIS_WORKSPACE_DIR}/`, `${LEGACY_WORKSPACE_DIR}/`];
  try {
    const content = fs.existsSync(gitignorePath)
      ? fs.readFileSync(gitignorePath, 'utf-8')
      : '';
    const lines = content.split('\n');
    let updated = content;
    for (const entry of entries) {
      if (!lines.some((line) => line.trim() === entry)) {
        const separator = updated.endsWith('\n') || updated === '' ? '' : '\n';
        updated = `${updated}${separator}${entry}\n`;
      }
    }
    if (updated !== content) {
      fs.writeFileSync(gitignorePath, updated, 'utf-8');
    }
  } catch {
    // non-critical
  }
}

export function createHandoffContext(
  partial: Omit<HandoffContext, 'version' | 'timestamp'>,
): HandoffContext {
  return {
    ...partial,
    version: SCHEMA_VERSION,
    timestamp: new Date().toISOString(),
  };
}
