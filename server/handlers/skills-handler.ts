import type { IncomingMessage, ServerResponse } from 'http';
import path from 'path';
import { BUILTIN_COMMANDS, discoverSkills, findSkillByName, parseSkillFile } from '../skills';
import type { SlashItemsResponse, SkillDetailResponse } from '../../shared/types/slash';

function resolveWorkspace(url: URL): string | undefined {
  const raw = url.searchParams.get('workspace')
    || process.env.KAVIS_WORKSPACE
    || process.env.JANUS_WORKSPACE
    || '';
  if (!raw) return undefined;
  return path.resolve(raw);
}

export function handleSkillsList(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const workspace = resolveWorkspace(url);
  const items = [...BUILTIN_COMMANDS, ...discoverSkills(workspace)];
  const body: SlashItemsResponse = { items };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
  return Promise.resolve();
}

export function handleSkillDetail(
  req: IncomingMessage,
  res: ServerResponse,
  name: string,
): Promise<void> {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const workspace = resolveWorkspace(url);
  const skill = findSkillByName(workspace, name);
  if (!skill || !skill.filePath) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Skill not found: ${name}` }));
    return Promise.resolve();
  }
  const parsed = parseSkillFile(skill.filePath);
  if (!parsed) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: `Failed to read skill: ${name}` }));
    return Promise.resolve();
  }
  const body: SkillDetailResponse = parsed;
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
  return Promise.resolve();
}
