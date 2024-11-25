import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class LlamaGeminiModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }]
        ]);

        super({
            name: "google/gemini-flash-1.5-exp",
            modelName: "google/gemini-flash-1.5-exp",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 8192, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText]
        });
    }
}

const aiModel = new LlamaGeminiModel();
export default aiModel;