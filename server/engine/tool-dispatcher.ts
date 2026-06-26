import type { Message, ToolCall } from '../../shared/types';
import type { StreamEvent } from '../ai/adapter';
import type { MemoryContext } from '../memory/memory-types';
import { toolRegistry } from '../tools/registry';
import { CancellationToken } from './cancellation';
import { createApprovalId, waitForToolApproval } from './tool-approval';
import { SessionMemory } from '../memory/index';

const APPROVAL_REQUIRED_TOOLS = new Set(['write_file']);

export async function* dispatchToolCalls(
  toolCalls: ToolCall[],
  config: { workspacePath: string; sessionId: string },
  messagesArr: Message[],
  sessionMemory: SessionMemory,
  memCtx: MemoryContext,
  canceller: CancellationToken,
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  for (const tc of toolCalls) {
    canceller.throwIfCancelled();
    try {
      let approved = true;
      if (APPROVAL_REQUIRED_TOOLS.has(tc.name)) {
        const approvalId = createApprovalId();
        const filePath = String(tc.arguments.path ?? '');
        const content = String(tc.arguments.content ?? '');
        const bytes = Buffer.byteLength(content, 'utf-8');

        yield {
          type: 'approval_required',
          data: {
            id: approvalId,
            toolCallId: tc.id,
            name: tc.name,
            path: filePath,
            contentPreview: content.slice(0, 800),
            bytes,
          },
        };

        approved = await waitForToolApproval(approvalId, 10 * 60 * 1000, signal);
        if (signal?.aborted) return;
        yield {
          type: 'approval_resolved',
          data: { id: approvalId, approved },
        };
      }

      if (!approved) {
        const output = `Error: User denied write permission for ${String(tc.arguments.path ?? 'file')}`;
        messagesArr.push({
          id: crypto.randomUUID(),
          role: 'tool',
          content: output,
          toolCallId: tc.id,
          timestamp: Date.now(),
        });
        yield {
          type: 'tool_result',
          data: { id: tc.id, name: tc.name, success: false, output },
        };
        sessionMemory.observe(`Tool Denied: ${tc.name} | Path: ${String(tc.arguments.path ?? '')}`);
        continue;
      }

      const result = await toolRegistry.execute(tc.name, tc.arguments, {
        workspacePath: config.workspacePath,
        sessionId: config.sessionId,
        projectPath: config.workspacePath,
        memoryContext: memCtx,
      });
      const output = result.success
        ? (typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2))
        : `Error: ${result.error}`;
      messagesArr.push({
        id: crypto.randomUUID(),
        role: 'tool',
        content: output,
        toolCallId: tc.id,
        timestamp: Date.now(),
      });
      yield {
        type: 'tool_result',
        data: { id: tc.id, name: tc.name, success: result.success, output },
      };

      // ---- Memory: Observe tool usage ----
      sessionMemory.observe(
        `Tool: ${tc.name} | Success: ${result.success} | Args: ${JSON.stringify(tc.arguments).slice(0, 200)}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Tool failed';
      messagesArr.push({
        id: crypto.randomUUID(),
        role: 'tool',
        content: `Error: ${msg}`,
        toolCallId: tc.id,
        timestamp: Date.now(),
      });
      yield {
        type: 'tool_result',
        data: { id: tc.id, name: tc.name, success: false, output: msg },
      };

      // ---- Memory: Observe tool errors ----
      sessionMemory.observe(`Tool Error: ${tc.name} | Error: ${msg}`);
    }
  }
}
