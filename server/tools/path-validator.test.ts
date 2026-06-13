import { describe, it, expect } from 'vitest';
import { resolveToolPath, PathError } from './path-validator';

describe('resolveToolPath', () => {
  it('accepts absolute paths without workspace', () => {
    const resolved = resolveToolPath('/tmp', '');
    expect(resolved).toBeTruthy();
  });

  it('rejects relative paths when workspace is empty', () => {
    expect(() => resolveToolPath('src/foo.ts', '')).toThrow(PathError);
  });

  it('resolves relative paths against workspace', () => {
    const resolved = resolveToolPath('package.json', process.cwd());
    expect(resolved.endsWith('package.json')).toBe(true);
  });
});
