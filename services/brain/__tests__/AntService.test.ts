
import { AntService } from '../src/services/AntService';

describe('AntService', () => {
  it('should create a new AntService with the correct properties', () => {
    const service = new AntService();

    expect(service.serviceName).toBe('AntService');
    expect(service.baseUrl).toBe('https://api.anthropic.com/v1/messages');
    expect(service.interfaces).toEqual(['anthropic']);
  });
});
