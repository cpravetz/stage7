
import { MistralInterface } from '../src/interfaces/MistralInterface';
import { BaseService } from '../src/services/baseService';
import { LLMConversationType } from '@cktmcs/shared';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');

describe('MistralInterface', () => {
  let mistralInterface: MistralInterface;
  let mockService: BaseService;

  beforeEach(() => {
    mistralInterface = new MistralInterface();
    mockService = new BaseService('test-service', 'test-key', 'http://test.com', ['mistral']);
  });

  describe('chat', () => {
    it('should make a POST request to the Mistral API and return the response', async () => {
      const mockResponse = {
        data: {
          choices: [
            {
              message: {
                content: 'Hello from Mistral!',
              },
            },
          ],
        },
      };
      (axios.post as jest.Mock).mockResolvedValue(mockResponse);

      const response = await mistralInterface.chat(mockService, [{ role: 'user', content: 'test' }], {});

      expect(axios.post).toHaveBeenCalledWith(
        'http://test.com/chat/completions',
        expect.any(Object),
        expect.any(Object)
      );
      expect(response).toBe('Hello from Mistral!');
    });
  });

  describe('convert', () => {
    it('should call the chat method for text-to-text conversion', async () => {
      const spy = jest.spyOn(mistralInterface, 'chat').mockResolvedValue('test');

      await mistralInterface.convert(mockService, LLMConversationType.TextToText, { prompt: 'test' });

      expect(spy).toHaveBeenCalled();
    });
  });
});
