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
            name: "google/gemini-1.5-pro-vision",
            modelName: "gemini-1.5-pro-vision",
            interfaceName: "gemini",
            serviceName: "gemini",
            tokenLimit: 8192, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText]
        });
    }
}

const aiModel = new LlamaGeminiModel();
export default aiModel;