import type { AIAdapter, StreamEvent } from './adapter';
import type { Message, ToolDefinition } from '../../shared/types';
import OpenAI from 'openai';
import { upstreamFetch } from './upstream-fetch';
import { BROWSER_HEADERS } from './headers';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

export interface UpstreamErrorContext {
  baseUrl?: string;
  model: string;
  status?: number;
  code?: string;
  cause?: unknown;
  /** Chunks successfully received before the stream broke. 0 = pre-first-byte failure. */
  chunksReceived?: number;
  /** Approximate bytes of text/tool-call deltas received. */
  bytesReceived?: number;
  /** Milliseconds from request start to error. */
  elapsedMs?: number;
  /** How many retries were already attempted at error time. */
  attempt?: number;
  /** Drained Node.js error cause chain (code/errno/syscall) for premature-close diagnosis. */
  causeChain?: string;
}

export class UpstreamStreamError extends Error {
  readonly baseUrl?: string;
  readonly model: string;
  readonly status?: number;
  readonly code?: string;
  readonly cause?: unknown;
  readonly chunksReceived?: number;
  readonly bytesReceived?: number;
  readonly elapsedMs?: number;
  readonly attempt?: number;
  readonly causeChain?: string;

  constructor(message: string, ctx: UpstreamErrorContext) {
    super(message);
    this.name = 'UpstreamStreamError';
    this.baseUrl = ctx.baseUrl;
    this.model = ctx.model;
    this.status = ctx.status;
    this.code = ctx.code;
    this.cause = ctx.cause;
    this.chunksReceived = ctx.chunksReceived;
    this.bytesReceived = ctx.bytesReceived;
    this.elapsedMs = ctx.elapsedMs;
    this.attempt = ctx.attempt;
    this.causeChain = ctx.causeChain;
  }
}

/**
 * Walk the Node.js error.cause chain (Node 16.9+ standard) and serialize each
 * link's name/code/errno/syscall/message. Critical for distinguishing
 * ERR_STREAM_PREMATURE_CLOSE wrappers from the real underlying network errno
 * (ECONNRESET, EPIPE, ETIMEDOUT, UND_ERR_SOCKET, etc.).
 */
function summarizeCauseChain(err: unknown, maxDepth = 5): string {
  const links: string[] = [];
  let current: unknown = err;
  for (let i = 0; i < maxDepth && current; i++) {
    if (current instanceof Error) {
      const e = current as NodeJS.ErrnoException & {
        cause?: unknown;
        syscall?: string;
        errno?: number;
      };
      const parts: string[] = [`${e.name || 'Error'}`];
      if (e.code) parts.push(`code=${e.code}`);
      if (typeof e.errno === 'number') parts.push(`errno=${e.errno}`);
      if (e.syscall) parts.push(`syscall=${e.syscall}`);
      if (e.message) parts.push(`msg="${e.message.slice(0, 120)}"`);
      links.push(parts.join(' '));
      current = e.cause;
    } else {
      links.push(`(non-Error: ${String(current).slice(0, 80)})`);
      break;
    }
  }
  return links.join(' -> ');
}

/**
 * Strip credentials (user:pass@) from a URL so it's safe to log or send to the client.
 * Falls back to the raw string if parsing fails — never re-emits credentials on error.
 */
export function sanitizeBaseUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.username || parsed.password) {
      parsed.username = '';
      parsed.password = '';
      return parsed.toString();
    }
    return url;
  } catch {
    return url.replace(/\/\/[^@/]+@/, '//');
  }
}

/**
 * Build the OpenAI-shaped message array from Janus internal Messages.
 *
 * The Janus UI stores many UI-only messages (event cards with empty content,
 * pending tool placeholders, [Stopped] assistant stubs from interrupted streams).
 * Sending these to the upstream provider causes strict gateways (e.g. thor WAF)
 * to RST the connection before any response header — manifesting as
 * ERR_STREAM_PREMATURE_CLOSE with chunks=0, bytes=0, elapsed≈1s.
 *
 * Rules enforced (OpenAI Chat Completions spec):
 *   - user/system: drop if content is empty after trim
 *   - assistant:  keep only if content non-empty OR has tool_calls
 *   - tool:       keep only if has toolCallId AND non-empty content
 *   - drop trailing empty assistant entirely (the streaming placeholder)
 */
type OpenAIMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;

