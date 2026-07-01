import { describe, it, expect } from 'vitest';
import { reduceCodeRunEvent } from './code-run-reducer';
import type { AgentEvent, CodeRunNormalizedState } from './code-run-types';

function emptyState(): CodeRunNormalizedState {
  return {
    runsById: {},
    toolCallsById: {},
    runOrderBySession: {},
    activeRunBySession: {},
    rawEventsBySession: {},
  };
}

function startedState(sessionId = 's1', runId = 'r1'): CodeRunNormalizedState {
  return reduceCodeRunEvent(emptyState(), {
    type: 'run_started',
    sessionId,
    runId,
    timestamp: 1000,
  });
}

describe('code-run-reducer', () => {
  // Scenario 1: Normal reply (no tool calls)
  describe('Scenario 1: Normal reply', () => {
    it('creates a run on run_started', () => {
      const state = startedState();
      expect(state.runsById['r1']).toBeDefined();
      expect(state.runsById['r1'].status).toBe('thinking');
      expect(state.activeRunBySession['s1']).toBe('r1');
      expect(state.runOrderBySession['s1']).toEqual(['r1']);
    });

    it('transitions to streaming on text_delta', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'text_delta',
        sessionId: 's1',
        runId: 'r1',
        text: 'Hello',
        timestamp: 2000,
      });
      expect(state.runsById['r1'].status).toBe('streaming');
    });

    it('completes the run on run_completed', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'text_delta',
        sessionId: 's1',
        runId: 'r1',
        text: 'Hello',
        timestamp: 2000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'run_completed',
        sessionId: 's1',
        runId: 'r1',
        timestamp: 3000,
      });
      expect(state.runsById['r1'].status).toBe('completed');
      expect(state.runsById['r1'].completedAt).toBe(3000);
    });

    it('does not create empty tool calls', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'run_completed',
        sessionId: 's1',
        runId: 'r1',
        timestamp: 3000,
      });
      expect(state.runsById['r1'].toolCallIds).toEqual([]);
      expect(Object.keys(state.toolCallsById)).toEqual([]);
    });
  });

  // Scenario 2: Single tool call
  describe('Scenario 2: Single tool call', () => {
    it('adds a tool call and transitions to calling_tool', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        summary: 'src/index.ts',
        timestamp: 2000,
      });
      expect(state.runsById['r1'].status).toBe('calling_tool');
      expect(state.runsById['r1'].currentToolCallId).toBe('tc1');
      expect(state.runsById['r1'].toolCallIds).toEqual(['tc1']);
      expect(state.toolCallsById['tc1']).toBeDefined();
      expect(state.toolCallsById['tc1'].status).toBe('running');
      expect(state.toolCallsById['tc1'].name).toBe('read_file');
    });

    it('completes tool call and preserves it after run completion', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 2000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_result',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        result: 'file contents',
        timestamp: 3000,
      });
      expect(state.toolCallsById['tc1'].status).toBe('succeeded');
      expect(state.runsById['r1'].status).toBe('waiting_model');

      // Run completes — tool calls must NOT disappear
      state = reduceCodeRunEvent(state, {
        type: 'run_completed',
        sessionId: 's1',
        runId: 'r1',
        timestamp: 4000,
      });
      expect(state.runsById['r1'].status).toBe('completed');
      expect(state.toolCallsById['tc1']).toBeDefined();
      expect(state.toolCallsById['tc1'].status).toBe('succeeded');
      expect(state.runsById['r1'].toolCallIds).toEqual(['tc1']);
    });
  });

  // Scenario 3: Multiple tool calls
  describe('Scenario 3: Multiple tool calls', () => {
    it('tracks multiple tool calls in order', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 2000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_result',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        timestamp: 3000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc2',
        toolName: 'write_file',
        timestamp: 4000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc3',
        toolName: 'run_command',
        timestamp: 5000,
      });

      expect(state.runsById['r1'].toolCallIds).toEqual(['tc1', 'tc2', 'tc3']);
      expect(state.toolCallsById['tc1'].status).toBe('succeeded');
      expect(state.toolCallsById['tc2'].status).toBe('running');
      expect(state.toolCallsById['tc3'].status).toBe('running');
      expect(state.runsById['r1'].status).toBe('calling_tool');

      // Complete all and finish run
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_result',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc2',
        timestamp: 6000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_result',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc3',
        timestamp: 7000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'run_completed',
        sessionId: 's1',
        runId: 'r1',
        timestamp: 8000,
      });

      // All tool calls preserved after completion
      expect(state.runsById['r1'].toolCallIds).toEqual(['tc1', 'tc2', 'tc3']);
      expect(state.toolCallsById['tc1'].status).toBe('succeeded');
      expect(state.toolCallsById['tc2'].status).toBe('succeeded');
      expect(state.toolCallsById['tc3'].status).toBe('succeeded');
    });
  });

  // Scenario 4: Long task (elapsed time tracking)
  describe('Scenario 4: Long task timestamps', () => {
    it('tracks startedAt and updatedAt', () => {
      let state = startedState();
      expect(state.runsById['r1'].startedAt).toBe(1000);

      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'long_tool',
        timestamp: 5000,
      });
      expect(state.runsById['r1'].updatedAt).toBe(5000);

      state = reduceCodeRunEvent(state, {
        type: 'progress',
        sessionId: 's1',
        runId: 'r1',
        text: 'Still working...',
        timestamp: 30000,
      });
      expect(state.runsById['r1'].updatedAt).toBe(30000);
    });
  });

  // Scenario 5: Tool failure
  describe('Scenario 5: Tool failure', () => {
    it('marks tool as failed without clearing other tools', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 2000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_result',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        timestamp: 3000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc2',
        toolName: 'write_file',
        timestamp: 4000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_failed',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc2',
        error: 'Permission denied',
        timestamp: 5000,
      });

      expect(state.toolCallsById['tc1'].status).toBe('succeeded');
      expect(state.toolCallsById['tc2'].status).toBe('failed');
      expect(state.toolCallsById['tc2'].error).toBe('Permission denied');
      // Run transitions to waiting_model (agent may continue)
      expect(state.runsById['r1'].status).toBe('waiting_model');
    });

    it('run_failed marks remaining running tools as cancelled', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 2000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'run_failed',
        sessionId: 's1',
        runId: 'r1',
        error: 'API error',
        timestamp: 3000,
      });

      expect(state.runsById['r1'].status).toBe('failed');
      expect(state.runsById['r1'].error).toBe('API error');
      expect(state.toolCallsById['tc1'].status).toBe('cancelled');
      // Tool call still exists, not cleared
      expect(state.runsById['r1'].toolCallIds).toEqual(['tc1']);
    });
  });

  // Scenario 6: Cancel
  describe('Scenario 6: Cancel', () => {
    it('cancels running tools and marks run as cancelled', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 2000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'run_cancelled',
        sessionId: 's1',
        runId: 'r1',
        timestamp: 3000,
      });

      expect(state.runsById['r1'].status).toBe('cancelled');
      expect(state.toolCallsById['tc1'].status).toBe('cancelled');
      // History preserved
      expect(state.runsById['r1'].toolCallIds).toEqual(['tc1']);
    });
  });

  // Scenario 7: Idempotency and edge cases
  describe('Scenario 7: Idempotency and edge cases', () => {
    it('ignores duplicate run_started', () => {
      let state = startedState();
      const before = state.runsById['r1'];
      state = reduceCodeRunEvent(state, {
        type: 'run_started',
        sessionId: 's1',
        runId: 'r1',
        timestamp: 9999,
      });
      expect(state.runsById['r1']).toBe(before);
    });

    it('ignores duplicate tool_call_started', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 2000,
      });
      const tcBefore = state.toolCallsById['tc1'];
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 9999,
      });
      expect(state.toolCallsById['tc1']).toBe(tcBefore);
    });

    it('ignores tool events for unknown run', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'unknown',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 2000,
      });
      expect(state.toolCallsById['tc1']).toBeUndefined();
    });

    it('ignores run_completed for unknown run', () => {
      const state = startedState();
      const result = reduceCodeRunEvent(state, {
        type: 'run_completed',
        sessionId: 's1',
        runId: 'unknown',
        timestamp: 2000,
      });
      expect(result).toBe(state);
    });

    it('handles unknown event type gracefully', () => {
      const state = startedState();
      const result = reduceCodeRunEvent(state, {
        type: 'unknown_event_type',
      } as unknown as AgentEvent);
      expect(result).toBe(state);
    });

    it('run_completed auto-completes any remaining running tools', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 2000,
      });
      // No tool_call_result, directly run_completed
      state = reduceCodeRunEvent(state, {
        type: 'run_completed',
        sessionId: 's1',
        runId: 'r1',
        timestamp: 3000,
      });
      expect(state.toolCallsById['tc1'].status).toBe('succeeded');
    });
  });

  // Raw events
  describe('Raw events', () => {
    it('stores raw events per session', () => {
      let state = startedState();
      state = reduceCodeRunEvent(state, {
        type: 'raw_event',
        sessionId: 's1',
        runId: 'r1',
        rawType: 'text_delta',
        data: { text: 'hello' },
        timestamp: 2000,
      });
      expect(state.rawEventsBySession['s1']).toHaveLength(1);
      expect(state.rawEventsBySession['s1'][0].type).toBe('text_delta');
    });
  });

  // Multiple runs in same session
  describe('Multiple runs', () => {
    it('preserves previous run when starting a new one', () => {
      let state = startedState('s1', 'r1');
      state = reduceCodeRunEvent(state, {
        type: 'tool_call_started',
        sessionId: 's1',
        runId: 'r1',
        toolCallId: 'tc1',
        toolName: 'read_file',
        timestamp: 2000,
      });
      state = reduceCodeRunEvent(state, {
        type: 'run_completed',
        sessionId: 's1',
        runId: 'r1',
        timestamp: 3000,
      });

      // Start second run
      state = reduceCodeRunEvent(state, {
        type: 'run_started',
        sessionId: 's1',
        runId: 'r2',
        timestamp: 4000,
      });

      // Previous run and its tools are preserved
      expect(state.runsById['r1']).toBeDefined();
      expect(state.runsById['r1'].status).toBe('completed');
      expect(state.toolCallsById['tc1']).toBeDefined();
      expect(state.toolCallsById['tc1'].status).toBe('succeeded');
      expect(state.runOrderBySession['s1']).toEqual(['r1', 'r2']);
      expect(state.activeRunBySession['s1']).toBe('r2');
    });
  });
});
