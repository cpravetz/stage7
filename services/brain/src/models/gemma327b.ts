import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class Gemma327BModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }],
            [LLMConversationType.ImageToText, {
                costScore: 100,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }],
        ]);

        super({
            name: "google/gemma-3-27b-it",
            modelName: "gemma-3-27b-it",
            interfaceName: "gemini",
            serviceName: "gemini",
            tokenLimit: 131072, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new Gemma327BModel();
export default aiModel;