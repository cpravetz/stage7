import CloudflareWorkersAIModel from '../src/models/cloudflareWorkersAI';

describe('CloudflareWorkersAIModel', () => {
    it('should be an instance of CloudflareWorkersAIModel', () => {
        expect(CloudflareWorkersAIModel).toBeDefined();
        expect(CloudflareWorkersAIModel.name).toBe('cloudflare-workers-ai/llama-3-8b-instruct');
    });

    // Add more tests here to cover the functionality of CloudflareWorkersAIModel
});
