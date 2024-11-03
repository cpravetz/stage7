import axios from 'axios';
import AnthropicModel from '../src/models/Anthropic';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AnthropicModel', () => {
  let model: AnthropicModel;
  const mockEnv = { ANTHROPIC_API_KEY: 'test-api-key' };

  beforeEach(() => {
    model = new AnthropicModel(mockEnv);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('constructor sets API key from environment', () => {
    expect((model as any).apiKey).toBe('test-api-key');
  });

  test('generate method formats messages and calls Anthropic API', async () => {
    const messages = ['Hello', 'How are you?'];
    const mockResponse = { data: { completion: 'I am doing well, thank you for asking!' } };
    mockedAxios.post.mockResolvedValue(mockResponse);

    const result = await model.generate(messages);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/complete',
      {
        prompt: 'Human: Hello\n\nHuman: How are you?\n\nAssistant:',
        max_tokens_to_sample: 2000,
        temperature: 0.7,
        model: 'claude-v1'
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': 'test-api-key',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
    expect(result).toBe('I am doing well, thank you for asking!');
  });

  test('generate method uses custom options when provided', async () => {
    const messages = ['Custom message'];
    const options = { max_length: 1000, temperature: 0.5 };
    const mockResponse = { data: { completion: 'Custom response' } };
    mockedAxios.post.mockResolvedValue(mockResponse);

    await model.generate(messages, options);

    expect(mockedAxios.post).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        max_tokens_to_sample: 1000,
        temperature: 0.5,
      }),
      expect.any(Object)
    );
  });

  test('generate method throws error when API call fails', async () => {
    const messages = ['Test message'];
    mockedAxios.post.mockRejectedValue(new Error('API Error'));

    await expect(model.generate(messages)).rejects.toThrow('Failed to generate response from Anthropic');
  });
});