
import { OWService } from '../src/services/OWService';

describe('OWService', () => {
  it('should create a new OWService with the correct properties', () => {
    const service = new OWService();

    expect(service.serviceName).toBe('OWService');
    expect(service.baseUrl).toBe('https://knllm.dusdusdusd.com');
    expect(service.interfaces).toEqual(['openwebui']);
  });
});
