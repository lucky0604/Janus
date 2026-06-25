import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_DIR = path.join(os.homedir(), '.janus');
const LOG_FILE = path.join(LOG_DIR, 'errors.log');
const MAX_BYTES = 5 * 1024 * 1024;

export interface ErrorLogEntry {
  ts: string;
  source: string;
  message: string;
  kind?: string;
  status?: number;
  baseUrl?: string;
  model?: string;
  code?: string;
  stack?: string;
  extra?: Record<string, unknown>;
}

let ensured = false;
function ensureDir(): void {
  if (ensured) return;
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    ensured = true;
  } catch {
    // ignore — best-effort logging
  }
}

/**
 * Strip API keys and URL credentials from arbitrary string fields before persisting.
 * Patterns covered: 'sk-...' style bearer keys, user:pass@host URL syntax.
 * Never throws — returns input unchanged if regex fails. Security-critical.
 */
function redact(s: string | undefined): string | undefined {
  if (!s) return s;
  return s
    .replace(/\b(sk-[A-Za-z0-9_-]{8,})\b/g, 'sk-***REDACTED***')
    .replace(/(Authorization:\s*Bearer\s+)[A-Za-z0-9._-]+/gi, '$1***REDACTED***')
    .replace(/\/\/([^/@\s]+):([^/@\s]+)@/g, '//$1:***REDACTED***@');
}

function rotateIfNeeded(): void {
  try {
    const stat = fs.statSync(LOG_FILE);
    if (stat.size < MAX_BYTES) return;
    const rotated = LOG_FILE + '.1';
    try { fs.unlinkSync(rotated); } catch { /* not present */ }
    fs.renameSync(LOG_FILE, rotated);
  } catch {
    // file may not exist yet — nothing to rotate
  }
}

export function logError(entry: Omit<ErrorLogEntry, 'ts'>): void {
  ensureDir();
  rotateIfNeeded();
  const safe: ErrorLogEntry = {
    ts: new Date().toISOString(),
    source: entry.source,
    message: redact(entry.message) ?? '',
    kind: entry.kind,
    status: entry.status,
    baseUrl: redact(entry.baseUrl),
    model: entry.model,
    code: entry.code,
    stack: redact(entry.stack),
    extra: entry.extra,
  };
  try {
    fs.appendFileSync(LOG_FILE, JSON.stringify(safe) + '\n', 'utf8');
  } catch {
    // disk full / permissions — drop log silently, don't affect request path
  }
}

export function getErrorLogPath(): string {
  return LOG_FILE;
}
