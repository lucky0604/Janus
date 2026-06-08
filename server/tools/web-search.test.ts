import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('web_search: DuckDuckGo fallback', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    delete process.env.TAVILY_API_KEY;
  });

  it('duckduckgoSearch parses HTML results correctly', async () => {
    const { duckduckgoSearch } = await import('./web-search');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => `
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage1">Example Result 1</a>
        <a class="result__snippet">This is the first snippet text</a>
        <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpage2">Example Result 2</a>
        <a class="result__snippet">Second snippet here</a>
      `,
    });

    const result = await duckduckgoSearch('test query', 5);
    expect(result.engine).toBe('duckduckgo');
    expect(result.results).toHaveLength(2);
    expect(result.results[0].url).toBe('https://example.com/page1');
    expect(result.results[0].title).toContain('Example Result 1');
    expect(result.results[0].snippet).toBe('This is the first snippet text');
  });

  it('tavilySearch throws NO_TAVILY_KEY when key missing', async () => {
    const { tavilySearch } = await import('./web-search');
    await expect(tavilySearch('test', 5)).rejects.toThrow('NO_TAVILY_KEY');
  });

  it('tavilySearch returns results when key is set', async () => {
    process.env.TAVILY_API_KEY = 'test-key';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          { title: 'Tavily Result', url: 'https://tavily.com/result', content: 'From Tavily API' },
        ],
      }),
    });

    const { tavilySearch } = await import('./web-search');
    const result = await tavilySearch('test', 5);
    expect(result.engine).toBe('tavily');
    expect(result.results[0].title).toBe('Tavily Result');
  });

  it('duckduckgoSearch handles empty results gracefully', async () => {
    const { duckduckgoSearch } = await import('./web-search');

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => '<html><body>No results found</body></html>',
    });

    const result = await duckduckgoSearch('obscure query', 5);
    expect(result.engine).toBe('duckduckgo');
    expect(result.results).toHaveLength(0);
  });
});
