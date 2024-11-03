import axios from 'axios';
import { ScrapePlugin } from '../src/plugins/SCRAPE';
import { PluginInput } from '@cktmcs/shared';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('ScrapePlugin', () => {
  let plugin: ScrapePlugin;

  beforeEach(() => {
    plugin = new ScrapePlugin();
    jest.clearAllMocks();
  });

  it('should initialize with correct properties', () => {
    expect(plugin.id).toBe('plugin-SCRAPE');
    expect(plugin.verb).toBe('SCRAPE');
    expect(plugin.description).toBe('Scrapes content from a given URL');
    expect(plugin.explanation).toBe('This plugin takes a URL and optional configuration to scrape specific content from a web page');
    expect(plugin.requiredInputs).toEqual(['url']);
  });

  it('should throw an error if URL is not provided', async () => {
    const input: PluginInput = { inputValue: '', args: {}, dependencyOutputs: {} };
    const result = await plugin.execute(input);
    expect(result).toEqual({
      success: false,
      resultType: 'error',
      result: null,
      error: 'URL is required for SCRAPE plugin'
    });
  });

  it('should scrape content successfully', async () => {
    const mockHtml = '<html><body><div class="content">Test Content</div></body></html>';
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const input: PluginInput = {
      inputValue: 'https://example.com',
      args: { selector: '.content' },
      dependencyOutputs: {}
    };

    const result = await plugin.execute(input);

    expect(result).toEqual({
      success: true,
      resultType: 'array',
      result: ['Test Content']
    });
    expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com');
  });

  it('should handle scraping with attribute', async () => {
    const mockHtml = '<html><body><a href="https://test.com">Link</a></body></html>';
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const input: PluginInput = {
      inputValue: 'https://example.com',
      args: { selector: 'a', attribute: 'href' },
      dependencyOutputs: {}
    };

    const result = await plugin.execute(input);

    expect(result).toEqual({
      success: true,
      resultType: 'array',
      result: ['https://test.com']
    });
  });

  it('should apply limit when specified', async () => {
    const mockHtml = '<html><body><div>1</div><div>2</div><div>3</div></body></html>';
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const input: PluginInput = {
      inputValue: 'https://example.com',
      args: { selector: 'div', limit: '2' },
      dependencyOutputs: {}
    };

    const result = await plugin.execute(input);

    expect(result).toEqual({
      success: true,
      resultType: 'array',
      result: ['1', '2']
    });
  });

  it('should handle errors during scraping', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    const input: PluginInput = { inputValue: 'https://example.com', args: {}, dependencyOutputs: {} };

    const result = await plugin.execute(input);

    expect(result).toEqual({
      success: false,
      resultType: 'error',
      result: null,
      error: 'Network error'
    });
  });

  it('should parse config from inputValue', async () => {
    const mockHtml = '<html><body><div class="content">Test Content</div></body></html>';
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const input: PluginInput = {
      inputValue: 'https://example.com|.content|text|1',
      args: {},
      dependencyOutputs: {}
    };

    const result = await plugin.execute(input);

    expect(result).toEqual({
      success: true,
      resultType: 'array',
      result: ['Test Content']
    });
  });
});