
import { InterfaceManager } from '../src/utils/interfaceManager';
import { BaseInterface } from '../src/interfaces/baseInterface';
import fs from 'fs';

// Mock dependencies
jest.mock('fs', () => ({
  promises: {
    readdir: jest.fn(),
  },
}));

describe('InterfaceManager', () => {
  let interfaceManager: InterfaceManager;

  beforeEach(() => {
    // Reset the singleton instance
    jest.resetModules();
  });

  it('should load interfaces on initialization', async () => {
    const mockFiles = ['OpenAIInterface.ts', 'AnthropicInterface.ts'];
    (fs.promises.readdir as jest.Mock).mockResolvedValue(mockFiles);

    // Mock the dynamic imports
    jest.mock('../src/interfaces/OpenAIInterface', () => ({
      default: new BaseInterface('OpenAI'),
    }), { virtual: true });
    jest.mock('../src/interfaces/AnthropicInterface', () => ({
      default: new BaseInterface('Anthropic'),
    }), { virtual: true });

    const { InterfaceManager } = await import('../src/utils/interfaceManager');
    interfaceManager = new InterfaceManager();
    await interfaceManager.ready();

    const interfaces = interfaceManager.getInterfaces();
    expect(interfaces.size).toBe(2);
    expect(interfaces.has('openai')).toBe(true);
    expect(interfaces.has('anthropic')).toBe(true);
  });
});
