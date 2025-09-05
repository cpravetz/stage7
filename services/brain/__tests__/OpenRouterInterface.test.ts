
import { OpenRouterInterface } from '../src/interfaces/OpenRouterInterface';
import { BaseService } from '../src/services/baseService';
import { LLMConversationType } from '@cktmcs/shared';
import OpenAI from 'openai';
import fs from 'fs';

// Mock dependencies
jest.mock('openai');
jest.mock('fs');

describe('OpenRouterInterface', () => {
  let orInterface: OpenRouterInterface;
  let mockService: BaseService;
  let mockOpenAIClient: jest.Mocked<OpenAI>;

  beforeEach(() => {
    orInterface = new OpenRouterInterface();
    mockService = new BaseService('test-service', 'test-key', 'http://test.com', ['openrouter']);

    mockOpenAIClient = {
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    } as any;
    (OpenAI as jest.Mock).mockImplementation(() => mockOpenAIClient);
  });

  describe('chat', () => {
    it('should make a chat request to the OpenRouter API and return the response', async () => {
      mockOpenAIClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Hello from OpenRouter!' } }],
      });

      const response = await orInterface.chat(mockService, [{ role: 'user', content: 'test' }], {});

      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalled();
      expect(response).toBe('Hello from OpenRouter!');
    });
  });

  describe('convertTextToImage', () => {
    it('should generate an image from text prompt', async () => {
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          data: [{
            url: 'http://example.com/image.png'
          }]
        })
      };
      jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

      const response = await orInterface.convertTextToImage(mockService, { prompt: 'test prompt' });

      expect(global.fetch).toHaveBeenCalled();
      expect(response).toBe('http://example.com/image.png');
    });
  });

  describe('convertImageToText', () => {
    it('should analyze an image and return text', async () => {
      (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('dummy image data'));
      const mockResponse = {
        json: jest.fn().mockResolvedValue({
          choices: [{ message: { content: 'Description of image' } }],
        })
      };
      jest.spyOn(global, 'fetch').mockResolvedValue(mockResponse as any);

      const response = await orInterface.convertImageToText(mockService, { image: 'test.png', prompt: 'describe' });

      expect(global.fetch).toHaveBeenCalled();
      expect(response).toBe('Description of image');
    });
  });
});
