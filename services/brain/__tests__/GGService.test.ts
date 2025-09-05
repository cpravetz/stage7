
import { GGService } from '../src/services/GGService';

describe('GGService', () => {
  it('should create a new GGService with the correct properties', () => {
    const service = new GGService();

    expect(service.serviceName).toBe('GGService');
    expect(service.interfaces).toEqual(['gemini']);
  });
});