export function sanitizeMessagesForUpstream(messages: Message[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [];
  for (const m of messages) {
    const content = (m.content || '').trim();
    const hasToolCalls = Array.isArray(m.toolCalls) && m.toolCalls.length > 0;

    if (m.role === 'tool') {
      if (!m.toolCallId || !content) continue;
      out.push({
        role: 'tool',
        content: m.content,
        tool_call_id: m.toolCallId,
      });
      continue;
    }

    if (m.role === 'assistant') {
      if (!content && !hasToolCalls) continue;
      out.push({
        role: 'assistant',
        content: m.content,
        ...(hasToolCalls
          ? {
              tool_calls: m.toolCalls!.map((tc) => ({
                id: tc.id,
                type: 'function' as const,
                function: {
                  name: tc.name,
                  arguments: JSON.stringify(tc.arguments),
                },
              })),
            }
          : {}),
      });
      continue;
    }

    if (m.role === 'system' || m.role === 'user') {
      if (!content) continue;
      out.push({ role: m.role, content: m.content });
      continue;
    }
  }
  return out;
}

export class OpenAIAdapter implements AIAdapter {
  private client: OpenAI;
  private baseUrl: string | undefined;

  constructor(apiKey: string, baseUrl?: string) {
    const trimmedBase = baseUrl?.trim() || undefined;
    this.baseUrl = trimmedBase || process.env.OPENAI_BASE_URL;
    this.client = new OpenAI({
      apiKey,
      baseURL: this.baseUrl,
      timeout: 600_000,
      maxRetries: 2,
      defaultHeaders: BROWSER_HEADERS,
      // upstreamFetch: shared ALPN-negotiated dispatcher — h2 where supported
      // (thor 网关强依赖), transparent h1 fallback elsewhere. One injection
      // point for every provider — swap baseUrl in Settings and it Just Works.
      fetch: upstreamFetch,
    });
  }

  async *streamChat(
    messages: Message[],
    tools: Pick<ToolDefinition, 'name' | 'description' | 'parameters'>[],
    modelName?: string,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const effectiveModel = modelName || process.env.OPENAI_MODEL || 'gpt-4o';
    const sanitizedBase = sanitizeBaseUrl(this.baseUrl);
    const MAX_RETRIES = 2;
    let attempt = 0;

    // OpenAI Chat Completions API: any non-null finish_reason means the model
    // produced a complete logical response. Subsequent transport-layer errors
    // (e.g. undici ERR_STREAM_PREMATURE_CLOSE when the upstream closes TCP
    // immediately after `data: [DONE]`) should NOT surface as truncation —
    // the answer is already complete.
    const COMPLETE_FINISH_REASONS = new Set([
      'stop',
      'length',
      'tool_calls',
      'content_filter',
      'function_call',
    ]);

    while (true) {
      const startMs = Date.now();
      let chunksReceived = 0;
      let bytesReceived = 0;
      let lastFinishReason: string | null = null;
      const sanitizedMsgs = sanitizeMessagesForUpstream(messages);
      const toolDefs = tools.length > 0 ? tools.map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      })) : undefined;
      const bodyJson = JSON.stringify({ model: effectiveModel, messages: sanitizedMsgs, tools: toolDefs, stream: true });
      console.warn('[openai-adapter] request prepared:', {
        model: effectiveModel,
        baseUrl: sanitizedBase,
        msgCount: sanitizedMsgs.length,
        roles: sanitizedMsgs.map((m) => m.role).join(','),
        toolCount: toolDefs?.length ?? 0,
        toolNames: toolDefs?.map((t) => t.function.name).join(',') ?? '',
        bodyBytes: bodyJson.length,
        attempt,
      });
      try {
        const stream = await this.client.chat.completions.create(
          {
            model: effectiveModel,
            messages: sanitizedMsgs,
            tools: toolDefs,
            stream: true,
          },
          { signal }
        );

        const accumulatedToolCalls: Map<
          number,
          { id: string; name: string; arguments: string }
        > = new Map();

        for await (const chunk of stream) {
          chunksReceived++;
          const delta = chunk.choices[0]?.delta;
          const finishReason = chunk.choices[0]?.finish_reason;
          if (finishReason) lastFinishReason = finishReason;

          if (delta?.content) {
            bytesReceived += delta.content.length;
            yield {
              type: 'text_delta',
              data: { text: delta.content },
            };
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls as OpenAI.Chat.Completions.ChatCompletionChunk.Choice.Delta.ToolCall[]) {
              const idx = tc.index;
              if (!accumulatedToolCalls.has(idx)) {
                accumulatedToolCalls.set(idx, {
                  id: tc.id || crypto.randomUUID(),
                  name: tc.function?.name || '',
                  arguments: '',
                });
              }
              const existing = accumulatedToolCalls.get(idx)!;
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) {
                existing.arguments += tc.function.arguments;
                bytesReceived += tc.function.arguments.length;
              }
            }
          }

          if (chunk.choices[0]?.finish_reason === 'tool_calls') {
            for (const [, tc] of accumulatedToolCalls) {
              yield {
                type: 'tool_call',
                data: {
                  id: tc.id,
                  name: tc.name,
                  arguments: tc.arguments,
                },
              };
            }
            accumulatedToolCalls.clear();
          }
        }
        return;
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          throw err;
        }
        if (err instanceof Error && err.name === 'AbortError') {
          throw err;
        }

        if (err instanceof OpenAI.APIError) {
          const ctxMsg = `[${sanitizedBase || 'default'}] ${err.message}`;
          if (err.status === 401) throw new AuthError(ctxMsg);
          if (err.status === 429) throw new RateLimitError(ctxMsg);
          throw new UpstreamStreamError(
            `Provider HTTP ${err.status ?? '?'}: ${err.message}`,
            {
              baseUrl: sanitizedBase,
              model: effectiveModel,
              status: err.status,
              code: err.code ?? undefined,
              cause: err,
              chunksReceived,
              bytesReceived,
              elapsedMs: Date.now() - startMs,
              attempt,
              causeChain: summarizeCauseChain(err),
            },
          );
        }

        const cause = err instanceof Error ? err : new Error(String(err));
        const code = (cause as NodeJS.ErrnoException).code;
        const causeChain = summarizeCauseChain(err);
        const elapsedMs = Date.now() - startMs;

        const isPrematureClose =
          code === 'ERR_STREAM_PREMATURE_CLOSE' ||
          /premature close/i.test(cause.message) ||
          /ERR_STREAM_PREMATURE_CLOSE/.test(causeChain);
        const canRetry = isPrematureClose && chunksReceived === 0 && attempt < MAX_RETRIES;
        // Logically-complete stream: upstream already sent a terminal finish_reason
        // (stop/length/tool_calls/content_filter/function_call). A subsequent transport
        // close (TCP FIN right after `data: [DONE]`, manifesting as undici
        // ERR_STREAM_PREMATURE_CLOSE) is a Node fetch quirk, not a real failure — the
        // answer is complete. Silently return; emit only a single debug line.
        const isLogicallyComplete =
          isPrematureClose &&
          lastFinishReason !== null &&
          COMPLETE_FINISH_REASONS.has(lastFinishReason);
        // Genuine mid-stream truncation: content was emitted but no terminal
        // finish_reason ever arrived. Show the user a soft hint instead of a hard
        // error. tool_calls are intentionally discarded — without a finish_reason
        // they may contain half-written JSON whose execution would be unsafe.
        const isGracefulTruncation =
          isPrematureClose &&
          chunksReceived > 0 &&
          !canRetry &&
          !isLogicallyComplete;

        if (isLogicallyComplete) {
          console.debug('[openai-adapter] transport closed post-completion (benign):', {
            chunksReceived,
            bytesReceived,
            elapsedMs,
            finishReason: lastFinishReason,
            model: effectiveModel,
          });
          return;
        }

        if (isGracefulTruncation) {
          console.warn('[openai-adapter] stream truncated by server (graceful):', {
            attempt,
            chunksReceived,
            bytesReceived,
            elapsedMs,
            code,
            causeChain,
            baseUrl: sanitizedBase,
            model: effectiveModel,
          });
          yield {
            type: 'text_delta',
            data: { text: '\n\n*[⚠ 服务器提前结束了响应流，以上回答可能不完整]*' },
          };
          return;
        }

        console.error('[openai-adapter] stream broken:', {
          attempt,
          willRetry: canRetry,
          chunksReceived,
          bytesReceived,
          elapsedMs,
          code,
          causeChain,
          baseUrl: sanitizedBase,
          model: effectiveModel,
        });

        if (canRetry) {
          const backoffMs = 250 * Math.pow(2, attempt);
          attempt++;
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
          continue;
        }

        throw new UpstreamStreamError(
          `Upstream stream broken: ${cause.message} (model=${effectiveModel}, baseUrl=${sanitizedBase || 'default'}, chunks=${chunksReceived}, bytes=${bytesReceived}, elapsed=${elapsedMs}ms, attempt=${attempt})`,
          {
            baseUrl: sanitizedBase,
            model: effectiveModel,
            status: undefined,
            code,
            cause: err,
            chunksReceived,
            bytesReceived,
            elapsedMs,
            attempt,
            causeChain,
          },
        );
      }
    }
  }
}
