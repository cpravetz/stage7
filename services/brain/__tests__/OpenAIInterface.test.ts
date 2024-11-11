import { OpenAIInterface } from '../src/interfaces/OpenAIInterface';
import OpenAI from 'openai';

jest.mock('openai');

describe('OpenAIInterface', () => {
  let openAIInterface: OpenAIInterface;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    openAIInterface = new OpenAIInterface(mockApiKey);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with the correct properties', () => {
    expect(openAIInterface.name).toBe('OpenAI');
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
        completions: { create: mockCreate },
      } as any;

      const result = await openAIInterface.chat(mockMessages, mockOptions);

      expect(result).toBe(mockResponse);
      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{ role: 'user', content: mockMessages[0] }],
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
        completions: { create: mockCreate },
      } as any;

      await openAIInterface.chat(mockMessages, {});

      expect(mockCreate).toHaveBeenCalledWith({
        model: 'gpt-4',
        messages: [{ role: 'user', content: mockMessages[0] }],
        temperature: 0.7,
        max_tokens: 2000,
      });
    });

    it('should throw an error when OpenAI response has no content', async () => {
      const mockMessages = ['Hello'];

      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: null } }],
      });

      (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
        completions: { create: mockCreate },
      } as any;

      await expect(openAIInterface.chat(mockMessages, {})).rejects.toThrow('No content in OpenAI response');
    });

    it('should handle OpenAI API errors', async () => {
      const mockMessages = ['Hello'];
      const mockError = new Error('API Error');

      const mockCreate = jest.fn().mockRejectedValue(mockError);

      (OpenAI as jest.MockedClass<typeof OpenAI>).prototype.chat = {
        completions: { create: mockCreate },
      } as any;

      await expect(openAIInterface.chat(mockMessages, {})).rejects.toThrow('Failed to generate response from OpenAI: API Error');
    });
  });
});