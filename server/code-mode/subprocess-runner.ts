import { spawn, type ChildProcess, type StdioOptions } from 'child_process';
import { EventEmitter } from 'events';

export interface NdjsonEvent {
  type: 'text_delta' | 'text_final' | 'tool_call' | 'tool_result' | 'progress' | 'error' | 'exit' | 'session_meta';
  data: unknown;
  raw?: string;
}

export interface SubprocessStartOptions {
  /** Default 'ignore' — Codex/Claude non-interactive exec must not read stdin. */
  stdin?: 'pipe' | 'ignore';
}

const BENIGN_STDERR = /Reading additional input from stdin/i;

/**
 * Map a parsed CLI JSON line to a normalized stream event.
 * Exported for unit tests.
 */
export function parseCliJsonEvent(obj: Record<string, unknown>): NdjsonEvent | null {
  const t = obj.type as string | undefined;

  // ── Claude Code stream-json: assistant message with content blocks
  // Marked as 'text_final' because stream-json always delivers content via
  // content_block_delta first; this event is the assembled duplicate.
  if (t === 'assistant' && typeof obj.message === 'object' && obj.message) {
    const msg = obj.message as Record<string, unknown>;
    if (msg.type === 'text' && typeof msg.text === 'string') {
      return { type: 'text_final', data: { text: msg.text } };
    }
    if (Array.isArray(msg.content)) {
      const texts = (msg.content as Record<string, unknown>[])
        .filter((c) => c.type === 'text' && typeof c.text === 'string')
        .map((c) => c.text as string);
      if (texts.length) {
        return { type: 'text_final', data: { text: texts.join('') } };
      }
    }
  }

  // ── Claude Code: final result line (duplicate of already-streamed content)
  if (t === 'result' && typeof obj.result === 'string' && obj.result.trim()) {
    return { type: 'text_final', data: { text: obj.result } };
  }

  // ── Anthropic API streaming: content_block_delta
  if (t === 'content_block_delta') {
    const delta = obj.delta as Record<string, unknown> | undefined;
    if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
      return { type: 'text_delta', data: { text: delta.text } };
    }
  }

  // ── Claude nested stream_event
  if (t === 'stream_event' && typeof obj.event === 'object' && obj.event) {
    return parseCliJsonEvent(obj.event as Record<string, unknown>);
  }

  // ── Codex JSONL: response.output_text.delta → streaming text
  if (t === 'response.output_text.delta' && typeof obj.delta === 'string') {
    return { type: 'text_delta', data: { text: obj.delta } };
  }

  // ── Codex JSONL: response.output_text.done → final text block
  if (t === 'response.output_text.done' && typeof obj.text === 'string') {
    return null; // already received via deltas
  }

  // ── Codex JSONL: item.completed with agent message or message content
  // Marked text_final because the text was likely already streamed via
  // response.output_text.delta events.
  if (t === 'item.completed' && typeof obj.item === 'object' && obj.item) {
    const item = obj.item as Record<string, unknown>;
    if (item.type === 'agent_message' && typeof item.text === 'string') {
      return { type: 'text_final', data: { text: item.text } };
    }
    if (item.type === 'message' && Array.isArray(item.content)) {
      const parts = item.content as Record<string, unknown>[];
      const texts = parts
        .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
        .map((c) => c.text as string);
      if (texts.length) {
        return { type: 'text_final', data: { text: texts.join('') } };
      }
    }
    if (item.type === 'error' && typeof item.message === 'string') {
      if (/deprecated/i.test(item.message)) {
        return { type: 'progress', data: obj };
      }
      return { type: 'error', data: { message: item.message } };
    }
  }

  // ── OpenCode JSON: {"type":"text","part":{"type":"text","text":"..."}}
  if (t === 'text' && typeof obj.part === 'object' && obj.part) {
    const part = obj.part as Record<string, unknown>;
    if (typeof part.text === 'string') {
      return { type: 'text_delta', data: { text: part.text } };
    }
  }

  // ── OpenCode JSON fallback: {"type":"assistant","content":"..."}
  if (t === 'assistant' && typeof obj.content === 'string') {
    return { type: 'text_delta', data: { text: obj.content } };
  }

  // ── Tool events (all CLIs) — only emit when name/id are identifiable
  if (t === 'tool_use' || t === 'tool_call') {
    const name = typeof obj.name === 'string' ? obj.name : undefined;
    const id = obj.id ?? obj.call_id;
    if (name && id) {
      return { type: 'tool_call', data: { id: String(id), name, raw: obj } };
    }
    return null;
  }

  if (t === 'response.function_call_arguments.done') {
    const item = obj.item as Record<string, unknown> | undefined;
    if (item?.type === 'function_call' && typeof item.name === 'string') {
      return {
        type: 'tool_call',
        data: {
          id: String(item.call_id ?? item.id ?? crypto.randomUUID()),
          name: item.name,
          raw: obj,
        },
      };
    }
    return null;
  }

  if (t === 'tool_result') {
    return { type: 'tool_result', data: obj };
  }

  if (t === 'response.output_item.done') {
    const item = obj.item as Record<string, unknown> | undefined;
    if (item?.type === 'function_call_output' || item?.type === 'tool_result') {
      return {
        type: 'tool_result',
        data: {
          id: item.call_id ?? item.id,
          raw: obj,
        },
      };
    }
    return null;
  }

  // ── OpenCode tool call: {"type":"tool_call_start","part":{"name":"...","id":"..."}}
  if (t === 'tool_call_start' && typeof obj.part === 'object' && obj.part) {
    const part = obj.part as Record<string, unknown>;
    if (typeof part.name === 'string' && part.id) {
      return {
        type: 'tool_call',
        data: { id: String(part.id), name: part.name, raw: part },
      };
    }
  }
  if (t === 'tool_call_result') {
    return { type: 'tool_result', data: obj };
  }

  // ── Codex flat format: {"type":"item.agent_message","content":"..."}
  if (t === 'item.agent_message' && typeof obj.content === 'string') {
    return { type: 'text_delta', data: { text: obj.content } };
  }

  // ── Codex newer method-based format
  const method = obj.method as string | undefined;
  if (method === 'item/agentMessage/delta') {
    const params = obj.params as Record<string, unknown> | undefined;
    if (params && typeof params.delta === 'string') {
      return { type: 'text_delta', data: { text: params.delta } };
    }
  }
  if (method === 'item/completed') {
    const params = obj.params as Record<string, unknown> | undefined;
    const item = params?.item as Record<string, unknown> | undefined;
    if (item?.type === 'agentMessage' && typeof item.text === 'string') {
      return { type: 'text_final', data: { text: item.text } };
    }
  }
  if (method === 'turn/started' || method === 'turn/completed') {
    return { type: 'progress', data: obj };
  }

  // ── Top-level error events (Codex reconnection failures, fatal stream errors)
  if (t === 'error' && typeof obj.message === 'string') {
    if (/^Reconnecting\.\.\./i.test(obj.message)) {
      return { type: 'progress', data: obj };
    }
    return { type: 'error', data: { message: obj.message } };
  }

  // ── turn.failed → surface as error
  if (t === 'turn.failed') {
    const errObj = obj.error as Record<string, unknown> | undefined;
    const msg = typeof errObj?.message === 'string' ? errObj.message : 'Turn failed';
    return { type: 'error', data: { message: msg } };
  }

  // ── Session identity extraction (thread_id, session_id)
  if (t === 'thread.started' && typeof obj.thread_id === 'string') {
    return { type: 'session_meta', data: { cliSessionId: obj.thread_id, source: 'codex' } };
  }

  // Claude Code session identity: {"type":"system","subtype":"init","session_id":"..."}
  if (t === 'system' && obj.subtype === 'init' && typeof obj.session_id === 'string') {
    return { type: 'session_meta', data: { cliSessionId: obj.session_id, source: 'claudecode' } };
  }

  // ── Progress / lifecycle events
  if (
    t === 'message_start' || t === 'message_stop' ||
    t === 'step_start' || t === 'step_finish' ||
    t === 'thread.started' || t === 'turn.started' || t === 'turn.completed' ||
    t === 'response.created' || t === 'response.completed' ||
    t === 'response.output_item.added' ||
    t === 'system'
  ) {
    return { type: 'progress', data: obj };
  }

  // ── OpenCode session identity: extract from step_start sessionID field
  if (typeof obj.sessionID === 'string' && obj.sessionID && !t) {
    // OpenCode events carry sessionID on every line; capture once via first event
    return { type: 'session_meta', data: { cliSessionId: obj.sessionID, source: 'opencode' } };
  }

  return null;
}

