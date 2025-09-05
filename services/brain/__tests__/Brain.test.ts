import { Brain } from '../src/Brain';
import express from 'express';
import { LLMConversationType } from '@cktmcs/shared';
import { ModelManager } from '../src/utils/modelManager';

jest.mock('express', () => {
  const mockExpress = {
    use: jest.fn(),
    post: jest.fn(),
    get: jest.fn(),
    listen: jest.fn(),
  };
  return jest.fn(() => mockExpress);
});

jest.mock('axios');
jest.mock('../src/utils/modelManager');

describe('Brain', () => {
  let brain: Brain;
  let mockExpress: any;

  beforeEach(() => {
    jest.clearAllMocks();
    brain = new Brain();
    mockExpress = (express as jest.MockedFunction<typeof express>)();
  });

  describe('init', () => {
    it('should set up express routes and start the server', () => {
      expect(mockExpress.use).toHaveBeenCalled();
      expect(mockExpress.post).toHaveBeenCalledWith('/chat', expect.any(Function));
      expect(mockExpress.get).toHaveBeenCalledWith('/getLLMCalls', expect.any(Function));
      expect(mockExpress.get).toHaveBeenCalledWith('/models', expect.any(Function));
      expect(mockExpress.listen).toHaveBeenCalledWith(expect.any(Number), expect.any(Function));
    });
  });

  describe('generate', () => {
    it('should generate a response using the selected model', async () => {
      const mockReq = {
        body: {
          modelName: 'TestModel',
          optimization: 'speed',
          conversationType: LLMConversationType.TextToText,
          convertParams: { prompt: 'Hello' },
        },
      } as express.Request;
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as express.Response;

      const mockSelectedModel = {
        name: 'TestModel',
        modelName: 'TestModel',
        isAvailable: () => true,
        service: {},
        llminterface: { convert: jest.fn().mockResolvedValue('Generated response') },
        tokenLimit: 8192,
      };
      (ModelManager.prototype.getModel as jest.Mock).mockReturnValue(mockSelectedModel);
      (ModelManager.prototype.trackModelRequest as jest.Mock).mockReturnValue('requestId123');
      (ModelManager.prototype.trackModelResponse as jest.Mock).mockImplementation(() => {});

      await brain.generate(mockReq, mockRes);

      expect(mockSelectedModel.llminterface.convert).toHaveBeenCalledWith(
        mockSelectedModel.service,
        LLMConversationType.TextToText,
        { prompt: 'Hello', max_length: 8192 }
      );
      expect(mockRes.json).toHaveBeenCalledWith({ result: 'Generated response', mimeType: 'text/plain' });
      expect(ModelManager.prototype.trackModelRequest).toHaveBeenCalled();
      expect(ModelManager.prototype.trackModelResponse).toHaveBeenCalled();
    });

    it('should handle model selection failure and return 500', async () => {
      const mockReq = {
        body: {
          optimization: 'speed',
          conversationType: LLMConversationType.TextToText,
        },
      } as express.Request;
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as express.Response;

      (ModelManager.prototype.selectModel as jest.Mock).mockReturnValue(null);

      await brain.generate(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'All model attempts failed. Last error: No suitable model found' });
    });

    it('should retry on model conversion error and blacklist on consecutive timeouts', async () => {
      const mockReq = {
        body: {
          optimization: 'speed',
          conversationType: LLMConversationType.TextToText,
          convertParams: { prompt: 'Hello' },
        },
      } as express.Request;
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as express.Response;

      const mockSelectedModel = {
        name: 'TestModel',
        modelName: 'TestModel',
        isAvailable: () => true,
        service: {},
        llminterface: { convert: jest.fn() },
        tokenLimit: 8192,
      };

      (ModelManager.prototype.selectModel as jest.Mock).mockReturnValue(mockSelectedModel);
      (ModelManager.prototype.trackModelRequest as jest.Mock).mockReturnValue('requestId123');
      (ModelManager.prototype.trackModelResponse as jest.Mock).mockImplementation(() => {});
      (ModelManager.prototype.blacklistModel as jest.Mock).mockImplementation(() => {});

      // Simulate 3 consecutive timeouts
      mockSelectedModel.llminterface.convert
        .mockRejectedValueOnce(new Error('timeout error'))
        .mockRejectedValueOnce(new Error('system_error'))
        .mockResolvedValueOnce('Final response'); // Should resolve on 3rd attempt (after 2 failures)

      await brain.generate(mockReq, mockRes);

      expect(mockSelectedModel.llminterface.convert).toHaveBeenCalledTimes(3);
      expect(ModelManager.prototype.blacklistModel).toHaveBeenCalledWith('TestModel', expect.any(Date));
      expect(mockRes.json).toHaveBeenCalledWith({ result: 'Final response', mimeType: 'text/plain' });
    });

    it('should filter internal parameters from convertParams', async () => {
      const mockReq = {
        body: {
          modelName: 'TestModel',
          conversationType: LLMConversationType.TextToText,
          convertParams: {
            prompt: 'Hello',
            response_format: { type: 'json_object' },
            optimization: 'speed',
            customParam: 'value',
          },
        },
      } as express.Request;
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as express.Response;

      const mockSelectedModel = {
        name: 'TestModel',
        modelName: 'TestModel',
        isAvailable: () => true,
        service: {},
        llminterface: { convert: jest.fn().mockResolvedValue('Generated response') },
        tokenLimit: 8192,
      };
      (ModelManager.prototype.getModel as jest.Mock).mockReturnValue(mockSelectedModel);
      (ModelManager.prototype.trackModelRequest as jest.Mock).mockReturnValue('requestId123');
      (ModelManager.prototype.trackModelResponse as jest.Mock).mockImplementation(() => {});

      await brain.generate(mockReq, mockRes);

      expect(mockSelectedModel.llminterface.convert).toHaveBeenCalledWith(
        mockSelectedModel.service,
        LLMConversationType.TextToText,
        { prompt: 'Hello', customParam: 'value', max_length: 8192 }
      );
    });
  });

  describe('chat', () => {
    it('should process chat request and return response', async () => {
      const mockReq = {
        body: {
          exchanges: [{ role: 'user', message: 'Hello' }],
          optimization: 'speed',
          optionals: { max_length: 100, temperature: 0.7 },
          conversationType: LLMConversationType.TextToText,
        },
      } as express.Request;
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as express.Response;

      const mockSelectedModel = {
        model: { name: 'TestModel', interfaceKey: 'TestInterface' },
        interface: { generate: jest.fn().mockResolvedValue('AI response') },
      };
      (ModelManager.prototype.selectModel as jest.Mock).mockReturnValue(mockSelectedModel);

      await brain.chat(mockReq, mockRes);

      expect(mockSelectedModel.interface.generate).toHaveBeenCalledWith(
        [{ role: 'user', content: 'Hello' }],
        { max_length: 100, temperature: 0.7 }
      );
      expect(mockRes.json).toHaveBeenCalledWith({
        response: 'AI response',
        mimeType: 'text/plain',
      });
    });

    it('should handle errors and return 500 status', async () => {
      const mockReq = {
        body: {},
      } as express.Request;
      const mockRes = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
      } as unknown as express.Response;

      (ModelManager.prototype.selectModel as jest.Mock).mockReturnValue(null);

      await brain.chat(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'No suitable model found.' });
    });
  });

  describe('getAvailableModels', () => {
    it('should return available models', () => {
      const mockModels = ['model1', 'model2'];
      (ModelManager.prototype.getAvailableModels as jest.Mock).mockReturnValue(mockModels);

      const result = brain.getAvailableModels();

      expect(result).toEqual(mockModels);
    });
  });

  describe('createThreadFromRequest', () => {
    it('should create a thread object from a basic request body', () => {
      const mockReqBody = {
        exchanges: [{ role: 'user', content: 'Hello' }],
        optimization: 'speed',
        conversationType: LLMConversationType.TextToText,
        optionals: { temperature: 0.5 },
        responseType: 'text',
      };
      const mockReq = { body: mockReqBody } as express.Request;

      const thread = (brain as any).createThreadFromRequest(mockReq);

      expect(thread).toEqual({
        exchanges: [{ role: 'user', content: 'Hello' }],
        optimization: 'speed',
        conversationType: LLMConversationType.TextToText,
        optionals: { temperature: 0.5 },
        responseType: 'text',
      });
    });

    it('should handle messages as exchanges and default values', () => {
      const mockReqBody = {
        messages: [{ role: 'user', content: 'Hi' }],
      };
      const mockReq = { body: mockReqBody } as express.Request;

      const thread = (brain as any).createThreadFromRequest(mockReq);

      expect(thread.exchanges).toEqual([{ role: 'user', content: 'Hi' }]);
      expect(thread.optimization).toBe('accuracy'); // Default
      expect(thread.conversationType).toBe(LLMConversationType.TextToText); // Default
      expect(thread.responseType).toBe('text'); // Default
    });

    it('should detect and configure for JSON plan requests', () => {
      const mockReqBody = {
        exchanges: [{ role: 'user', content: 'For PLAN responses, return a JSON object with this exact structure:' }],
        conversationType: LLMConversationType.TextToText,
      };
      const mockReq = { body: mockReqBody } as express.Request;

      const thread = (brain as any).createThreadFromRequest(mockReq);

      expect(thread.optionals).toEqual({
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });
      expect(thread.exchanges[0].role).toBe('system');
      expect(thread.exchanges[0].content).toContain('You are a JSON generation assistant');
    });

    it('should not add system message if already present for JSON plan requests', () => {
      const mockReqBody = {
        exchanges: [
          { role: 'system', content: 'Existing system message' },
          { role: 'user', content: 'For PLAN responses, return a JSON object with this exact structure:' }
        ],
        conversationType: LLMConversationType.TextToText,
      };
      const mockReq = { body: mockReqBody } as express.Request;

      const thread = (brain as any).createThreadFromRequest(mockReq);

      expect(thread.exchanges[0].role).toBe('system');
      expect(thread.exchanges[0].content).toBe('Existing system message');
      expect(thread.exchanges.length).toBe(2);
    });

    it('should set responseType to json if conversationType is TextToJSON', () => {
      const mockReqBody = {
        conversationType: LLMConversationType.TextToJSON,
      };
      const mockReq = { body: mockReqBody } as express.Request;

      const thread = (brain as any).createThreadFromRequest(mockReq);

      expect(thread.responseType).toBe('json');
    });
  });

  describe('filterInternalParameters', () => {
    it('should filter out internal parameters from an object', () => {
      const optionals = {
        response_format: { type: 'json_object' },
        response_type: 'text',
        conversationType: LLMConversationType.TextToText,
        optimization: 'speed',
        optionals: { someOther: 'value' },
        customParam: 'value',
        anotherParam: 123,
      };

      const filtered = (brain as any).filterInternalParameters(optionals);

      expect(filtered).toEqual({
        customParam: 'value',
        anotherParam: 123,
      });
    });

    it('should return an empty object if no external parameters are present', () => {
      const optionals = {
        response_format: { type: 'json_object' },
        response_type: 'text',
      };

      const filtered = (brain as any).filterInternalParameters(optionals);

      expect(filtered).toEqual({});
    });

    it('should return an empty object if input is empty', () => {
      const optionals = {};

      const filtered = (brain as any).filterInternalParameters(optionals);

      expect(filtered).toEqual({});
    });
  });

  describe('determineMimeType', () => {
    it('should return text/html for HTML content', () => {
      const result = (brain as any).determineMimeType('<html><body>Test</body></html>');
      expect(result).toBe('text/html');
    });

    it('should return text/plain for non-HTML content', () => {
      const result = (brain as any).determineMimeType('Plain text response');
      expect(result).toBe('text/plain');
    });

    it('should return application/json for valid JSON content', () => {
      const result = (brain as any).determineMimeType('{"key": "value"}');
      expect(result).toBe('application/json');
    });

    it('should return application/json for valid JSON array content', () => {
      const result = (brain as any).determineMimeType('[1, 2, 3]');
      expect(result).toBe('application/json');
    });

    it('should return text/plain for invalid JSON content', () => {
      const result = (brain as any).determineMimeType('{key: value}');
      expect(result).toBe('text/plain');
    });

    it('should return text/plain for empty or non-string response', () => {
      expect((brain as any).determineMimeType(null)).toBe('text/plain');
      expect((brain as any).determineMimeType(undefined)).toBe('text/plain');
      expect((brain as any).determineMimeType(123)).toBe('text/plain');
      expect((brain as any).determineMimeType('')).toBe('text/plain');
    });
  });
});