
import { BaseModel, ModelScore } from '../src/models/baseModel';
import { LLMConversationType } from '@cktmcs/shared';
import { BaseInterface } from '../src/interfaces/baseInterface';
import { BaseService } from '../src/services/baseService';

// Mock dependencies
jest.mock('../src/interfaces/baseInterface');
jest.mock('../src/services/baseService');

describe('BaseModel', () => {
  let model: BaseModel;
  let mockInterface: jest.Mocked<BaseInterface>;
  let mockService: jest.Mocked<BaseService>;

  beforeEach(() => {
    const scores = new Map<LLMConversationType, ModelScore>([
      [LLMConversationType.TextToText, { costScore: 10, accuracyScore: 90, creativityScore: 80, speedScore: 70 }],
    ]);

    model = new BaseModel({
      name: 'test-model',
      modelName: 'test-model-name',
      interfaceName: 'test-interface',
      serviceName: 'test-service',
      tokenLimit: 1000,
      scoresByConversationType: scores,
      contentConversation: [LLMConversationType.TextToText],
    });

    mockInterface = new BaseInterface('test-interface') as jest.Mocked<BaseInterface>;
    mockService = new BaseService('test-service', 'key', 'url', ['test-interface']) as jest.Mocked<BaseService>;

    model.setProviders(mockInterface, mockService);
  });

  describe('getScore', () => {
    it('should return the correct score for a given conversation type', () => {
      const score = model.getScore(LLMConversationType.TextToText);
      expect(score.accuracyScore).toBe(90);
    });
  });

  describe('chat', () => {
    it('should call the chat method of the underlying interface', async () => {
      mockInterface.chat.mockResolvedValue('chat response');
      const response = await model.chat([{ role: 'user', content: 'hello' }], {});
      expect(mockInterface.chat).toHaveBeenCalled();
      expect(response).toBe('chat response');
    });
  });

  describe('convert', () => {
    it('should call the convert method of the underlying interface', async () => {
      mockInterface.convert.mockResolvedValue('converted content');
      const response = await model.convert(LLMConversationType.TextToText, { prompt: 'test' });
      expect(mockInterface.convert).toHaveBeenCalled();
      expect(response).toBe('converted content');
    });
  });

  describe('isAvailable', () => {
    it('should return true if the service is available and model name is not empty', () => {
      mockService.isAvailable.mockReturnValue(true);
      expect(model.isAvailable()).toBe(true);
    });

    it('should return false if the service is not available', () => {
      mockService.isAvailable.mockReturnValue(false);
      expect(model.isAvailable()).toBe(false);
    });
  });
});
