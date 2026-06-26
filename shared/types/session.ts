// ---- Session ----
/** CLI relay sessions in Code Mode scene (distinct from Work Mode chat sessions). */
export const CODE_MODE_SESSION_AGENT = 'code-mode';

export type SessionListScope = 'work' | 'code-mode';

export function sessionMatchesScope(agentType: string, scope: SessionListScope): boolean {
  if (scope === 'code-mode') return agentType === CODE_MODE_SESSION_AGENT;
  return agentType !== CODE_MODE_SESSION_AGENT;
}

export interface SessionMeta {
  sessionId: string;
  name: string;
  agentType: string;
  createdAt: string;
  lastActiveAt: string;
  turnCount: number;
  messageCount: number;
  projectPath?: string;
  nameSource?: 'placeholder' | 'snippet' | 'llm' | 'manual';
}

// ---- Project Management ----
export interface ProjectMeta {
  id: string;
  name: string;
  path: string;
  gitBranch?: string;
  isGitClean?: boolean;
  lastAccessedAt: string;
  createdAt: string;
}

export interface DialogTurn {
  turnId: string;
  turnIndex: number;
  messages: import('./messages').Message[];
  startTime: string;
  endTime?: string;
}
