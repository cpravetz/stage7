import { Brain } from '../src/Brain';
import { ModelManager } from '../src/utils/modelManager';
import { Model } from '../src/models/Model';
import express from 'express';
import request from 'supertest';

jest.mock('../src/utils/modelManager');
jest.mock('../src/models/Model');

describe('Brain', () => {
  let brain: Brain;
  let app: express.Application;

  beforeEach(() => {
    jest.clearAllMocks();
    brain = new Brain();
    app = (brain as any).app;
  });

  describe('processThread', () => {
    it('should process a valid thread and return a response', async () => {
      const mockModel = {
        generate: jest.fn().mockResolvedValue('Generated response'),
      };
      (ModelManager.prototype.selectModel as jest.Mock).mockReturnValue(mockModel);

      const thread = {
        exchanges: [{ sender: 'user', message: 'Hello' }],
        optimization: 'accuracy',
      };

      const response = await brain.processThread(thread);

      expect(response).toBe('Generated response');
      expect(mockModel.generate).toHaveBeenCalledWith(['Hello'], expect.any(Object));
    });

    it('should throw an error for an empty thread', async () => {
      const thread = { exchanges: [] };

      await expect(brain.processThread(thread)).rejects.toThrow('Thread must contain non-empty exchanges array');
    });

    it('should throw an error when no suitable model is found', async () => {
      (ModelManager.prototype.selectModel as jest.Mock).mockReturnValue(undefined);

      const thread = {
        exchanges: [{ sender: 'user', message: 'Hello' }],
      };

      await expect(brain.processThread(thread)).rejects.toThrow('No suitable model found.');
    });
  });

  describe('API endpoints', () => {
    it('should process a chat request', async () => {
      const mockProcessThread = jest.spyOn(brain, 'processThread').mockResolvedValue('Mocked response');

      const response = await request(app)
        .post('/chat')
        .send({ exchanges: [{ sender: 'user', message: 'Hello' }] });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ response: 'Mocked response' });
      expect(mockProcessThread).toHaveBeenCalled();
    });

    it('should return LLM call count', async () => {
      (brain as any).llmCalls = 5;

      const response = await request(app).get('/getLLMCalls');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ llmCalls: 5 });
    });

    it('should return available models', async () => {
      const mockModels = ['model1', 'model2'];
      jest.spyOn(brain, 'getAvailableModels').mockReturnValue(mockModels);

      const response = await request(app).get('/models');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ models: mockModels });
    });
  });
});