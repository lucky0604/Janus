import { describe, it, expect } from 'vitest';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import { handleProjects } from './projects';

function mockRequest(method: string, url: string, body?: string): IncomingMessage {
  const req = new EventEmitter() as IncomingMessage & EventEmitter;
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost' };

  if (body) {
    process.nextTick(() => {
      req.emit('data', body);
      req.emit('end');
    });
  }

  return req;
}

function mockResponse() {
  const state = { status: 0, body: '' };
  const res = {
    writeHead: (code: number) => { state.status = code; },
    end: (data?: string) => { if (data) state.body += data; },
    setHeader: () => {},
  } as unknown as import('http').ServerResponse;

  return { res, state };
}

describe('handleProjects routes', () => {
  it('matches GET /projects after /api prefix strip', async () => {
    const { res, state } = mockResponse();
    await handleProjects(mockRequest('GET', '/projects'), res);
    expect(state.status).toBe(200);
    expect(JSON.parse(state.body)).toHaveProperty('projects');
  });

  it('returns 404 for legacy /api/projects path', async () => {
    const { res, state } = mockResponse();
    await handleProjects(mockRequest('GET', '/api/projects'), res);
    expect(state.status).toBe(404);
    expect(JSON.parse(state.body).error).toBe('Not found');
  });
});
