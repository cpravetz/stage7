
import { CloudflareWorkersAIInterface } from '../src/interfaces/CloudflareWorkersAIInterface';
import { BaseService } from '../src/services/baseService';
import { LLMConversationType } from '@cktmcs/shared';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');

describe('CloudflareWorkersAIInterface', () => {
  let cfInterface: CloudflareWorkersAIInterface;
  let mockService: BaseService;

  beforeEach(() => {
    cfInterface = new CloudflareWorkersAIInterface();
    mockService = new BaseService('test-service', 'test-key', 'http://test.com', ['cloudflare-workers-ai']);
  });

  describe('chat', () => {
    it('should make a POST request to the Cloudflare Workers AI API and return the response', async () => {
      const mockResponse = {
        data: {
          result: {
            response: 'Hello from Cloudflare!',
          },
        },
      };
      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const response = await cfInterface.chat(mockService, [{ role: 'user', content: 'test' }], {});

      expect(axios.post).toHaveBeenCalledWith(
        'http://test.com/@cf/meta/llama-3-8b-instruct',
        expect.any(Object),
        expect.any(Object)
      );
      expect(response).toBe('Hello from Cloudflare!');
    });
  });

  describe('convert', () => {
    it('should call the correct converter based on the conversation type', async () => {
      const spy = jest.spyOn(cfInterface, 'convertTextToText').mockResolvedValue('test');

      await cfInterface.convert(mockService, LLMConversationType.TEXT_TO_TEXT, { service: mockService, prompt: 'test' });

      expect(spy).toHaveBeenCalled();
    });
  });
});
