import { OpenRouterInterface } from '../src/interfaces/OpenRouterInterface';
import OpenAI from 'openai';

jest.mock('openai');

describe('OpenRouterInterface', () => {
  let openRouterInterface: OpenRouterInterface;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    openRouterInterface = new OpenRouterInterface(mockApiKey);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with the correct properties', () => {
    expect(openRouterInterface.name).toBe('OpenRouter');
  });

  describe('generate', () => {
    it('should generate a response successfully', async () => {
      const mockMessages = ['Hello, how are you?'];
      const mockOptions = { max_length: 100, temperature: 0.5, modelName: 'gpt-4' };
      const mockResponse = 'I am an AI language model. How can I assist you today?';

      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: mockResponse } }],
      });

      (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
        completions: {
          create: mockCreate,
        },
      } as any;

      const result = await openRouterInterface.generate(mockMessages, mockOptions);

      expect(result).toBe(mockResponse);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello, how are you?' }],
        temperature: 0.5,
        max_tokens: 100,
      });
    });

    it('should use default values when options are not provided', async () => {
      const mockMessages = ['Hello'];
      const mockResponse = 'Hi there!';

      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: mockResponse } }],
      });

      (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
        completions: {
          create: mockCreate,
        },
      } as any;

      await openRouterInterface.generate(mockMessages, {});

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
        max_tokens: 2000,
      });
    });

    it('should throw an error when the API response is invalid', async () => {
      const mockMessages = ['Hello'];
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: {} }],
      });

      (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
        completions: {
          create: mockCreate,
        },
      } as any;

      await expect(openRouterInterface.generate(mockMessages, {})).rejects.toThrow(
        'No content in OpenRouter response'
      );
    });

    it('should throw an error when the API call fails', async () => {
      const mockMessages = ['Hello'];
      const mockCreate = jest.fn().mockRejectedValue(new Error('API Error'));

      (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
        completions: {
          create: mockCreate,
        },
      } as any;

      await expect(openRouterInterface.generate(mockMessages, {})).rejects.toThrow(
        'Failed to generate response from OpenRouter: API Error'
      );
    });
  });
});