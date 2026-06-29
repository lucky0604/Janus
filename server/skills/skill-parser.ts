import fs from 'fs';
import * as yaml from 'js-yaml';
import type { SkillFrontmatter } from '../../shared/types/slash';

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export interface ParsedSkill {
  frontmatter: SkillFrontmatter;
  body: string;
}

export function parseSkillFile(absPath: string): ParsedSkill | null {
  let raw: string;
  try {
    raw = fs.readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
  return parseSkillContent(raw);
}

export function parseSkillContent(raw: string): ParsedSkill {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) {
    return { frontmatter: {}, body: raw.trim() };
  }
  let fm: SkillFrontmatter = {};
  try {
    const loaded = yaml.load(match[1]);
    if (loaded && typeof loaded === 'object') {
      fm = loaded as SkillFrontmatter;
    }
  } catch {
    fm = {};
  }
  return { frontmatter: fm, body: match[2].trim() };
}
