import type { Message, StreamEvent } from '../../shared/types';
import { executeDialogTurn } from '../engine/agent-loop';
import { toolRegistry } from '../tools/registry';
import { agentRegistry } from '../agents/registry';
import { saveSession, loadSession } from '../persistence/session-store';
import dotenv from 'dotenv';

dotenv.config();

export interface ChatStreamRequest {
  messages: Message[];
  workspacePath: string;
  sessionId: string;
  apiKey: string;
  baseUrl?: string;
  modelName?: string;
  agentId?: string;
}

export async function handleChatStream(
  req: ChatStreamRequest,
  signal: AbortSignal
): Promise<ReadableStream> {
  const { messages, sessionId, workspacePath, apiKey, baseUrl, modelName, agentId } = req;
  const resolvedPath = workspacePath || process.env.JANUS_WORKSPACE || process.cwd();

  // Agent lookup: get system prompt and tool whitelist from registry
  const agent = agentId ? agentRegistry.get(agentId) : agentRegistry.get('work');
  const systemPrompt = agent?.systemPrompt;
  const agentTools = agent?.tools;

  // If agent specifies tool whitelist, filter; otherwise use all tools
  const allTools = toolRegistry.getAll();
  const tools = agentTools
    ? allTools.filter((t) => agentTools.includes(t.name))
    : allTools;

  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const push = (event: StreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        const toolDefs = tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        }));

        const config = {
          maxRounds: 10,
          workspacePath: resolvedPath,
          sessionId,
          apiKey,
          baseUrl,
          modelName,
          systemPrompt,
        };

        let doneEmitted = false;

        for await (const event of executeDialogTurn(messages, toolDefs, config, signal)) {
          if (signal.aborted) {
            push({ type: 'done', data: { reason: 'cancelled' } });
            doneEmitted = true;
            controller.close();
            return;
          }

          if (event.type === 'done') {
            push(event);
            doneEmitted = true;

            // Persist session on done
            const doneData = event.data as { reason: string; messages?: Message[] };
            if (doneData.messages) {
              try {
                await saveSession(sessionId, doneData.messages, agentId || 'work');
              } catch {
                // Persistence failure should not break the stream
              }
            }
            break;
          }

          push(event);
        }

        if (!doneEmitted) {
          push({ type: 'done', data: { reason: 'complete' } });
        }
      } catch (err) {
        push({
          type: 'error',
          data: { message: err instanceof Error ? err.message : 'Internal server error' },
        });
      } finally {
        controller.close();
      }
    },
    cancel() {
      // Clean up on client disconnect
    },
  });
}

export async function handleGetMessages(sessionId: string): Promise<{ messages: Message[] }> {
  // Load from persistent session store
  const session = await loadSession(sessionId);
  if (session) {
    return { messages: session.messages };
  }
  return { messages: [] };
}
