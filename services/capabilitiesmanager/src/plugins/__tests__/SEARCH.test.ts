import axios from 'axios';
import cheerio from 'cheerio';
import { execute } from '../SEARCH/SEARCH';
import { PluginInput, PluginParameterType } from '@cktmcs/shared';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SEARCH plugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return search results when given a valid search term', async () => {
    const mockHtml = `
      <div class="result__url">
        <a class="result__title">Test Title 1</a>
        <a href="https://example1.com">Link 1</a>
      </div>
      <div class="result__url">
        <a class="result__title">Test Title 2</a>
        <a href="https://example2.com">Link 2</a>
      </div>
    `;
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const inputs = new Map<string, PluginInput>();
    inputs.set('searchTerm', { inputName: 'searchTerm', inputValue: 'test search', args: {} });

    const result = await execute(inputs);

    expect(result.success).toBe(true);
    expect(result.resultType).toBe(PluginParameterType.ARRAY);
    expect(result.resultDescription).toBe('Search results for "test search"');
    expect(result.result).toEqual([
      { title: 'Test Title 1', url: 'https://example1.com' },
      { title: 'Test Title 2', url: 'https://example2.com' }
    ]);
    expect(mockedAxios.get).toHaveBeenCalledWith('https://html.duckduckgo.com/html/?q=test%20search');
  });

  it('should return an error when search term is not provided', async () => {
    const inputs = new Map<string, PluginInput>();

    const result = await execute(inputs);

    expect(result.success).toBe(false);
    expect(result.resultType).toBe(PluginParameterType.ERROR);
    expect(result.resultDescription).toBe('Error searching for "undefined search term"');
    expect(result.error).toBe('Search term is required for SEARCH plugin');
  });

  it('should handle network errors', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    const inputs = new Map<string, PluginInput>();
    inputs.set('searchTerm', { inputName: 'searchTerm', inputValue: 'test search', args: {} });

    const result = await execute(inputs);

    expect(result.success).toBe(false);
    expect(result.resultType).toBe(PluginParameterType.ERROR);
    expect(result.resultDescription).toBe('Error searching for "test search"');
    expect(result.error).toBe('Network error');
  });
});