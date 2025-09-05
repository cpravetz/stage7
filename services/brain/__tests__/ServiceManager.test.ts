
import { ServiceManager } from '../src/utils/serviceManager';
import { BaseService } from '../src/services/baseService';
import fs from 'fs';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
  },
}));

describe('ServiceManager', () => {
  let serviceManager: ServiceManager;

  beforeEach(() => {
    // Reset the singleton instance
    jest.resetModules();
  });

  it('should load services on initialization', async () => {
    const mockFiles = ['OAService.ts', 'AntService.ts'];
    (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);

    // Mock the dynamic imports
    jest.mock('../src/services/OAService', () => ({
      default: new BaseService('OpenAI'),
    }), { virtual: true });
    jest.mock('../src/services/AntService', () => ({
      default: new BaseService('Anthropic'),
    }), { virtual: true });

    const { ServiceManager } = await import('../src/utils/serviceManager');
    serviceManager = new ServiceManager();
    
    const services = serviceManager.getServices();
    expect(services.size).toBe(2);
    expect(services.has('openai')).toBe(true);
    expect(services.has('anthropic')).toBe(true);
  });
});
