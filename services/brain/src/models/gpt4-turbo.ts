import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT4TurboModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, { costScore: 65, accuracyScore: 96, creativityScore: 94, speedScore: 88 }],
            [LLMConversationType.TextToCode, { costScore: 65, accuracyScore: 96, creativityScore: 94, speedScore: 88 }],
            [LLMConversationType.CodeToText, { costScore: 65, accuracyScore: 96, creativityScore: 94, speedScore: 88 }],
            [LLMConversationType.ImageToText, { costScore: 65, accuracyScore: 96, creativityScore: 94, speedScore: 88 }],
        ]);

        super({
            name: "openai/gpt-4-turbo",
            modelName: "gpt-4-turbo-preview",
            interfaceName: "openai",
            serviceName: "OAIService",
            tokenLimit: 128000, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.ImageToText, LLMConversationType.TextToText]
        });
    }
}

const aiModel = new GPT4TurboModel();
export default aiModel;