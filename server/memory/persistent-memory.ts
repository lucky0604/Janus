/**
 * Persistent Memory — SQLite + MEMORY.md
 *
 * Layer 1 (常驻层): MEMORY.md index loaded at session start
 * Layer 3 (凝练层): Background consolidation updates MEMORY.md + SQLite
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import type {
  PreferenceRow,
  ProjectKnowledgeRow,
  MemoryIndexEntry,
  MemoryCategory,
  MemorySource,
  MemoryContext,
} from './memory-types';

const JANUS_DIR = path.join(os.homedir(), '.janus');
const MEMORY_DB = 'memory.db';
const MEMORY_MD = 'MEMORY.md';
const MEMORY_DIR = 'memory';
const MAX_MEMORY_MD_SIZE = 25_000; // 25KB hard limit
const MAX_MEMORY_MD_LINES = 200;

// ESM-safe __dirname (Node ESM has no global __dirname)
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---- Singleton DB ----

let _db: Database.Database | null = null;

function getDb(dbPath?: string): Database.Database {
  if (_db && !dbPath) return _db;

  const resolvedPath = dbPath || path.join(JANUS_DIR, MEMORY_DB);
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Initialize schema
  const schemaPath = path.join(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
  }

  if (!dbPath) _db = db;
  return db;
}

// ---- Initialization ----

export function initMemoryContext(workspacePath: string, sessionId: string): MemoryContext {
  const projectPath = workspacePath;
  const dbPath = path.join(JANUS_DIR, MEMORY_DB);

  // Ensure ~/.janus/ and ~/.janus/memory/ exist
  if (!fs.existsSync(JANUS_DIR)) {
    fs.mkdirSync(JANUS_DIR, { recursive: true });
  }
  const memoryDir = path.join(JANUS_DIR, MEMORY_DIR);
  if (!fs.existsSync(memoryDir)) {
    fs.mkdirSync(memoryDir, { recursive: true });
  }

  // Ensure MEMORY.md exists
  const persistentPath = path.join(JANUS_DIR, MEMORY_MD);
  if (!fs.existsSync(persistentPath)) {
    fs.writeFileSync(persistentPath, `# Janus Memory Index\n\n> Auto-generated memory index. Do not edit manually unless you know what you're doing.\n\n## Preferences\n\n## Facts\n\n## Patterns\n\n## Skills\n`, 'utf-8');
  }

  // Initialize DB
  getDb(dbPath);

  return {
    persistentPath,
    memoryDir,
    dbPath,
    projectPath,
    sessionId,
    alreadySurfaced: new Set(),
  };
}

// ---- Layer 1: 常驻层 (Session-Start) ----

/**
 * Load the resident memory layer: MEMORY.md index + today/yesterday daily logs.
 * Called once at session start, injected into system prompt.
 */
export function loadResidentMemory(ctx: MemoryContext): string {
  const parts: string[] = [];

  // 1. MEMORY.md index (truncated to 25KB / 200 lines)
  const memoryMd = loadMemoryMd(ctx.persistentPath);
  if (memoryMd) {
    parts.push('## Memory Index\n' + memoryMd);
  }

  // 2. Today's daily log
  const today = new Date().toISOString().slice(0, 10);
  const todayLog = loadDailyLog(ctx.memoryDir, today);
  if (todayLog) {
    parts.push(`## Today's Log (${today})\n` + todayLog);
  }

  // 3. Yesterday's daily log
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const yesterdayLog = loadDailyLog(ctx.memoryDir, yesterday);
  if (yesterdayLog) {
    parts.push(`## Yesterday's Log (${yesterday})\n` + yesterdayLog);
  }

  return parts.length > 0 ? parts.join('\n\n') : '';
}

function loadMemoryMd(persistentPath: string): string {
  try {
    let content = fs.readFileSync(persistentPath, 'utf-8');
    const lines = content.split('\n');
    if (lines.length > MAX_MEMORY_MD_LINES) {
      content = lines.slice(0, MAX_MEMORY_MD_LINES).join('\n') + '\n... [truncated]';
    }
    if (Buffer.byteLength(content, 'utf-8') > MAX_MEMORY_MD_SIZE) {
      content = content.slice(0, MAX_MEMORY_MD_SIZE) + '\n... [truncated]';
    }
    return content;
  } catch {
    return '';
  }
}

function loadDailyLog(memoryDir: string, date: string): string {
  const logPath = path.join(memoryDir, `${date}.md`);
  try {
    return fs.readFileSync(logPath, 'utf-8');
  } catch {
    return '';
  }
}

// ---- Preferences ----

export function getPreference(key: string, dbPath?: string): string | null {
  const db = getDb(dbPath);
  const row = db.prepare('SELECT value FROM preferences WHERE key = ?').get(key) as PreferenceRow | undefined;
  return row?.value ?? null;
}

export function setPreference(key: string, value: string, category = 'general', confidence = 0.5, dbPath?: string): void {
  const db = getDb(dbPath);
  db.prepare(
    `INSERT INTO preferences (key, value, category, confidence, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category,
       confidence = excluded.confidence, updated_at = CURRENT_TIMESTAMP`
  ).run(key, value, category, confidence);
}

export function getAllPreferences(dbPath?: string): PreferenceRow[] {
  const db = getDb(dbPath);
  return db.prepare('SELECT * FROM preferences ORDER BY category, key').all() as PreferenceRow[];
}

// ---- Project Knowledge ----

export function getProjectKnowledge(projectPath: string, key: string, dbPath?: string): string | null {
  const db = getDb(dbPath);
  const row = db.prepare(
    'SELECT value FROM project_knowledge WHERE project_path = ? AND key = ?'
  ).get(projectPath, key) as ProjectKnowledgeRow | undefined;
  return row?.value ?? null;
}

