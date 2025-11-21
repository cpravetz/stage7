import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class LlamaVisionModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.ImageToText, {
                costScore: 100,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }]
        ]);

        super({
            name: "meta-llama/llama-3.2-11b-vision-instruct",
            modelName: "meta-llama/llama-3.2-11b-vision-instruct",
            interfaceName: 'openrouter',
            serviceName: 'ORService',
            tokenLimit: 4096, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new LlamaVisionModel();
export default aiModel;