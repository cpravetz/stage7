
import { GeminiService } from '../src/services/GeminiService';

describe('GeminiService', () => {
  it('should create a new GeminiService with the correct properties', () => {
    const service = new GeminiService();

    expect(service.serviceName).toBe('gemini');
    expect(service.baseUrl).toBe('https://generativelanguage.googleapis.com/v1beta');
    expect(service.interfaces).toEqual(['gemini']);
  });
});