export function setProjectKnowledge(projectPath: string, key: string, value: string, category = 'general', dbPath?: string): void {
  const db = getDb(dbPath);
  db.prepare(
    `INSERT INTO project_knowledge (project_path, key, value, category)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(project_path, key) DO UPDATE SET value = excluded.value, category = excluded.category`
  ).run(projectPath, key, value, category);
}

// ---- Memory Index (FTS5) ----

export function indexMemory(
  content: string,
  source: MemorySource,
  projectPath: string,
  keywords: string,
  category: MemoryCategory,
  dbPath?: string
): number {
  const db = getDb(dbPath);
  const result = db.prepare(
    `INSERT INTO memory_index (content, source, project_path, keywords, category, created_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))`
  ).run(content, source, projectPath, keywords, category);
  return Number(result.lastInsertRowid);
}

export function searchMemoryIndex(query: string, projectPath: string, limit = 10, dbPath?: string): MemoryIndexEntry[] {
  const db = getDb(dbPath);
  // FTS5 full-text search with BM25 ranking
  const results = db.prepare(
    `SELECT rowid, content, source, project_path, keywords, category, created_at
     FROM memory_index
     WHERE memory_index MATCH ?
     AND project_path = ?
     ORDER BY bm25(memory_index)
     LIMIT ?`
  ).all(query, projectPath, limit) as MemoryIndexEntry[];
  return results;
}

// ---- Conversation Summaries ----

export function saveConversationSummary(
  sessionId: string,
  projectPath: string,
  summary: string,
  keyDecisions: string[],
  toolsUsed: string[],
  dbPath?: string
): void {
  const db = getDb(dbPath);
  db.prepare(
    `INSERT INTO conversation_summaries (session_id, project_path, summary, key_decisions, tools_used)
     VALUES (?, ?, ?, ?, ?)`
  ).run(sessionId, projectPath, summary, JSON.stringify(keyDecisions), JSON.stringify(toolsUsed));
}

// ---- MEMORY.md Write ----

/**
 * Append content to MEMORY.md (used by consolidation).
 * Respects the size limit.
 */
export function appendToMemoryMd(persistentPath: string, section: string, content: string): void {
  try {
    let existing = fs.readFileSync(persistentPath, 'utf-8');

    // Find the section header
    const sectionHeader = `## ${section}`;
    const sectionIdx = existing.indexOf(sectionHeader);

    if (sectionIdx !== -1) {
      // Find the next section header
      const afterSection = sectionIdx + sectionHeader.length;
      const nextSectionIdx = existing.indexOf('\n## ', afterSection);

      const insertPoint = nextSectionIdx !== -1 ? nextSectionIdx : existing.length;
      const before = existing.slice(0, insertPoint);
      const after = existing.slice(insertPoint);

      existing = before + '\n' + content + '\n' + after;
    } else {
      // Section doesn't exist, append at end
      existing += `\n${sectionHeader}\n\n${content}\n`;
    }

    // Enforce size limit
    const lines = existing.split('\n');
    if (lines.length > MAX_MEMORY_MD_LINES) {
      // Remove oldest entries (skip header lines)
      const headerEnd = existing.indexOf('\n## Preferences');
      if (headerEnd !== -1) {
        const header = existing.slice(0, headerEnd);
        const body = existing.slice(headerEnd);
        const bodyLines = body.split('\n');
        const trimmed = bodyLines.slice(bodyLines.length - MAX_MEMORY_MD_LINES).join('\n');
        existing = header + trimmed;
      }
    }

    atomicWrite(persistentPath, existing);
  } catch (err) {
    // Fail silently — memory writes should not crash the agent loop.
    // But log to stderr so silent data loss is at least diagnosable.
    console.error('[Janus memory] appendToMemoryMd failed:', err instanceof Error ? err.message : err);
  }
}

// ---- Daily Log Write ----

/**
 * Append an observation to today's daily log.
 */
export function appendDailyLog(memoryDir: string, content: string): void {
  const today = new Date().toISOString().slice(0, 10);
  const logPath = path.join(memoryDir, `${today}.md`);

  let existing = '';
  if (fs.existsSync(logPath)) {
    existing = fs.readFileSync(logPath, 'utf-8');
  } else {
    existing = `# Daily Log — ${today}\n\n`;
  }

  const timestamp = new Date().toISOString().slice(11, 19);
  existing += `- [${timestamp}] ${content}\n`;

  atomicWrite(logPath, existing);
}

// ---- Recall Tracking ----

export function markRecalled(sessionId: string, memoryId: string, dbPath?: string): void {
  const db = getDb(dbPath);
  db.prepare(
    `INSERT OR IGNORE INTO recall_tracking (session_id, memory_id, recalled_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)`
  ).run(sessionId, memoryId);
}

export function isRecalled(sessionId: string, memoryId: string, dbPath?: string): boolean {
  const db = getDb(dbPath);
  const row = db.prepare(
    'SELECT 1 FROM recall_tracking WHERE session_id = ? AND memory_id = ?'
  ).get(sessionId, memoryId);
  return row !== undefined;
}

export function clearRecallTracking(sessionId: string, dbPath?: string): void {
  const db = getDb(dbPath);
  db.prepare('DELETE FROM recall_tracking WHERE session_id = ?').run(sessionId);
}

// ---- Helpers ----

function atomicWrite(filePath: string, data: string): void {
  const tmp = filePath + '.tmp.' + Date.now();
  fs.writeFileSync(tmp, data, 'utf-8');
  fs.renameSync(tmp, filePath);
}

/**
 * Close the database connection (for graceful shutdown).
 */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
