import axios from 'axios';
import { execute } from '../SCRAPE/SCRAPE';
import { PluginInput, PluginParameterType } from '@cktmcs/shared';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('SCRAPE plugin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should scrape content successfully', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="content">
            <p>Test content 1</p>
            <p>Test content 2</p>
          </div>
        </body>
      </html>
    `;
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const inputs = new Map<string, PluginInput>();
    inputs.set('url', { inputName: 'url', inputValue: 'https://example.com', args: {} });
    inputs.set('selector', { inputName: 'selector', inputValue: '.content p', args: {} });

    const result = await execute(inputs);

    expect(result.success).toBe(true);
    expect(result.resultType).toBe(PluginParameterType.ARRAY);
    expect(result.resultDescription).toBe('Scraped content from https://example.com');
    expect(result.result).toEqual(['Test content 1', 'Test content 2']);
  });

  it('should handle errors when URL is not provided', async () => {
    const inputs = new Map<string, PluginInput>();

    const result = await execute(inputs);

    expect(result.success).toBe(false);
    expect(result.resultType).toBe(PluginParameterType.ERROR);
    expect(result.error).toBe('URL is required for SCRAPE plugin');
  });

  it('should handle network errors', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));

    const inputs = new Map<string, PluginInput>();
    inputs.set('url', { inputName: 'url', inputValue: 'https://example.com', args: {} });

    const result = await execute(inputs);

    expect(result.success).toBe(false);
    expect(result.resultType).toBe(PluginParameterType.ERROR);
    expect(result.error).toBe('Network error');
  });

  it('should parse config from URL input', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="content">
            <a href="link1">Link 1</a>
            <a href="link2">Link 2</a>
            <a href="link3">Link 3</a>
          </div>
        </body>
      </html>
    `;
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const inputs = new Map<string, PluginInput>();
    inputs.set('url', { inputName: 'url', inputValue: 'https://example.com|.content a|href|2', args: {} });

    const result = await execute(inputs);

    expect(result.success).toBe(true);
    expect(result.result).toEqual(['link1', 'link2']);
  });

  it('should apply limit to scraped content', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="content">
            <p>Test content 1</p>
            <p>Test content 2</p>
            <p>Test content 3</p>
          </div>
        </body>
      </html>
    `;
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const inputs = new Map<string, PluginInput>();
    inputs.set('url', { inputName: 'url', inputValue: 'https://example.com', args: {} });
    inputs.set('selector', { inputName: 'selector', inputValue: '.content p', args: {} });
    inputs.set('limit', { inputName: 'limit', inputValue: 2, args: {} });

    const result = await execute(inputs);

    expect(result.success).toBe(true);
    expect(result.result).toEqual(['Test content 1', 'Test content 2']);
  });

  it('should handle empty scrape results', async () => {
    const mockHtml = `
      <html>
        <body>
          <div class="content"></div>
        </body>
      </html>
    `;
    mockedAxios.get.mockResolvedValue({ data: mockHtml });

    const inputs = new Map<string, PluginInput>();
    inputs.set('url', { inputName: 'url', inputValue: 'https://example.com', args: {} });
    inputs.set('selector', { inputName: 'selector', inputValue: '.content p', args: {} });

    const result = await execute(inputs);

    expect(result.success).toBe(true);
    expect(result.result).toEqual([]);
  });
});