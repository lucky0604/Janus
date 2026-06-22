import fs from 'fs';
import path from 'path';
import os from 'os';
import type { Message, SessionMeta, DialogTurn, SessionListScope } from '../../shared/types';
import { sessionMatchesScope } from '../../shared/types';

const SESSIONS_DIR = path.join(os.homedir(), '.janus', 'sessions');

function normalizeWorkspacePath(workspacePath?: string): string | undefined {
  if (!workspacePath) return undefined;
  return path.resolve(workspacePath);
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function atomicWrite(filePath: string, data: string): void {
  const tmp = filePath + '.tmp.' + Date.now();
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

// --- Index write lock (prevents read-then-write races on index.json) ---
let indexWriteLocked = false;
const indexWriteQueue: Array<() => void> = [];

function acquireIndexLock(): Promise<void> {
  return new Promise((resolve) => {
    if (!indexWriteLocked) {
      indexWriteLocked = true;
      resolve();
    } else {
      indexWriteQueue.push(resolve);
    }
  });
}

function releaseIndexLock(): void {
  if (indexWriteQueue.length > 0) {
    const next = indexWriteQueue.shift()!;
    setImmediate(() => next());
  } else {
    indexWriteLocked = false;
  }
}


export async function saveSession(
  sessionId: string,
  messages: Message[],
  agentType: string,
  workspacePath?: string
): Promise<void> {
  await upsertSession(sessionId, messages, agentType, workspacePath);
}

export async function loadSession(sessionId: string): Promise<{ messages: Message[]; metadata: SessionMeta } | null> {
  const dir = path.join(SESSIONS_DIR, sessionId);
  if (!fs.existsSync(dir)) return null;

  try {
    const metadata: SessionMeta = JSON.parse(
      fs.readFileSync(path.join(dir, 'metadata.json'), 'utf-8')
    );

    const messages: Message[] = [];
    const turnsDir = path.join(dir, 'turns');
    if (fs.existsSync(turnsDir)) {
      const files = fs.readdirSync(turnsDir)
        .filter((f) => f.startsWith('turn-') && f.endsWith('.json'))
        .sort();

      for (const file of files) {
        const turn: DialogTurn = JSON.parse(
          fs.readFileSync(path.join(turnsDir, file), 'utf-8')
        );
        messages.push(...turn.messages);
      }
    }

    return { messages, metadata };
  } catch {
    return null;
  }
}

export interface ListSessionsOptions {
  workspacePath?: string;
  scope?: SessionListScope;
}

export async function listSessions(options?: ListSessionsOptions | string): Promise<SessionMeta[]> {
  const opts: ListSessionsOptions =
    typeof options === 'string' ? { workspacePath: options } : (options ?? {});

  ensureDir(SESSIONS_DIR);

  const indexFile = path.join(SESSIONS_DIR, 'index.json');
  if (!fs.existsSync(indexFile)) return [];

  let sessions: SessionMeta[] = [];
  try {
    sessions = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
  } catch {}

  if (opts.scope) {
    sessions = sessions.filter((s) => sessionMatchesScope(s.agentType, opts.scope!));
  }

  if (opts.workspacePath) {
    const normalized = normalizeWorkspacePath(opts.workspacePath)!;
    sessions = sessions.filter(
      (s) => s.projectPath && normalizeWorkspacePath(s.projectPath) === normalized,
    );
  }

  return sessions;
}

export async function deleteSession(sessionId: string): Promise<void> {
  const dir = path.join(SESSIONS_DIR, sessionId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await removeFromIndex(sessionId);
}

export async function createEmptySession(
  sessionId: string,
  agentType: string,
  workspacePath?: string,
  name?: string,
): Promise<SessionMeta> {
  return upsertSession(sessionId, [], agentType, workspacePath, name);
}

export async function upsertSession(
  sessionId: string,
  messages: Message[],
  agentType: string,
  workspacePath?: string,
  sessionName?: string,
): Promise<SessionMeta> {
  const dir = path.join(SESSIONS_DIR, sessionId);
  ensureDir(dir);

  const metadataPath = path.join(dir, 'metadata.json');
  let metadata: SessionMeta;

  if (fs.existsSync(metadataPath)) {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    metadata.lastActiveAt = new Date().toISOString();
    metadata.messageCount = messages.length;
    metadata.agentType = agentType;
    if (workspacePath) metadata.projectPath = normalizeWorkspacePath(workspacePath);

    if (sessionName) {
      metadata.name = sessionName;
      metadata.nameSource = 'manual';
    } else if (shouldUpgradeName(metadata) && messages.some((m) => m.role === 'user')) {
      const snippet = deriveSessionName(messages, sessionId);
      if (!isPlaceholderName(snippet)) {
        metadata.name = snippet;
        metadata.nameSource = 'snippet';
      }
    }
  } else {
    const hasUser = messages.some((m) => m.role === 'user');
    const derivedName = sessionName || deriveSessionName(messages, sessionId);
    metadata = {
      sessionId,
      name: derivedName,
      nameSource: sessionName
        ? 'manual'
        : hasUser && !isPlaceholderName(derivedName)
          ? 'snippet'
          : 'placeholder',
      agentType,
      createdAt: new Date().toISOString(),
      lastActiveAt: new Date().toISOString(),
      turnCount: 1,
      messageCount: messages.length,
      ...(workspacePath && { projectPath: normalizeWorkspacePath(workspacePath) }),
    };
  }

  atomicWrite(metadataPath, JSON.stringify(metadata, null, 2));

  const turnsDir = path.join(dir, 'turns');
  ensureDir(turnsDir);

  // Snapshot mode: Code Mode (and similar callers) always send the complete
  // message array. Writing incremental turn files causes duplication on load.
  // Fix: overwrite a single turn-0000 snapshot, removing any stale turn files.
  const existingTurns = fs.existsSync(turnsDir)
    ? fs.readdirSync(turnsDir).filter((f) => /^turn-\d{4}\.json$/.test(f))
    : [];
  for (const old of existingTurns) {
    if (old !== 'turn-0000.json') {
      try { fs.unlinkSync(path.join(turnsDir, old)); } catch { /* ignore */ }
    }
  }

  const turn: DialogTurn = {
    turnId: crypto.randomUUID(),
    turnIndex: 0,
    messages,
    startTime: metadata.createdAt,
    endTime: new Date().toISOString(),
  };
  metadata.turnCount = 1;

  atomicWrite(path.join(turnsDir, 'turn-0000.json'), JSON.stringify(turn, null, 2));

  await updateIndex(sessionId, metadata);
  return metadata;
}

function deriveSessionName(messages: Message[], sessionId: string): string {
  const firstUser = messages.find((m) => m.role === 'user');
  if (firstUser?.content) {
    const trimmed = firstUser.content.trim().replace(/\s+/g, ' ');
    return trimmed.length > 20 ? `${trimmed.slice(0, 20)}…` : trimmed;
  }
  return `Session ${sessionId.slice(0, 8)}`;
}

const PLACEHOLDER_NAME_RE = /^Session [0-9a-f]{8}$/;

function isPlaceholderName(name: string | undefined): boolean {
  return !name || PLACEHOLDER_NAME_RE.test(name);
}

export function shouldUpgradeName(meta: SessionMeta): boolean {
  if (meta.nameSource === 'manual' || meta.nameSource === 'llm') return false;
  if (isPlaceholderName(meta.name)) return true;
  if (meta.nameSource === 'snippet') return true;
  if (!meta.nameSource) return true;
  return false;
}

async function removeFromIndex(sessionId: string): Promise<void> {
  await acquireIndexLock();
  try {
    ensureDir(SESSIONS_DIR);
    const indexFile = path.join(SESSIONS_DIR, 'index.json');
    if (!fs.existsSync(indexFile)) return;

    let index: SessionMeta[] = [];
    try {
      index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
    } catch {
      return;
    }

    const filtered = index.filter((s) => s.sessionId !== sessionId);
    if (filtered.length !== index.length) {
      atomicWrite(indexFile, JSON.stringify(filtered, null, 2));
    }
  } finally {
    releaseIndexLock();
  }
}

async function updateIndex(sessionId: string, metadata: SessionMeta): Promise<void> {
  await acquireIndexLock();
  try {
    ensureDir(SESSIONS_DIR);
    const indexFile = path.join(SESSIONS_DIR, 'index.json');

    let index: SessionMeta[] = [];
    try {
      index = JSON.parse(fs.readFileSync(indexFile, 'utf-8'));
    } catch {}

    const existingIdx = index.findIndex((s) => s.sessionId === sessionId);
    if (existingIdx >= 0) {
      index[existingIdx] = metadata;
    } else {
      index.push(metadata);
    }

    index.sort((a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime());
    atomicWrite(indexFile, JSON.stringify(index, null, 2));
  } finally {
    releaseIndexLock();
  }
}

export async function getSessionMetadata(sessionId: string): Promise<SessionMeta | null> {
  const metadataPath = path.join(SESSIONS_DIR, sessionId, 'metadata.json');
  if (!fs.existsSync(metadataPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as SessionMeta;
  } catch {
    return null;
  }
}

export async function updateSessionName(
  sessionId: string,
  name: string,
  source: NonNullable<SessionMeta['nameSource']>,
): Promise<SessionMeta | null> {
  const dir = path.join(SESSIONS_DIR, sessionId);
  const metadataPath = path.join(dir, 'metadata.json');
  if (!fs.existsSync(metadataPath)) return null;

  const cleaned = name.trim();
  if (!cleaned) return null;

  let metadata: SessionMeta;
  try {
    metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as SessionMeta;
  } catch {
    return null;
  }

  if (source !== 'manual' && (metadata.nameSource === 'manual' || metadata.nameSource === 'llm')) {
    return metadata;
  }

  metadata.name = cleaned;
  metadata.nameSource = source;
  metadata.lastActiveAt = new Date().toISOString();
  atomicWrite(metadataPath, JSON.stringify(metadata, null, 2));
  await updateIndex(sessionId, metadata);
  return metadata;
}
