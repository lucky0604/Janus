import { describe, it, expect } from 'vitest';
import { agentRegistry } from './registry';

describe('Agent Registry', () => {
  // Work mode agent is registered at server startup via index.ts
  // We test the registry API directly

  it('register and get an agent', () => {
    agentRegistry.register({
      id: 'test-agent',
      name: 'Test Agent',
      description: 'A test agent',
      systemPrompt: 'You are a test agent.',
      tools: ['read_file'],
      capabilities: [{ category: 'analysis', level: 1 }],
    });

    const agent = agentRegistry.get('test-agent');
    expect(agent).toBeDefined();
    expect(agent?.name).toBe('Test Agent');
    expect(agent?.systemPrompt).toBe('You are a test agent.');
    expect(agent?.tools).toEqual(['read_file']);
  });

  it('throws on duplicate registration', () => {
    expect(() =>
      agentRegistry.register({
        id: 'test-agent', // already registered above
        name: 'Duplicate',
        description: '',
        systemPrompt: '',
        tools: [],
        capabilities: [],
      })
    ).toThrow('already registered');
  });

  it('get returns undefined for unknown agent', () => {
    expect(agentRegistry.get('nonexistent')).toBeUndefined();
  });

  it('list returns all registered agents', () => {
    const agents = agentRegistry.list();
    expect(agents.length).toBeGreaterThanOrEqual(1);
    expect(agents.some((a) => a.id === 'test-agent')).toBe(true);
  });

  it('getToolNames returns tool list for agent', () => {
    const tools = agentRegistry.getToolNames('test-agent');
    expect(tools).toEqual(['read_file']);
  });
});
