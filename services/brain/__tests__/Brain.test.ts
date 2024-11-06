import { Brain } from '../src/Brain';
import express from 'express';
import axios from 'axios';
import { ModelManager } from '../src/utils/modelManager';
import { LLMConversionType } from '../src/models/Model';

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

  describe('chat', () => {
    it('should process chat request and return response', async () => {
      const mockReq = {
        body: {
          exchanges: [{ role: 'user', message: 'Hello' }],
          optimization: 'speed',
          metadata: { max_length: 100, temperature: 0.7 },
          conversionType: LLMConversionType.TextToText,
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
        [{ role: 'user', message: 'Hello' }],
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

  describe('determineMimeType', () => {
    it('should return text/html for HTML content', () => {
      const result = (brain as any).determineMimeType('<html><body>Test</body></html>');
      expect(result).toBe('text/html');
    });

    it('should return text/plain for non-HTML content', () => {
      const result = (brain as any).determineMimeType('Plain text response');
      expect(result).toBe('text/plain');
    });
  });
});