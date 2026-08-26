import { ModelManager, OptimizationType } from '../src/utils/modelManager';
import { BaseModel } from '../src/models/baseModel';
import { LLMConversationType } from '@cktmcs/shared';
import { BaseInterface } from '../src/interfaces/baseInterface';
import { interfaceManager } from '../src/utils/interfaceManager';
import { serviceManager } from '../src/utils/serviceManager';

jest.mock('../src/utils/interfaceManager', () => ({
  interfaceManager: {
    interfaces: new Map(),
    ready: jest.fn().mockResolvedValue(undefined),
    getInterface: jest.fn(),
    getInterfaces: jest.fn(),
    getAllInterfaces: jest.fn(),
  },
}));

jest.mock('../src/utils/serviceManager', () => ({
  serviceManager: {
    services: new Map(),
    ready: jest.fn().mockResolvedValue(undefined),
    getService: jest.fn(),
    getServices: jest.fn(),
  },
}));

jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn().mockResolvedValue(['model1.ts', 'model2.ts']),
  },
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn().mockReturnValue('[]'),
  writeFileSync: jest.fn(),
}));

jest.mock('path', () => ({
  join: jest.fn().mockReturnValue('/mocked/path'),
  resolve: jest.fn().mockReturnValue('/mocked/path/performance-metrics.json'),
}));

describe('ModelManager', () => {
  let modelManager: ModelManager;

  beforeEach(() => {
    (interfaceManager as any).interfaces.set('interface1', {} as BaseInterface);
    (interfaceManager as any).interfaces.set('interface2', {} as BaseInterface);
    (serviceManager as any).services.set('Service1', { isAvailable: () => true });
    (serviceManager as any).services.set('Service2', { isAvailable: () => true });

    (interfaceManager as any).getInterface.mockImplementation((name: string) => {
      return (interfaceManager as any).interfaces.get(name.toLowerCase());
    });
    (serviceManager as any).getService.mockImplementation((name: string) => {
      return (serviceManager as any).services.get(name);
    });

    modelManager = new ModelManager();
    (modelManager as any).models = new Map();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('selectModel', () => {
    it('should select the model with the highest cost score when optimizing for cost', () => {
      (modelManager as any).models = new Map([
        ['model1', { name: 'Model1', interfaceName: 'interface1', serviceName: 'Service1', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText], getScoresForConversationType: () => ({ costScore: 0.8, accuracyScore: 0.7, creativityScore: 0.6, speedScore: 0.9 }) }],
        ['model2', { name: 'Model2', interfaceName: 'interface2', serviceName: 'Service2', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText], getScoresForConversationType: () => ({ costScore: 0.7, accuracyScore: 0.8, creativityScore: 0.9, speedScore: 0.6 }) }],
      ]);
      const result = modelManager.selectModel('cost', LLMConversationType.TextToText);
      expect(result?.name).toBe('Model2');
    });

    it('should select the model with the highest accuracy score when optimizing for accuracy', () => {
      (modelManager as any).models = new Map([
        ['model1', { name: 'Model1', interfaceName: 'interface1', serviceName: 'Service1', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText], getScoresForConversationType: () => ({ costScore: 0.8, accuracyScore: 0.7, creativityScore: 0.6, speedScore: 0.9 }) }],
        ['model2', { name: 'Model2', interfaceName: 'interface2', serviceName: 'Service2', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText], getScoresForConversationType: () => ({ costScore: 0.7, accuracyScore: 0.8, creativityScore: 0.9, speedScore: 0.6 }) }],
      ]);
      const result = modelManager.selectModel('accuracy', LLMConversationType.TextToText);
      expect(result?.name).toBe('Model2');
    });

    it('should select the model with the highest creativity score when optimizing for creativity', () => {
      (modelManager as any).models = new Map([
        ['model1', { name: 'Model1', interfaceName: 'interface1', serviceName: 'Service1', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText], getScoresForConversationType: () => ({ costScore: 0.8, accuracyScore: 0.7, creativityScore: 0.6, speedScore: 0.9 }) }],
        ['model2', { name: 'Model2', interfaceName: 'interface2', serviceName: 'Service2', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText], getScoresForConversationType: () => ({ costScore: 0.7, accuracyScore: 0.8, creativityScore: 0.9, speedScore: 0.6 }) }],
      ]);
      const result = modelManager.selectModel('creativity', LLMConversationType.TextToText);
      expect(result?.name).toBe('Model2');
    });

    it('should select the model with the highest speed score when optimizing for speed', () => {
      (modelManager as any).models = new Map([
        ['model1', { name: 'Model1', interfaceName: 'interface1', serviceName: 'Service1', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText], getScoresForConversationType: () => ({ costScore: 0.8, accuracyScore: 0.7, creativityScore: 0.6, speedScore: 0.9 }) }],
        ['model2', { name: 'Model2', interfaceName: 'interface2', serviceName: 'Service2', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText], getScoresForConversationType: () => ({ costScore: 0.7, accuracyScore: 0.8, creativityScore: 0.9, speedScore: 0.6 }) }],
      ]);
      const result = modelManager.selectModel('speed', LLMConversationType.TextToText);
      expect(result?.name).toBe('Model1');
    });

    it('should return null when no compatible models are found', () => {
      (modelManager as any).models = new Map([
        ['model1', { name: 'Model1', interfaceName: 'interface1', serviceName: 'Service1', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToImage] }],
        ['model2', { name: 'Model2', interfaceName: 'interface2', serviceName: 'Service2', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToImage] }],
      ]);
      const result = modelManager.selectModel('cost', LLMConversationType.TextToText);
      expect(result).toBeNull();
    });

    it('should return null when no interface is found for the selected model', () => {
      (modelManager as any).models = new Map([
        ['model1', { name: 'Model1', interfaceName: 'interface1', serviceName: 'Service1', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText] }],
        ['model2', { name: 'Model2', interfaceName: 'interface2', serviceName: 'Service2', tokenLimit: 4096, contentConversation: [LLMConversationType.TextToText] }],
      ]);
      (interfaceManager as any).interfaces.clear();
      (interfaceManager as any).getInterface.mockImplementation(() => undefined);
      const result = modelManager.selectModel('cost', LLMConversationType.TextToText);
      expect(result).toBeNull();
    });
  });
});
