import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class CloudflareWorkersAIModel extends BaseModel {
    constructor() {
        super({
            name: 'cloudflare-workers-ai/llama-3.2-1b-instruct', // Unique model name
            modelName: '@cf/meta/llama-3.2-1b-instruct', // Cloudflare's specific model identifier
            serviceName: 'cloudflare-workers-ai', // lowercase of CloudflareWorkersAIService class name
            interfaceName: 'cloudflare-workers-ai', // lowercase of CloudflareWorkersAIInterface class name
            tokenLimit: 2048, // Example token limit, adjust as needed
            scoresByConversationType: new Map<LLMConversationType, ModelScore>([
                [LLMConversationType.TextToText, {
                    speedScore: 80,
                    accuracyScore: 70,
                    creativityScore: 60,
                    costScore: 99, 
                }],
                [LLMConversationType.TextToJSON, {
                    speedScore: 80,
                    accuracyScore: 70,
                    creativityScore: 60,
                    costScore: 99, 
                }],
            ]),
            contentConversation: [
                LLMConversationType.TextToJSON,
            ],
        });
    }
}

export default new CloudflareWorkersAIModel();
