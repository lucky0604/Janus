import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import type { IncomingMessage, ServerResponse } from 'http';
import type { Message } from '../shared/types';
import { handleChatStream, handleGetMessages } from './routes/chat';
import { agentRegistry } from './agents/registry';
import Database from 'better-sqlite3';

// Register all tools (side-effect imports)
import './tools/read-file';
import './tools/list-dir-tree';
import './tools/search-content';
import './tools/write-file';
import './tools/shell-exec';
import './tools/git-ops';
import './tools/web-search';
import './tools/web-fetch';
import './tools/evolve';

// Register Work Mode agent
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workModePromptPath = path.resolve(__dirname, 'agents/prompts/work-mode.md');
let workModePrompt = '';
try {
  workModePrompt = fs.readFileSync(workModePromptPath, 'utf-8').trim();
} catch {
  // Will fall back to DEFAULT_SYSTEM_PROMPT in agent-loop
}

agentRegistry.register({
  id: 'work',
  name: 'Work Mode',
  description: 'Daily productivity assistant — search the web, read pages, manage files, run shell commands',
  systemPrompt: workModePrompt,
  tools: [
    'web_search', 'web_fetch',
    'read_file', 'write_file', 'list_dir_tree', 'search_content',
    'shell_exec', 'git_ops',
  ],
  capabilities: [
    { category: 'docs', level: 4 },
    { category: 'analysis', level: 3 },
    { category: 'file_ops', level: 5 },
    { category: 'ops', level: 3 },
  ],
  iconKey: 'briefcase',
  status: 'active',
});

// ---- Shared API route handler (used by both prod server and Vite dev) ----

function handleApiRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return Promise.resolve();
  }

  if (req.method === 'POST' && pathname === '/chat/stream') {
    return handleStreamRequest(req, res);
  }

  if (req.method === 'GET' && pathname === '/chat/messages') {
    return handleMessagesRequest(req, res);
  }

  if (req.method === 'GET' && pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', uptime: process.uptime() }));
    return Promise.resolve();
  }

  if (req.method === 'GET' && pathname === '/memory/status') {
    return handleMemoryStatus(req, res);
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
  return Promise.resolve();
}

// ---- Stream handler ----

function handleMemoryStatus(_req: IncomingMessage, res: ServerResponse): Promise<void> {
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
        // DB might be locked or corrupt — log for diagnosis
        console.error('[Janus memory] memory/status DB read failed:', err instanceof Error ? err.message : err);
      } finally {
        // Always close the DB handle to prevent resource leaks
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

async function handleStreamRequest(req: IncomingMessage, res: ServerResponse) {
  const apiKey = (req.headers['x-api-key'] as string) || process.env.OPENAI_API_KEY;

  if (!apiKey) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'missing_api_key' }));
    return;
  }

  const body = await readBody(req);
  const messages = (body.messages as Message[]) || [];
  if (!Array.isArray(messages)) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'messages array required' }));
    return;
  }

  const workspacePath = (body.workspacePath as string) || '';
  const sessionId = (body.sessionId as string) || crypto.randomUUID();
  const baseUrl = (typeof body.baseUrl === 'string' && body.baseUrl.trim()) || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const modelName = (typeof body.modelName === 'string' && body.modelName.trim()) || process.env.OPENAI_MODEL || 'gpt-4o';
  const agentId = (body.agentId as string) || 'work';

  const abortController = new AbortController();
  req.on('close', () => abortController.abort());

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    const stream = await handleChatStream(
      { messages: messages as Message[], workspacePath, sessionId, apiKey, baseUrl, modelName, agentId },
      abortController.signal
    );

    const reader = stream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  } catch (err) {
    const encoder = new TextEncoder();
    res.write(
      encoder.encode(
        `data: ${JSON.stringify({ type: 'error', data: { message: err instanceof Error ? err.message : 'Stream error' } })}\n\n`
      )
    );
  } finally {
    res.write('data: [DONE]\n\n');
    res.end();
  }
}

async function handleMessagesRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId') || 'default';

  const result = await handleGetMessages(sessionId);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}

function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const MAX_BODY = 1024 * 1024; // 1MB
  return new Promise((resolve) => {
    let data = '';
    let size = 0;
    req.on('data', (chunk: Buffer | string) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        req.destroy();
        resolve({ error: 'Request body too large' });
        return;
      }
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
    req.on('error', () => resolve({}));
  });
}

// ---- Server factory: used by both standalone prod and Electron ----

export interface JanusServer {
  server: http.Server;
  port: number;
  close: () => Promise<void>;
}

export function createJanusServer(distDir?: string, port?: number): Promise<JanusServer> {
  const DIST = distDir || path.resolve(__dirname, '..', 'dist');

  const server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    // API routes take priority
    if (url.pathname.startsWith('/api/')) {
      // Strip /api prefix for the handler
      req.url = url.pathname.slice('/api'.length) + url.search;
      handleApiRequest(req, res).catch(() => {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error' }));
      });
      return;
    }

    // Static file serving
    let filePath = path.join(DIST, url.pathname === '/' ? 'index.html' : url.pathname);

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath);
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.svg': 'image/svg+xml',
        '.json': 'application/json',
        '.png': 'image/png',
        '.ico': 'image/x-icon',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
      return;
    }

    // SPA fallback
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(path.join(DIST, 'index.html')).pipe(res);
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);

    // port=0 lets OS assign a random free port (good for Electron)
    server.listen(port || 0, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : (port || 3000);
      console.log(`[Janus] Server running on http://localhost:${actualPort}`);

      resolve({
        server,
        port: actualPort,
        close: () => new Promise((res, rej) => server.close((err) => err ? rej(err) : res())),
      });
    });
  });
}

// ---- Vite dev server integration (replaces old configureApiRoutes) ----

export function configureApiRoutes(viteServer: { middlewares: { use: (path: string, handler: (req: IncomingMessage, res: ServerResponse) => void) => void } }) {
  viteServer.middlewares.use('/api', (req: IncomingMessage, res: ServerResponse) => {
    handleApiRequest(req, res).catch(() => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal server error' }));
    });
  });
}

// ---- Direct execution entrypoint ----
// When this file is run directly (e.g. via `tsx server/prod.ts`), boot a standalone server.
// Detect via comparing the resolved module URL with process.argv[1].
const isDirectRun = (() => {
  try {
    const thisModulePath = fileURLToPath(import.meta.url);
    return process.argv[1] && path.resolve(process.argv[1]) === thisModulePath;
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  const port = parseInt(process.env.PORT || '3000', 10);
  createJanusServer(undefined, port).catch((err) => {
    console.error('[Janus] Failed to start standalone server:', err);
    process.exit(1);
  });
}
