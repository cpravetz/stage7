import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT4Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, { costScore: 60, accuracyScore: 95, creativityScore: 93, speedScore: 85 }],
            [LLMConversationType.TextToCode, { costScore: 65, accuracyScore: 92, creativityScore: 90, speedScore: 83 }],
            [LLMConversationType.CodeToText, { costScore: 65, accuracyScore: 93, creativityScore: 91, speedScore: 84 }],
            [LLMConversationType.ImageToText, { costScore: 70, accuracyScore: 90, creativityScore: 88, speedScore: 82 }],
        ]);

        super({
            name: "openai/gpt-4",
            modelName: "gpt-4",
            interfaceName: "openai",
            serviceName: "OAService",
            tokenLimit: 8192,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [
                LLMConversationType.TextToCode,
                LLMConversationType.CodeToText,
                LLMConversationType.ImageToText,
                LLMConversationType.TextToText
            ]
        });
    }
}

const aiModel = new GPT4Model();
export default aiModel;