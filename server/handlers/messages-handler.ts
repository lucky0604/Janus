import type { IncomingMessage, ServerResponse } from 'http';
import { handleGetMessages } from '../routes/chat';

export async function handleMessagesRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('sessionId') || 'default';

  const result = await handleGetMessages(sessionId);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result));
}
