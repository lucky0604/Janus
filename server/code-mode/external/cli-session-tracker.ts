import fs from 'fs';
import path from 'path';
import type { CliToolId } from '../../../shared/types';
import { SESSIONS_DIR } from '../../shared/persistence/kavis-paths';

export interface CliNativeSession {
  cliId: CliToolId;
  nativeId: string;
  capturedAt: number;
  lastTurnCompleted: boolean;
}

type CliSessionMap = Partial<Record<CliToolId, CliNativeSession>>;

function atomicWrite(filePath: string, data: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmp = filePath + '.tmp.' + Date.now();
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

function getTrackerPath(sessionId: string): string {
  return path.join(SESSIONS_DIR, sessionId, 'cli-sessions.json');
}

export function loadCliSessions(sessionId: string): CliSessionMap {
  const filePath = getTrackerPath(sessionId);
  if (!fs.existsSync(filePath)) return {};
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as CliSessionMap;
  } catch {
    return {};
  }
}

export function saveCliSession(
  sessionId: string,
  cliId: CliToolId,
  nativeId: string,
): void {
  const filePath = getTrackerPath(sessionId);
  const existing = loadCliSessions(sessionId);
  existing[cliId] = {
    cliId,
    nativeId,
    capturedAt: Date.now(),
    lastTurnCompleted: false,
  };
  atomicWrite(filePath, JSON.stringify(existing, null, 2));
}

export function markTurnCompleted(
  sessionId: string,
  cliId: CliToolId,
): void {
  const filePath = getTrackerPath(sessionId);
  const existing = loadCliSessions(sessionId);
  if (existing[cliId]) {
    existing[cliId]!.lastTurnCompleted = true;
    atomicWrite(filePath, JSON.stringify(existing, null, 2));
  }
}

export function markTurnDirty(
  sessionId: string,
  cliId: CliToolId,
): void {
  const filePath = getTrackerPath(sessionId);
  const existing = loadCliSessions(sessionId);
  if (existing[cliId]) {
    existing[cliId]!.lastTurnCompleted = false;
    atomicWrite(filePath, JSON.stringify(existing, null, 2));
  }
}

export function getNativeSessionId(
  sessionId: string,
  cliId: CliToolId,
): CliNativeSession | undefined {
  const sessions = loadCliSessions(sessionId);
  return sessions[cliId];
}

export function getLastUsedCli(sessionId: string): CliToolId | undefined {
  const sessions = loadCliSessions(sessionId);
  let latest: CliNativeSession | undefined;
  for (const session of Object.values(sessions)) {
    if (!session) continue;
    if (!latest || session.capturedAt > latest.capturedAt) {
      latest = session;
    }
  }
  return latest?.cliId;
}
