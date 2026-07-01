import { describe, it, expect } from 'vitest';
import { adaptStreamEvent } from './code-run-event-adapter';

describe('code-run-event-adapter', () => {
  const sessionId = 's1';
  const runId = 'r1';

  it('always emits a raw_event', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'text_delta',
      data: { text: 'hello' },
    });
    expect(events.some((e) => e.type === 'raw_event')).toBe(true);
  });

  it('adapts text_delta to text_delta agent event', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'text_delta',
      data: { text: 'hello' },
    });
    const textEvent = events.find((e) => e.type === 'text_delta');
    expect(textEvent).toBeDefined();
    if (textEvent?.type === 'text_delta') {
      expect(textEvent.text).toBe('hello');
    }
  });

  it('adapts thinking to thinking_delta', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'thinking',
      data: { text: 'considering...' },
    });
    const thinkEvent = events.find((e) => e.type === 'thinking_delta');
    expect(thinkEvent).toBeDefined();
  });

  it('adapts tool_call to tool_call_started', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'tool_call',
      data: { id: 'tc1', name: 'read_file', arguments: '{"path": "x.ts"}' },
    });
    const tcEvent = events.find((e) => e.type === 'tool_call_started');
    expect(tcEvent).toBeDefined();
    if (tcEvent?.type === 'tool_call_started') {
      expect(tcEvent.toolCallId).toBe('tc1');
      expect(tcEvent.toolName).toBe('read_file');
    }
  });

  it('adapts successful tool_result to tool_call_result', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'tool_result',
      data: { id: 'tc1', success: true, output: 'file contents' },
    });
    const resultEvent = events.find((e) => e.type === 'tool_call_result');
    expect(resultEvent).toBeDefined();
    if (resultEvent?.type === 'tool_call_result') {
      expect(resultEvent.toolCallId).toBe('tc1');
    }
  });

  it('adapts failed tool_result to tool_call_failed', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'tool_result',
      data: { id: 'tc1', success: false, output: 'error message' },
    });
    const failEvent = events.find((e) => e.type === 'tool_call_failed');
    expect(failEvent).toBeDefined();
    if (failEvent?.type === 'tool_call_failed') {
      expect(failEvent.error).toBe('error message');
    }
  });

  it('adapts done to run_completed', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'done',
      data: { reason: 'end_turn' },
    });
    const doneEvent = events.find((e) => e.type === 'run_completed');
    expect(doneEvent).toBeDefined();
  });

  it('adapts error to run_failed', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'error',
      data: { message: 'API rate limit' },
    });
    const errorEvent = events.find((e) => e.type === 'run_failed');
    expect(errorEvent).toBeDefined();
    if (errorEvent?.type === 'run_failed') {
      expect(errorEvent.error).toBe('API rate limit');
    }
  });

  it('handles unknown event types with only raw_event', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'memory_recall',
      data: { count: 3 },
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('raw_event');
  });

  it('skips empty text_delta', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'text_delta',
      data: { text: '' },
    });
    expect(events.some((e) => e.type === 'text_delta')).toBe(false);
    expect(events.some((e) => e.type === 'raw_event')).toBe(true);
  });

  it('handles tool_call with call_id alias', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'tool_call',
      data: { call_id: 'tc2', name: 'grep', input: { pattern: 'foo' } },
    });
    const tcEvent = events.find((e) => e.type === 'tool_call_started');
    expect(tcEvent).toBeDefined();
    if (tcEvent?.type === 'tool_call_started') {
      expect(tcEvent.toolCallId).toBe('tc2');
    }
  });

  it('handles tool_result with call_id alias', () => {
    const events = adaptStreamEvent(sessionId, runId, {
      type: 'tool_result',
      data: { call_id: 'tc2' },
    });
    const resultEvent = events.find((e) => e.type === 'tool_call_result');
    expect(resultEvent).toBeDefined();
    if (resultEvent?.type === 'tool_call_result') {
      expect(resultEvent.toolCallId).toBe('tc2');
    }
  });
});
