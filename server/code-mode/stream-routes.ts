import type { IncomingMessage, ServerResponse } from 'http';
import fs from 'fs';
import path from 'path';
import { SubprocessRunner, type NdjsonEvent } from './subprocess-runner';
import { getCliConfig, checkModelCompatibility } from './cli-registry';
import { saveCliSession, markTurnCompleted, markTurnDirty, getNativeSessionId, getLastUsedCli } from './cli-session-tracker';
import { assembleHandoffContext, writeWorkspaceContextFile } from './context-assembler';
import type { CliToolId } from '../../shared/types';

const activeRunners = new Map<string, SubprocessRunner>();

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

export function handleStreamRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  urlPath: string,
  workspacePath: string,
): boolean {
  if (urlPath === '/api/code-mode/stream' && req.method === 'POST') {
    readBody(req).then((body) => {
      try {
        const { cliId, prompt, model, workspacePath: bodyWorkspace, sessionId, previousCli } = JSON.parse(body) as {
          cliId: CliToolId;
          prompt: string;
          model?: string;
          workspacePath?: string;
          sessionId?: string;
          previousCli?: CliToolId;
        };

        const effectiveWorkspace = (bodyWorkspace || workspacePath || '').trim();
        if (!effectiveWorkspace) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'workspace path required — select a project first' }));
          return;
        }

        const resolvedWorkspace = path.resolve(effectiveWorkspace);

        if (!fs.existsSync(resolvedWorkspace) || !fs.statSync(resolvedWorkspace).isDirectory()) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Invalid workspace directory: ${resolvedWorkspace}` }));
          return;
        }

        const config = getCliConfig(cliId);
        if (!config) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: `Unknown CLI: ${cliId}` }));
          return;
        }

        // Compatibility check: warn if the CLI+model combo is known-incompatible
        if (model) {
          const compat = checkModelCompatibility(cliId, model);
          if (!compat.compatible) {
            res.writeHead(200, {
              'Content-Type': 'text/event-stream',
              'Cache-Control': 'no-cache',
              'Connection': 'keep-alive',
            });
            const warn = JSON.stringify({
              type: 'error',
              data: { message: `${compat.warning}\n\nSuggestion: ${compat.suggestion}` },
            });
            res.write(`data: ${warn}\n\n`);
            const done = JSON.stringify({ type: 'done', data: { code: 1 } });
            res.write(`data: ${done}\n\n`);
            res.end();
            return;
          }
        }

        const { mode: resumeMode, nativeSessionId } = determineResumeMode(sessionId, cliId, previousCli);

        // Assemble handoff context when switching CLIs
        let handoffPrefix: string | undefined;
        if (resumeMode === 'handoff' && sessionId) {
          const context = assembleHandoffContext(sessionId, cliId);
          if (context) {
            handoffPrefix = context.prefix;
            // Write workspace context file for CLIs that read project files
            try { writeWorkspaceContextFile(resolvedWorkspace, context); } catch { /* non-fatal */ }
          }
        }

        const ctx: CliInvocationContext = {
          cliId,
          prompt,
          model,
          workspacePath: resolvedWorkspace,
          resumeMode,
          nativeSessionId,
          handoffPrefix,
        };
        const args = buildCliArgs(ctx);
        const runner = new SubprocessRunner();
        const sessionKey = `stream-${Date.now()}`;

        // Clean up any existing runner for the same session to avoid orphans
        for (const [key, existingRunner] of activeRunners) {
          if (key.endsWith(`:${sessionId}`)) {
            existingRunner.kill();
            activeRunners.delete(key);
          }
        }
        const uniqueKey = `${sessionKey}:${sessionId}`;
        activeRunners.set(uniqueKey, runner);
        activeRunners.set(sessionKey, runner);

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Stream-Id': sessionKey,
          'X-Workspace': resolvedWorkspace,
        });

        let debounceTimer: ReturnType<typeof setTimeout> | null = null;
        let pendingText = '';

        const flushText = () => {
          if (pendingText) {
            const payload = JSON.stringify({ type: 'text_delta', data: { text: pendingText } });
            res.write(`data: ${payload}\n\n`);
            pendingText = '';
          }
          debounceTimer = null;
        };

        let sessionMetaCaptured = false;

        runner.on('event', (event: NdjsonEvent) => {
          if (event.type === 'session_meta') {
            // Capture CLI native session ID (once per invocation)
            if (!sessionMetaCaptured && sessionId) {
              const meta = event.data as { cliSessionId?: string } | undefined;
              if (meta?.cliSessionId) {
                saveCliSession(sessionId, cliId, meta.cliSessionId);
                sessionMetaCaptured = true;
              }
            }
            const payload = JSON.stringify({ type: event.type, data: event.data });
            res.write(`data: ${payload}\n\n`);
          } else if (event.type === 'text_delta') {
            const text = (event.data as { text?: string })?.text ?? '';
            pendingText += text;
            if (!debounceTimer) {
              debounceTimer = setTimeout(flushText, 50);
            }
          } else {
            if (pendingText) flushText();
            const payload = JSON.stringify({ type: event.type, data: event.data });
            res.write(`data: ${payload}\n\n`);
          }
        });

        let resumeFallbackAttempted = false;

        runner.on('exit', (code: number) => {
          if (pendingText) flushText();

          // Resume failed → fallback to fresh mode (only one retry)
          if (code !== 0 && resumeMode === 'resume' && !resumeFallbackAttempted) {
            resumeFallbackAttempted = true;
            const fallbackPayload = JSON.stringify({
              type: 'progress',
              data: { type: 'system', message: 'Resume failed, retrying in fresh mode...' },
            });
            res.write(`data: ${fallbackPayload}\n\n`);

            const freshCtx: CliInvocationContext = { ...ctx, resumeMode: 'fresh', nativeSessionId: undefined };
            const freshArgs = buildCliArgs(freshCtx);
            const freshRunner = new SubprocessRunner();
            activeRunners.set(uniqueKey, freshRunner);
            activeRunners.set(sessionKey, freshRunner);

            freshRunner.on('event', (event: NdjsonEvent) => {
              if (event.type === 'session_meta') {
                if (!sessionMetaCaptured && sessionId) {
                  const meta = event.data as { cliSessionId?: string } | undefined;
                  if (meta?.cliSessionId) {
                    saveCliSession(sessionId, cliId, meta.cliSessionId);
                    sessionMetaCaptured = true;
                  }
                }
                const p = JSON.stringify({ type: event.type, data: event.data });
                res.write(`data: ${p}\n\n`);
              } else if (event.type === 'text_delta') {
                const text = (event.data as { text?: string })?.text ?? '';
                pendingText += text;
                if (!debounceTimer) debounceTimer = setTimeout(flushText, 50);
              } else {
                if (pendingText) flushText();
                const p = JSON.stringify({ type: event.type, data: event.data });
                res.write(`data: ${p}\n\n`);
              }
            });
            freshRunner.on('exit', (freshCode: number) => {
              if (pendingText) flushText();
              if (sessionId && freshCode === 0) markTurnCompleted(sessionId, cliId);
              const done = JSON.stringify({ type: 'done', data: { code: freshCode } });
              res.write(`data: ${done}\n\n`);
              res.end();
              activeRunners.delete(uniqueKey);
              activeRunners.delete(sessionKey);
            });
            freshRunner.start(config.binaryName, freshArgs, resolvedWorkspace);
            return;
          }

          // Mark turn completed on clean exit
          if (sessionId && code === 0) {
            markTurnCompleted(sessionId, cliId);
          }
          const done = JSON.stringify({ type: 'done', data: { code } });
          res.write(`data: ${done}\n\n`);
          res.end();
          activeRunners.delete(uniqueKey);
          activeRunners.delete(sessionKey);
        });

        req.on('close', () => {
          if (debounceTimer) clearTimeout(debounceTimer);
          // Mark session dirty on abort (unsafe to resume)
          if (sessionId) {
            markTurnDirty(sessionId, cliId);
          }
          runner.kill();
          activeRunners.delete(uniqueKey);
          activeRunners.delete(sessionKey);
        });

        // Always record CLI usage so getLastUsedCli works even if session_meta never arrives
        if (sessionId) {
          saveCliSession(sessionId, cliId, `__janus_${Date.now()}`);
        }

        runner.start(config.binaryName, args, resolvedWorkspace);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    }).catch(() => {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
    });
    return true;
  }

  if (urlPath === '/api/code-mode/stream/cancel' && req.method === 'POST') {
    readBody(req).then((body) => {
      try {
        const { streamId } = JSON.parse(body) as { streamId: string };
        const runner = activeRunners.get(streamId);
        if (runner) {
          runner.kill();
          activeRunners.delete(streamId);
          // Also clean up any session-specific entry keyed by streamId:sessionId
          for (const key of activeRunners.keys()) {
            if (key.startsWith(streamId + ':')) activeRunners.delete(key);
          }
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON body' }));
      }
    }).catch(() => {
      res.writeHead(400);
      res.end();
    });
    return true;
  }

  return false;
}

export type ResumeMode = 'fresh' | 'resume' | 'handoff';

export interface CliInvocationContext {
  cliId: CliToolId;
  prompt: string;
  model?: string;
  workspacePath: string;
  resumeMode: ResumeMode;
  nativeSessionId?: string;
  handoffPrefix?: string;
}

function determineResumeMode(
  sessionId: string | undefined,
  cliId: CliToolId,
  previousCli?: CliToolId,
): { mode: ResumeMode; nativeSessionId?: string } {
  if (!sessionId) return { mode: 'fresh' };

  // Prefer tracker; fall back to frontend-provided previousCli
  const lastCli = getLastUsedCli(sessionId) ?? previousCli;
  if (!lastCli) return { mode: 'fresh' };

  // Same CLI as last time → try native resume
  if (lastCli === cliId) {
    const tracked = getNativeSessionId(sessionId, cliId);
    if (
      tracked
      && tracked.nativeId
      && !tracked.nativeId.startsWith('__janus_')
      && tracked.lastTurnCompleted
    ) {
      return { mode: 'resume', nativeSessionId: tracked.nativeId };
    }
    return { mode: 'fresh' };
  }

  // Different CLI → handoff needed
  return { mode: 'handoff' };
}

function buildCliArgs(ctx: CliInvocationContext): string[] {
  const { cliId, prompt, model, workspacePath, resumeMode, nativeSessionId, handoffPrefix } = ctx;

  const effectivePrompt = handoffPrefix
    ? `${handoffPrefix}\n\n---\n\n${prompt}`
    : prompt;

  switch (cliId) {
    case 'claudecode': {
      const base = [
        '-p', effectivePrompt,
        '--output-format', 'stream-json',
        '--verbose',
        '--permission-mode', 'bypassPermissions',
        '--add-dir', workspacePath,
        ...(model ? ['--model', model] : []),
      ];
      if (resumeMode === 'resume' && nativeSessionId) {
        base.push('--resume', nativeSessionId);
      }
      return base;
    }
    case 'codex': {
      if (resumeMode === 'resume' && nativeSessionId) {
        return [
          'resume',
          '--thread-id', nativeSessionId,
          '-C', workspacePath,
          effectivePrompt,
          '--json',
          '--skip-git-repo-check',
          '-s', 'workspace-write',
          ...(model ? ['--model', model] : []),
        ];
      }
      return [
        'exec',
        '-C', workspacePath,
        effectivePrompt,
        '--json',
        '--skip-git-repo-check',
        '-s', 'workspace-write',
        ...(model ? ['--model', model] : []),
      ];
    }
    case 'opencode': {
      const base = [
        'run', effectivePrompt,
        '--dir', workspacePath,
        '--format', 'json',
        '--pure',
        ...(model ? ['--model', model] : []),
      ];
      if (resumeMode === 'resume' && nativeSessionId) {
        base.push('--session', nativeSessionId);
      }
      return base;
    }
    default:
      return [effectivePrompt];
  }
}

