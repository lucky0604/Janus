import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';

export function handleMemoryStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const homeDir = os.homedir();
    const memoryDir = path.join(homeDir, '.janus');
    const dbPath = path.join(memoryDir, 'memory.db');
    const memoryMdPath = path.join(memoryDir, 'MEMORY.md');

    const dbExists = fs.existsSync(dbPath);
    const mdExists = fs.existsSync(memoryMdPath);

    let memoryCount = 0;
    let preferenceCount = 0;
    let recentMemories: Array<{ id: number; content: string; category: string; source: string }> = [];

    if (dbExists) {
      let db: Database.Database | undefined;
      try {
        db = new Database(dbPath, { readonly: true });

        memoryCount = (db.prepare('SELECT COUNT(*) as c FROM memory_index').get() as { c: number }).c;
        preferenceCount = (db.prepare('SELECT COUNT(*) as c FROM preferences').get() as { c: number }).c;

        recentMemories = (db.prepare(
          'SELECT rowid as id, content, category, source FROM memory_index ORDER BY rowid DESC LIMIT 10'
        ).all() as Array<{ id: number; content: string; category: string; source: string }>);
      } catch (err) {
        console.error('[Janus memory] memory/status DB read failed:', err instanceof Error ? err.message : err);
      } finally {
        db?.close();
      }
    }

    const mdContent = mdExists ? fs.readFileSync(memoryMdPath, 'utf-8') : null;

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      memoryDir,
      dbExists,
      mdExists,
      memoryCount,
      preferenceCount,
      dbSize: dbExists ? fs.statSync(dbPath).size : 0,
      mdSize: mdExists ? fs.statSync(memoryMdPath).size : 0,
      recentMemories,
      mdPreview: mdContent ? mdContent.slice(0, 500) : null,
    }, null, 2));
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Memory status failed' }));
  }
  return Promise.resolve();
}
