export type SlashItemKind = 'builtin' | 'skill';

export type SlashItemScope = 'builtin' | 'user' | 'project';

export interface SlashItem {
  name: string;
  description: string;
  kind: SlashItemKind;
  scope: SlashItemScope;
  argumentHint?: string;
  filePath?: string;
  source?: 'kavis' | 'claude';
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  'argument-hint'?: string;
  'when-to-use'?: string;
  'allowed-tools'?: string | string[];
  model?: string;
  'disable-model-invocation'?: boolean;
  'user-invocable'?: boolean;
}

export interface SlashItemsResponse {
  items: SlashItem[];
}

export interface SkillDetailResponse {
  frontmatter: SkillFrontmatter;
  body: string;
}
