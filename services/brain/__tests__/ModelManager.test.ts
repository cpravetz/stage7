import { ModelManager, OptimizationType } from '../src/utils/modelManager';
import { LLMConversionType, Model } from '../src/models/Model';
import { ModelInterface } from '../src/interfaces/ModelInterface';

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn().mockResolvedValue(['model1.ts', 'model2.ts']),
  },
}));

jest.mock('path', () => ({
  join: jest.fn().mockReturnValue('/mocked/path'),
}));

// Mock the dynamic imports
jest.mock('/mocked/path/model1.ts', () => ({
  default: {
    name: 'Model1',
    interfaceKey: 'interface1',
    contentConversation: [LLMConversionType.TextToText],
    costScore: 0.8,
    accuracyScore: 0.7,
    creativityScore: 0.6,
    speedScore: 0.9,
  },
}), { virtual: true });

jest.mock('/mocked/path/model2.ts', () => ({
  default: {
    name: 'Model2',
    interfaceKey: 'interface2',
    contentConversation: [LLMConversionType.TextToText],
    costScore: 0.7,
    accuracyScore: 0.8,
    creativityScore: 0.9,
    speedScore: 0.6,
  },
}), { virtual: true });

describe('ModelManager', () => {
  let modelManager: ModelManager;

  beforeEach(() => {
    modelManager = new ModelManager();
    // Mock the interfaces
    (modelManager as any).interfaces.set('interface1', {} as ModelInterface);
    (modelManager as any).interfaces.set('interface2', {} as ModelInterface);
  });

  describe('selectModel', () => {
    it('should select the model with the highest cost score when optimizing for cost', () => {
      const result = modelManager.selectModel('cost');
      expect(result?.model.name).toBe('Model1');
    });

    it('should select the model with the highest accuracy score when optimizing for accuracy', () => {
      const result = modelManager.selectModel('accuracy');
      expect(result?.model.name).toBe('Model2');
    });

    it('should select the model with the highest creativity score when optimizing for creativity', () => {
      const result = modelManager.selectModel('creativity');
      expect(result?.model.name).toBe('Model2');
    });

    it('should select the model with the highest speed score when optimizing for speed', () => {
      const result = modelManager.selectModel('speed');
      expect(result?.model.name).toBe('Model1');
    });

    it('should return undefined when no compatible models are found', () => {
      // Override the models with incompatible conversion types
      (modelManager as any).models = new Map([
        ['model1', { contentConversation: [LLMConversionType.TextToImage] }],
        ['model2', { contentConversation: [LLMConversionType.TextToImage] }],
      ]);
      const result = modelManager.selectModel('cost');
      expect(result).toBeUndefined();
    });

    it('should return undefined when no interface is found for the selected model', () => {
      // Remove the interfaces
      (modelManager as any).interfaces.clear();
      const result = modelManager.selectModel('cost');
      expect(result).toBeUndefined();
    });
  });
});