
import { CloudflareWorkersAIService } from '../src/services/CloudflareWorkersAIService';

describe('CloudflareWorkersAIService', () => {
  it('should create a new CloudflareWorkersAIService with the correct properties', () => {
    const service = new CloudflareWorkersAIService();

    expect(service.serviceName).toBe('cloudflare-workers-ai');
    expect(service.interfaces).toEqual(['cloudflare-workers-ai']);
  });
});
