import axios from 'axios';
import { AnthropicInterface } from '../src/interfaces/AnthropicInterface';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('AnthropicInterface', () => {
  let anthropicInterface: AnthropicInterface;

  beforeEach(() => {
    anthropicInterface = new AnthropicInterface('test-api-key');
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should initialize with the correct properties', () => {
    expect(anthropicInterface.name).toBe('Anthropic');
  });

  describe('generate', () => {
    it('should generate a response successfully', async () => {
      const mockResponse = {
        data: {
          content: [{ text: 'Generated response' }]
        }
      };
      mockedAxios.post.mockResolvedValue(mockResponse);

      const result = await anthropicInterface.generate(['Hello', 'Hi there'], {});

      expect(result).toBe('Generated response');
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'https://api.anthropic.com/v1/messages',
        {
          model: 'claude-3-haiku-20240307',
          max_tokens: 2000,
          temperature: 0.7,
          messages: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'Hi there' }
          ]
        },
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-API-Key': 'test-api-key'
          })
        })
      );
    });

    it('should use provided options', async () => {
      const mockResponse = {
        data: {
          content: [{ text: 'Generated response' }]
        }
      };
      mockedAxios.post.mockResolvedValue(mockResponse);

      await anthropicInterface.generate(['Test'], {
        max_length: 1000,
        temperature: 0.5,
        model: 'custom-model'
      });

      expect(mockedAxios.post).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          model: 'custom-model',
          max_tokens: 1000,
          temperature: 0.5
        }),
        expect.any(Object)
      );
    });

    it('should handle rate limit errors', async () => {
      const rateLimitError = {
        response: {
          status: 429,
          statusText: 'Too Many Requests'
        }
      };
      mockedAxios.post.mockRejectedValue(rateLimitError);

      await expect(anthropicInterface.generate(['Test'], {}))
        .rejects
        .toThrow('Anthropic API rate limit reached. Please try again later.');
    });

    it('should handle unauthorized errors', async () => {
      const unauthorizedError = {
        response: {
          status: 401,
          statusText: 'Unauthorized'
        }
      };
      mockedAxios.post.mockRejectedValue(unauthorizedError);

      await expect(anthropicInterface.generate(['Test'], {}))
        .rejects
        .toThrow('Invalid Anthropic API key. Please check your credentials.');
    });

    it('should handle server errors', async () => {
      const serverError = {
        response: {
          status: 500,
          statusText: 'Internal Server Error'
        }
      };
      mockedAxios.post.mockRejectedValue(serverError);

      await expect(anthropicInterface.generate(['Test'], {}))
        .rejects
        .toThrow('Anthropic API encountered an internal server error.');
    });

    it('should handle network errors', async () => {
      const networkError = {
        request: {},
        message: 'Network Error'
      };
      mockedAxios.post.mockRejectedValue(networkError);

      await expect(anthropicInterface.generate(['Test'], {}))
        .rejects
        .toThrow('No response received from Anthropic API. Check your network connection.');
    });

    it('should handle generic errors', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Unknown error'));

      await expect(anthropicInterface.generate(['Test'], {}))
        .rejects
        .toThrow('Failed to generate response from Anthropic');
    });
  });
});