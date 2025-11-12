
import { ORService } from '../src/services/ORService';

describe('ORService', () => {
  it('should create a new ORService with the correct properties', () => {
    const service = new ORService();

    expect(service.serviceName).toBe('ORService');
    expect(service.baseUrl).toBe('https://openrouter.ai/api/v1/');
    expect(service.interfaces).toEqual(['openrouter']);
  });
});
