import { ToolDiscovery } from '../services/ToolDiscovery';
import { Tool } from '../types';

describe('ToolDiscovery', () => {
  let discovery: ToolDiscovery;
  let mockRegistry: { register: jest.Mock };

  beforeEach(() => {
    discovery = new ToolDiscovery();
    mockRegistry = { register: jest.fn() };
  });

  describe('search', () => {
    it('should return empty results when network is disabled', async () => {
      const result = await discovery.search('weather');
      expect(result.found).toBe(false);
      expect(result.tools).toHaveLength(0);
      expect(result.error).toContain('Network disabled');
    });
  });

  describe('discoverAndRegister', () => {
    it('should return undefined when network is disabled', async () => {
      const result = await discovery.discoverAndRegister('weather tool', mockRegistry);
      expect(result).toBeUndefined();
    });
  });
});
