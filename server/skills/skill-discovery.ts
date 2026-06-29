import fs from 'fs';
import path from 'path';
import os from 'os';
import type { SlashItem, SlashItemScope } from '../../shared/types/slash';
import { parseSkillFile } from './skill-parser';

interface DiscoveryRoot {
  dir: string;
  scope: SlashItemScope;
  source: 'kavis' | 'claude';
}

function getDiscoveryRoots(workspace: string | undefined): DiscoveryRoot[] {
  const home = os.homedir();
  const roots: DiscoveryRoot[] = [
    { dir: path.join(home, '.kavis', 'skills'), scope: 'user', source: 'kavis' },
    { dir: path.join(home, '.claude', 'skills'), scope: 'user', source: 'claude' },
  ];
  if (workspace) {
    roots.push(
      { dir: path.join(workspace, '.kavis', 'skills'), scope: 'project', source: 'kavis' },
      { dir: path.join(workspace, '.claude', 'skills'), scope: 'project', source: 'claude' },
    );
  }
  return roots;
}

function findSkillFiles(rootDir: string): string[] {
  if (!fs.existsSync(rootDir)) return [];
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }
  for (const entry of entries) {
    const full = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const skillMd = path.join(full, 'SKILL.md');
      if (fs.existsSync(skillMd)) out.push(skillMd);
    } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
      out.push(full);
    }
  }
  return out;
}

function deriveName(filePath: string, rootDir: string): string {
  const rel = path.relative(rootDir, filePath);
  if (rel.endsWith(path.sep + 'SKILL.md') || rel === 'SKILL.md') {
    return path.dirname(rel).replace(/[\\/]/g, '-') || path.basename(rootDir);
  }
  return rel.replace(/\.md$/, '').replace(/[\\/]/g, '-');
}

export function discoverSkills(workspace: string | undefined): SlashItem[] {
  const items: SlashItem[] = [];
  const seen = new Set<string>();

  for (const root of getDiscoveryRoots(workspace)) {
    for (const filePath of findSkillFiles(root.dir)) {
      const parsed = parseSkillFile(filePath);
      if (!parsed) continue;
      const { frontmatter } = parsed;

      if (frontmatter['user-invocable'] === false) continue;

      const name = (frontmatter.name && String(frontmatter.name).trim())
        || deriveName(filePath, root.dir);

      const dedupKey = `${root.scope}:${name}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      const description = (frontmatter.description && String(frontmatter.description).trim())
        || frontmatter['when-to-use']
        || '';

      items.push({
        name,
        description: description.replace(/\s+/g, ' ').trim(),
        kind: 'skill',
        scope: root.scope,
        argumentHint: frontmatter['argument-hint'],
        filePath,
        source: root.source,
      });
    }
  }

  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

export function findSkillByName(workspace: string | undefined, name: string): SlashItem | null {
  const all = discoverSkills(workspace);
  return all.find((item) => item.name === name) || null;
}
