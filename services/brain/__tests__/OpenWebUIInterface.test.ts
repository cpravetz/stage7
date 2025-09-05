
import { OpenWebUIInterface } from '../src/interfaces/OpenWebUIInterface';
import { BaseService } from '../src/services/baseService';
import { LLMConversationType } from '@cktmcs/shared';

// Mock dependencies
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('OpenWebUIInterface', () => {
  let owuiInterface: OpenWebUIInterface;
  let mockService: BaseService;

  beforeEach(() => {
    owuiInterface = new OpenWebUIInterface();
    mockService = new BaseService('test-service', 'test-key', 'http://test.com', ['openwebui']);
  });

  describe('chat', () => {
    it('should make a POST request to the OpenWebUI API and return the response', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          choices: [
            {
              message: {
                content: 'Hello from OpenWebUI!',
              },
            },
          ],
        }),
      });

      const response = await owuiInterface.chat(mockService, [{ role: 'user', content: 'test' }], {});

      expect(mockFetch).toHaveBeenCalledWith(
        'http://test.com/api/chat/completions',
        expect.any(Object)
      );
      expect(response).toBe('Hello from OpenWebUI!');
    });
  });

  describe('convert', () => {
    it('should call the chat method for text-to-text conversion', async () => {
      const spy = jest.spyOn(owuiInterface, 'chat').mockResolvedValue('test');

      await owuiInterface.convert(mockService, LLMConversationType.TEXT_TO_TEXT, { prompt: 'test' });

      expect(spy).toHaveBeenCalled();
    });
  });
});
