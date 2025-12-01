import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class LlamaGeminiModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 80,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }],
            [LLMConversationType.TextToCode, {
                costScore: 80,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 80,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }]
        ]);

        super({
            name: "google/gemini-flash-latest",
            modelName: "gemini-flash-latest",
            interfaceName: "gemini",
            serviceName: "gemini",
            tokenLimit: 1048570, 
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new LlamaGeminiModel();
export default aiModel;