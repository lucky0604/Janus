import type { SlashItem } from '../../shared/types/slash';

export const BUILTIN_COMMANDS: SlashItem[] = [
  {
    name: 'clear',
    description: 'Reset the current chat session',
    kind: 'builtin',
    scope: 'builtin',
  },
  {
    name: 'mode',
    description: 'Switch operating mode (work | code)',
    kind: 'builtin',
    scope: 'builtin',
    argumentHint: '[work|code]',
  },
  {
    name: 'role',
    description: 'Switch code-mode role (agentic | plan | ask | debug)',
    kind: 'builtin',
    scope: 'builtin',
    argumentHint: '[agentic|plan|ask|debug]',
  },
  {
    name: 'help',
    description: 'List available slash commands and skills',
    kind: 'builtin',
    scope: 'builtin',
  },
];
