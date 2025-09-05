
import { AnthropicInterface } from '../src/interfaces/AnthropicInterface';
import { BaseService } from '../src/services/baseService';
import { LLMConversationType } from '@cktmcs/shared';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');

describe('AnthropicInterface', () => {
  let anthropicInterface: AnthropicInterface;
  let mockService: BaseService;

  beforeEach(() => {
    anthropicInterface = new AnthropicInterface();
    mockService = new BaseService('test-service', 'test-key', 'http://test.com', ['anthropic']);
  });

  describe('chat', () => {
    it('should make a POST request to the Anthropic API and return the response', async () => {
      const mockResponse = {
        data: {
          on: (event: string, callback: (chunk: any) => void) => {
            if (event === 'data') {
              callback(Buffer.from('data: {"type":"content_block_delta","delta":{"text":"Hello"}}\n'));
              callback(Buffer.from('data: {"type":"content_block_delta","delta":{"text":" World!"}}\n'));
            }
            if (event === 'end') {
              callback();
            }
          },
        },
      };
      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const response = await anthropicInterface.chat(mockService, [{ role: 'user', content: 'test' }], {});

      expect(axios.post).toHaveBeenCalledWith(
        'http://test.com',
        expect.any(Object),
        expect.any(Object)
      );
      expect(response).toBe('Hello World!');
    });
  });

  describe('convert', () => {
    it('should call the correct converter based on the conversation type', async () => {
      const spy = jest.spyOn(anthropicInterface, 'convertTextToText').mockResolvedValue('test');

      await anthropicInterface.convert(mockService, LLMConversationType.TEXT_TO_TEXT, { service: mockService, prompt: 'test' });

      expect(spy).toHaveBeenCalled();
    });
  });
});
