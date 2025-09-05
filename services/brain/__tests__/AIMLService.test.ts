
import { AIMLService } from '../src/services/AIMLService';

describe('AIMLService', () => {
  it('should create a new AIMLService with the correct properties', () => {
    const service = new AIMLService();

    expect(service.serviceName).toBe('AIMLService');
    expect(service.baseUrl).toBe('https://api.aimlapi.com/v1/');
    expect(service.interfaces).toEqual(['openai']);
  });
});
