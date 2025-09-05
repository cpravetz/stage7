
import { GroqService } from '../src/services/GroqService';

describe('GroqService', () => {
  it('should create a new GroqService with the correct properties', () => {
    const service = new GroqService();

    expect(service.serviceName).toBe('groq');
    expect(service.baseUrl).toBe('https://api.groq.com/openai/v1');
    expect(service.interfaces).toEqual(['groq']);
  });

  it('should handle rate limit errors and set a cooldown', () => {
    const service = new GroqService();
    const error = { message: 'Please try again in 1m30s' };

    service.handleRateLimitError(error);

    expect(service.isAvailable()).toBe(false);
  });
});
