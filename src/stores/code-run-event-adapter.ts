import type { AgentEvent } from './code-run-types';

/**
 * Adapt a raw SSE stream event into normalized AgentEvent(s).
 * Returns an array because some raw events map to multiple dispatch calls
 * (e.g. a raw event might produce both a typed event and a raw_event for debug).
 */
export function adaptStreamEvent(
  sessionId: string,
  runId: string,
  event: { type: string; data: unknown },
): AgentEvent[] {
  const now = Date.now();
  const data = (event.data ?? {}) as Record<string, unknown>;
  const events: AgentEvent[] = [];

  events.push({
    type: 'raw_event',
    sessionId,
    runId,
    rawType: event.type,
    data: event.data,
    timestamp: now,
  });

  switch (event.type) {
    case 'thinking': {
      const text = typeof data.text === 'string' ? data.text : '';
      if (text) {
        events.push({ type: 'thinking_delta', sessionId, runId, text, timestamp: now });
      }
      break;
    }

    case 'text_delta': {
      const text = typeof data.text === 'string' ? data.text : '';
      if (text) {
        events.push({ type: 'text_delta', sessionId, runId, text, timestamp: now });
      }
      break;
    }

    case 'tool_call': {
      const toolCallId = String(data.id ?? data.call_id ?? data.tool_call_id ?? '');
      const toolName = typeof data.name === 'string' ? data.name : '';
      if (toolCallId && toolName) {
        let summary: string | undefined;
        if (typeof data.raw === 'object' && data.raw) {
          const raw = data.raw as Record<string, unknown>;
          summary = typeof raw.input === 'object' ? JSON.stringify(raw.input).slice(0, 120) : undefined;
        } else if (typeof data.arguments === 'string') {
          summary = data.arguments.slice(0, 120);
        } else if (typeof data.input === 'object' && data.input) {
          summary = JSON.stringify(data.input).slice(0, 120);
        }
        events.push({
          type: 'tool_call_started',
          sessionId,
          runId,
          toolCallId,
          toolName,
          summary,
          args: data.arguments ?? data.input,
          timestamp: now,
        });
      }
      break;
    }

    case 'tool_result': {
      const toolCallId = String(data.id ?? data.call_id ?? data.tool_call_id ?? '');
      if (toolCallId) {
        const success = data.success !== false;
        const diff = typeof data.diff === 'string' ? data.diff : undefined;
        if (success) {
          events.push({
            type: 'tool_call_result',
            sessionId,
            runId,
            toolCallId,
            result: data.output ?? data.result,
            diff,
            timestamp: now,
          });
        } else {
          events.push({
            type: 'tool_call_failed',
            sessionId,
            runId,
            toolCallId,
            error: typeof data.output === 'string' ? data.output : 'Tool call failed',
            timestamp: now,
          });
        }
      }
      break;
    }

    case 'progress': {
      const text = extractProgressText(data);
      if (text) {
        events.push({ type: 'progress', sessionId, runId, text, timestamp: now });
      }
      break;
    }

    case 'error': {
      const msg = typeof data.message === 'string' ? data.message : 'Unknown error';
      events.push({ type: 'run_failed', sessionId, runId, error: msg, timestamp: now });
      break;
    }

    case 'done': {
      events.push({ type: 'run_completed', sessionId, runId, timestamp: now });
      break;
    }
  }

  return events;
}

function extractProgressText(data: Record<string, unknown>): string | null {
  const t = typeof data.type === 'string' ? data.type : '';
  switch (t) {
    case 'step_start': {
      const step = data.step as Record<string, unknown> | undefined;
      if (step?.type === 'tool_use' && typeof step.name === 'string') return `Running ${step.name}...`;
      if (step?.type === 'thinking') return 'Thinking...';
      return 'Processing...';
    }
    case 'tool_use': {
      const name = typeof data.name === 'string' ? data.name : undefined;
      return name ? `Running ${name}...` : 'Running tool...';
    }
    case 'thread.started': return 'Starting thread...';
    case 'turn.started': return 'Starting turn...';
    case 'response.created': return 'Generating response...';
    default: return null;
  }
}
