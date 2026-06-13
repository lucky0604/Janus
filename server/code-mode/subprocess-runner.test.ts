import { describe, it, expect } from 'vitest';
import { parseCliJsonEvent } from './subprocess-runner';

describe('parseCliJsonEvent', () => {
  it('parses Claude assistant message content blocks', () => {
    const event = parseCliJsonEvent({
      type: 'assistant',
      message: {
        type: 'message',
        content: [{ type: 'text', text: 'Hello world' }],
      },
    });
    expect(event).toEqual({ type: 'text_delta', data: { text: 'Hello world' } });
  });

  it('parses Claude result line', () => {
    const event = parseCliJsonEvent({
      type: 'result',
      result: 'Done.',
    });
    expect(event).toEqual({ type: 'text_delta', data: { text: 'Done.' } });
  });

  it('parses Codex agent_message item', () => {
    const event = parseCliJsonEvent({
      type: 'item.completed',
      item: { id: 'item_1', type: 'agent_message', text: 'Hello' },
    });
    expect(event).toEqual({ type: 'text_delta', data: { text: 'Hello' } });
  });

  it('parses nested Claude stream_event', () => {
    const event = parseCliJsonEvent({
      type: 'stream_event',
      event: {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Hi' },
      },
    });
    expect(event).toEqual({ type: 'text_delta', data: { text: 'Hi' } });
  });
});
