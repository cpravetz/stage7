import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class LlamaGeminiModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }],
            [LLMConversationType.TextToCode, {
                costScore: 100,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 100,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }]
        ]);

        super({
            name: "google/gemini-flash-lite-latest",
            modelName: "gemini-flash-lite-latest",
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