/**
 * Spawns a CLI subprocess and streams parsed NDJSON events.
 * Line-buffers stdout to ensure clean JSON boundary parsing.
 */
export class SubprocessRunner extends EventEmitter {
  private process: ChildProcess | null = null;
  private lineBuffer = '';
  private stderrBuffer = '';
  private _pid: number | null = null;
  private receivedText = false;

  get pid(): number | null {
    return this._pid;
  }

  get running(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Spawn a CLI command and begin streaming NDJSON events.
   */
  start(command: string, args: string[], cwd: string, options: SubprocessStartOptions = {}): void {
    if (this.process) {
      throw new Error('SubprocessRunner already has an active process');
    }

    const stdinMode = options.stdin ?? 'ignore';
    const stdio: StdioOptions = [stdinMode, 'pipe', 'pipe'];

    this.lineBuffer = '';
    this.stderrBuffer = '';
    this.receivedText = false;
    this.process = spawn(command, args, {
      cwd,
      env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
      stdio,
    });

    this._pid = this.process.pid ?? null;

    if (stdinMode === 'pipe') {
      this.process.stdin?.end();
    }

    this.process.stdout?.on('data', (chunk: Buffer) => {
      this.lineBuffer += chunk.toString();
      this.drainLines();
    });

    this.process.stderr?.on('data', (chunk: Buffer) => {
      this.stderrBuffer += chunk.toString();
    });

    this.process.on('close', (code) => {
      this.drainLines();
      const stderr = this.stderrBuffer.trim();
      const showStderrError =
        code !== 0 &&
        stderr.length > 0 &&
        !BENIGN_STDERR.test(stderr) &&
        !this.receivedText;

      if (showStderrError) {
        this.emit('event', {
          type: 'error',
          data: { message: stderr },
        } satisfies NdjsonEvent);
      }
      this.stderrBuffer = '';
      this.emit('event', {
        type: 'exit',
        data: { code },
      } satisfies NdjsonEvent);
      this.emit('exit', code);
      this.process = null;
      this._pid = null;
    });

    this.process.on('error', (err) => {
      this.emit('event', {
        type: 'error',
        data: { message: err.message },
      } satisfies NdjsonEvent);
    });
  }

  /**
   * Write to subprocess stdin (for interactive prompts).
   */
  write(data: string): void {
    this.process?.stdin?.write(data);
  }

  /**
   * Gracefully terminate the subprocess.
   */
  kill(): void {
    if (!this.process) return;
    try {
      const proc = this.process;
      proc.kill('SIGTERM');
      setTimeout(() => {
        if (proc && !proc.killed) {
          proc.kill('SIGKILL');
        }
      }, 3000);
    } catch {
      // already exited
    }
  }

  private drainLines(): void {
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        const event = parseCliJsonEvent(parsed);
        if (event) {
          if (event.type === 'text_delta') {
            this.receivedText = true;
            this.emit('event', event);
          } else if (event.type === 'text_final') {
            // Only emit finalization text if no streaming deltas were received
            // (prevents duplication when stream-json emits both deltas and summary)
            if (!this.receivedText) {
              this.receivedText = true;
              this.emit('event', { ...event, type: 'text_delta' });
            }
          } else {
            this.emit('event', event);
          }
        }
      } catch {
        if (trimmed.length > 0 && !this.isNoiseLine(trimmed)) {
          // Only treat non-JSON lines as text if we've already received
          // structured text from the CLI (avoids polluting with startup noise).
          if (this.receivedText) {
            this.emit('event', {
              type: 'text_delta',
              data: { text: trimmed },
              raw: trimmed,
            } satisfies NdjsonEvent);
          } else {
            this.emit('event', {
              type: 'progress',
              data: { type: 'raw_output', message: trimmed },
              raw: trimmed,
            } satisfies NdjsonEvent);
          }
        }
      }
    }
  }

  private isNoiseLine(line: string): boolean {
    return /^\[[\w-]+\]\s/.test(line) ||
      /plugin\s+load/i.test(line) ||
      /^(debug|info|warn(ing)?|trace)[\s:]/i.test(line);
  }
}
