
import { MistralService } from '../src/services/MistralService';

describe('MistralService', () => {
  it('should create a new MistralService with the correct properties', () => {
    const service = new MistralService();

    expect(service.serviceName).toBe('MistralService');
    expect(service.baseUrl).toBe('https://api.mistral.ai/v1');
    expect(service.interfaces).toEqual(['mistral']);
  });
});
