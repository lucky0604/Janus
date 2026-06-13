import type { IncomingMessage, ServerResponse } from 'http';
import type { Message, SessionListScope } from '../../shared/types';
import {
  createEmptySession,
  deleteSession,
  loadSession,
  listSessions,
  upsertSession,
} from '../persistence/session-store';
import { readBodyRaw } from '../utils/read-body';

const UUID_V4_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function extractSessionId(pathname: string): string {
  const segment = pathname.slice('/sessions/'.length).split('/')[0] ?? '';
  if (!segment || segment.length > 64 || !UUID_V4_RE.test(segment)) return '';
  return segment;
}

export async function handleSessionRoutes(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const method = req.method;
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const pathname = url.pathname;

  try {
    if (method === 'GET' && pathname === '/sessions') {
      const workspacePath = url.searchParams.get('workspace') || undefined;
      const scopeParam = url.searchParams.get('scope');
      const scope =
        scopeParam === 'work' || scopeParam === 'code-mode'
          ? (scopeParam as SessionListScope)
          : undefined;
      const sessions = await listSessions({ workspacePath, scope });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ sessions }));
      return;
    }

    if (method === 'POST' && pathname === '/sessions') {
      const raw = await readBodyRaw(req);
      const body = JSON.parse(raw) as {
        projectPath?: string;
        name?: string;
        agentType?: string;
        sessionId?: string;
      };

      const sessionId =
        body.sessionId && UUID_V4_RE.test(body.sessionId)
          ? body.sessionId
          : crypto.randomUUID();
      const agentType = body.agentType || 'code-mode';

      const metadata = await createEmptySession(
        sessionId,
        agentType,
        body.projectPath,
        body.name,
      );

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session: metadata }));
      return;
    }

    if (method === 'PUT' && pathname.endsWith('/save') && pathname.startsWith('/sessions/')) {
      const sessionId = extractSessionId(pathname.replace(/\/save$/, ''));
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid session ID' }));
        return;
      }

      const raw = await readBodyRaw(req);
      const body = JSON.parse(raw) as {
        messages?: Message[];
        projectPath?: string;
        agentType?: string;
        name?: string;
      };

      if (!Array.isArray(body.messages)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'messages array required' }));
        return;
      }

      const metadata = await upsertSession(
        sessionId,
        body.messages,
        body.agentType || 'code-mode',
        body.projectPath,
        body.name,
      );

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ session: metadata }));
      return;
    }

    if (method === 'POST' && pathname.endsWith('/load') && pathname.startsWith('/sessions/')) {
      const sessionId = extractSessionId(pathname.replace(/\/load$/, ''));
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing sessionId' }));
        return;
      }

      const session = await loadSession(sessionId);
      if (!session) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messages: session.messages, metadata: session.metadata }));
      return;
    }

    if (method === 'DELETE' && pathname.startsWith('/sessions/')) {
      const sessionId = extractSessionId(pathname);
      if (!sessionId) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing sessionId' }));
        return;
      }

      await deleteSession(sessionId);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: message }));
  }
}
