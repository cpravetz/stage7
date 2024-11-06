import { HuggingfaceInterface } from '../src/interfaces/HuggingfaceInterface';
import { HfInference } from '@huggingface/inference';

jest.mock('@huggingface/inference');

describe('HuggingfaceInterface', () => {
  let huggingfaceInterface: HuggingfaceInterface;
  const mockApiKey = 'test-api-key';

  beforeEach(() => {
    huggingfaceInterface = new HuggingfaceInterface(mockApiKey);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should initialize with the correct properties', () => {
    expect(huggingfaceInterface.name).toBe('Huggingface');
  });

  describe('generate', () => {
    it('should generate a response successfully', async () => {
      const mockMessages = ['Hello, how are you?'];
      const mockOptions = { max_length: 100, temperature: 0.5, modelName: 'test-model' };
      const mockResponse = 'I am doing well, thank you for asking!';

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: mockResponse } }] };
        },
      };

      (HfInference.prototype.chatCompletionStream as jest.Mock).mockResolvedValue(mockStream);

      const result = await huggingfaceInterface.generate(mockMessages, mockOptions);

      expect(HfInference).toHaveBeenCalledWith(mockApiKey);
      expect(HfInference.prototype.chatCompletionStream).toHaveBeenCalledWith({
        model: 'test-model',
        messages: mockMessages,
        max_tokens: 100,
        temperature: 0.5,
      });
      expect(result).toBe(mockResponse);
    });

    it('should use default values when options are not provided', async () => {
      const mockMessages = ['Hello'];
      const mockResponse = 'Hi there!';

      const mockStream = {
        async *[Symbol.asyncIterator]() {
          yield { choices: [{ delta: { content: mockResponse } }] };
        },
      };

      (HfInference.prototype.chatCompletionStream as jest.Mock).mockResolvedValue(mockStream);

      await huggingfaceInterface.generate(mockMessages, {});

      expect(HfInference.prototype.chatCompletionStream).toHaveBeenCalledWith({
        model: 'meta-llama/llama-3.2-3b-instruct',
        messages: mockMessages,
        max_tokens: 1000,
        temperature: 0.7,
      });
    });

    it('should handle errors and throw an exception', async () => {
      const mockMessages = ['Hello'];
      const mockError = new Error('API Error');

      (HfInference.prototype.chatCompletionStream as jest.Mock).mockRejectedValue(mockError);

      await expect(huggingfaceInterface.generate(mockMessages, {})).rejects.toThrow('Failed to generate response from Huggingface');
    });
  });
});