
import { HFService } from '../src/services/HFService';

describe('HFService', () => {
  it('should create a new HFService with the correct properties', () => {
    const service = new HFService();

    expect(service.serviceName).toBe('HFService');
    expect(service.baseUrl).toBe('https://api-inference.huggingface.co/models');
    expect(service.interfaces).toEqual(['huggingface']);
  });
});
