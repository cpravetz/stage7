import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class HFLlamaModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 100,
                creativityScore: 80,
                speedScore: 80
            }]
        ]);

        super({
            name: "hf/meta-llama/llama-3.2-3b-instruct",
            modelName: "meta-llama/llama-3.2-3b-instruct",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 4096, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText]
        });
    }
}

const aiModel = new HFLlamaModel();
export default aiModel;