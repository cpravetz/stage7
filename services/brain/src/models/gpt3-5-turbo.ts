import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT35TurboModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, { costScore: 85, accuracyScore: 88, creativityScore: 85, speedScore: 92 }],
            [LLMConversationType.TextToCode, { costScore: 85, accuracyScore: 88, creativityScore: 85, speedScore: 92 }],
            [LLMConversationType.CodeToText, { costScore: 85, accuracyScore: 88, creativityScore: 85, speedScore: 92 }],
        ]);

        super({
            name: "openai/gpt-3.5-turbo",
            modelName: "gpt-3.5-turbo-16k",
            interfaceName: "openai",
            serviceName: "OAService",
            tokenLimit: 16384,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.TextToText]
        });
    }
}

const aiModel = new GPT35TurboModel();
export default aiModel;