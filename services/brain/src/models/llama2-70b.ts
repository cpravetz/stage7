import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class Llama270bModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 85,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 88
            }],
            [LLMConversationType.TextToCode, {
                costScore: 85,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 88
            }],
            [LLMConversationType.CodeToText, {
                costScore: 85,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 88
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 85,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 88
            }]
        ]);

        super({
            name: "meta-llama/Llama-2-70b-chat-hf",
            modelName: "meta-llama/Llama-2-70b-chat-hf",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 4096, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.TextToText, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new Llama270bModel();
export default aiModel;