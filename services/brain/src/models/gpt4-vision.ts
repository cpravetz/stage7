import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT4VisionModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, { costScore: 60, accuracyScore: 94, creativityScore: 92, speedScore: 85 }],
            [LLMConversationType.TextToCode, { costScore: 60, accuracyScore: 94, creativityScore: 92, speedScore: 85 }],
            [LLMConversationType.ImageToText, { costScore: 60, accuracyScore: 94, creativityScore: 92, speedScore: 85 }],
        ]);

        super({
            name: "openai/gpt-4-vision",
            modelName: "gpt-4-vision-preview",
            interfaceName: "openai",
            serviceName: "OAService",
            tokenLimit: 128000, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new GPT4VisionModel();
export default aiModel;