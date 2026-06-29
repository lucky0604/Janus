import { useAgentStore } from '../../../stores/agent-store';
import { useChatStore } from '../../../stores/chat-store';
import { useSlashStore } from '../../../stores/slash-store';
import type { OperatingModeId, AgentRoleId } from '../../../../shared/types';

export interface BuiltinCommandResult {
  handled: boolean;
  message?: string;
}

export function executeBuiltinCommand(name: string, args: string[]): BuiltinCommandResult {
  switch (name) {
    case 'mode': {
      const store = useAgentStore.getState();
      if (args.length === 0) {
        const lines = store.modes.map((m) =>
          `  ${m.id === store.activeMode ? '●' : '○'} ${m.id.padEnd(8)} — ${m.name}`,
        );
        return { handled: true, message: `Available modes:\n${lines.join('\n')}\n\nUsage: /mode <work|code>` };
      }
      const target = args[0].toLowerCase() as OperatingModeId;
      if (target !== 'work' && target !== 'code') {
        return { handled: true, message: `Unknown mode: "${target}". Use work or code.` };
      }
      store.setMode(target);
      const modeName = store.modes.find((m) => m.id === target)?.name || target;
      return { handled: true, message: `Switched to ${modeName}` };
    }

    case 'role': {
      const store = useAgentStore.getState();
      if (store.activeMode !== 'code') {
        return { handled: true, message: '/role is only available in Code Mode. Use /mode code first.' };
      }
      if (args.length === 0) {
        const lines = store.roles.map((r) =>
          `  ${r.id === store.activeRole ? '●' : '○'} ${r.id.padEnd(10)} — ${r.name}`,
        );
        return { handled: true, message: `Available roles:\n${lines.join('\n')}\n\nUsage: /role <agentic|plan|ask|debug>` };
      }
      const target = args[0].toLowerCase() as AgentRoleId;
      const valid = store.roles.find((r) => r.id === target);
      if (!valid) {
        return { handled: true, message: `Unknown role: "${target}". Use agentic, plan, ask, or debug.` };
      }
      store.setRole(target);
      return { handled: true, message: `Switched to ${valid.name}` };
    }

    case 'clear': {
      useChatStore.getState().resetSession();
      return { handled: true, message: 'Session cleared' };
    }

    case 'help': {
      const items = useSlashStore.getState().items;
      const groups = {
        builtin: items.filter((i) => i.kind === 'builtin'),
        skill: items.filter((i) => i.kind === 'skill'),
      };
      const fmt = (header: string, list: typeof items) => {
        if (list.length === 0) return '';
        const lines = list.map((i) => {
          const hint = i.argumentHint ? ` ${i.argumentHint}` : '';
          return `  /${i.name}${hint} — ${i.description}`;
        });
        return `${header}\n${lines.join('\n')}`;
      };
      const out = [
        fmt('Built-in commands:', groups.builtin),
        fmt(`Skills (${groups.skill.length}):`, groups.skill.slice(0, 20)),
        groups.skill.length > 20 ? `  …and ${groups.skill.length - 20} more` : '',
      ].filter(Boolean).join('\n\n');
      return { handled: true, message: out };
    }

    default:
      return { handled: false };
  }
}

export function parseSlashLine(input: string): { command: string; args: string[] } | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;
  const parts = trimmed.split(/\s+/);
  const command = parts[0].slice(1).toLowerCase();
  return { command, args: parts.slice(1) };
}
