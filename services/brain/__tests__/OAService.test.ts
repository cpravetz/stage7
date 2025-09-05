
import { OAService } from '../src/services/OAService';

describe('OAService', () => {
  it('should create a new OAService with the correct properties', () => {
    const service = new OAService();

    expect(service.serviceName).toBe('OAService');
    expect(service.baseUrl).toBe('https://api.openai.com/v1/');
    expect(service.interfaces).toEqual(['openai']);
  });
});
