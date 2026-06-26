// ---- Memory System (Frontend-visible types) ----
export interface MemoryEntry {
  id: string;
  content: string;
  category: 'fact' | 'preference' | 'procedure' | 'pattern' | 'context';
  source: 'MEMORY.md' | 'daily_log' | 'conversation';
  createdAt: string;
  staleness?: string;
}

export interface SkillDraft {
  id: string;
  name: string;
  description: string;
  content: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}
