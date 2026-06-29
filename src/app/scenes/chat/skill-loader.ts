import type { SlashItem, SkillDetailResponse } from '../../../../shared/types';

function renderTemplate(body: string, args: string): string {
  const trimmed = args.trim();
  const tokens = trimmed.length > 0 ? trimmed.split(/\s+/) : [];
  let out = body.replace(/\$ARGUMENTS\b/g, trimmed);
  out = out.replace(/\$(\d+)/g, (_m, idx: string) => {
    const i = parseInt(idx, 10) - 1;
    return tokens[i] ?? '';
  });
  return out;
}

export async function loadSkillBody(name: string): Promise<SkillDetailResponse> {
  const res = await fetch(`/api/skills/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Failed to load skill ${name}: HTTP ${res.status}`);
  return res.json();
}

export async function expandSkill(item: SlashItem, args: string): Promise<string> {
  if (item.kind !== 'skill') throw new Error('expandSkill called on non-skill item');
  const detail = await loadSkillBody(item.name);
  return renderTemplate(detail.body, args);
}
