
import { GroqInterface } from '../src/interfaces/GroqInterface';
import { BaseService } from '../src/services/baseService';
import { LLMConversationType } from '@cktmcs/shared';
import OpenAI from 'openai';

// Mock dependencies
jest.mock('openai');

describe('GroqInterface', () => {
  let groqInterface: GroqInterface;
  let mockService: BaseService;
  let mockOpenAIClient: jest.Mocked<OpenAI>;

  beforeEach(() => {
    groqInterface = new GroqInterface();
    mockService = new BaseService('test-service', 'test-key', 'http://test.com', ['groq']);

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
    it('should make a chat request to the Groq API and return the response', async () => {
      mockOpenAIClient.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'Hello from Groq!' } }],
      });

      const response = await groqInterface.chat(mockService, [{ role: 'user', content: 'test' }], {});

      expect(mockOpenAIClient.chat.completions.create).toHaveBeenCalled();
      expect(response).toBe('Hello from Groq!');
    });
  });

  describe('convert', () => {
    it('should call the correct converter based on the conversation type', async () => {
      const spy = jest.spyOn(groqInterface, 'convertTextToText').mockResolvedValue('test');

      await groqInterface.convert(mockService, LLMConversationType.TEXT_TO_TEXT, { service: mockService, prompt: 'test' });

      expect(spy).toHaveBeenCalled();
    });
  });
});
