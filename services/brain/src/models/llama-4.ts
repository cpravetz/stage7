import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class Llama4Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 95,
                accuracyScore: 95,
                creativityScore: 95,
                speedScore: 95
            }],
            [LLMConversationType.TextToCode, {
                costScore: 95,
                accuracyScore: 95,
                creativityScore: 95,
                speedScore: 95
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 95,
                accuracyScore: 95,
                creativityScore: 95,
                speedScore: 95
            }]
        ]);

        super({
            name: "groq/llama-4",
            modelName: "meta-llama/llama-4-scout-17b-16e-instruct",
            interfaceName: "groq",
            serviceName: "groq",
            tokenLimit: 30000, // Llama 4 has a large context window
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new Llama4Model();
export default aiModel;
