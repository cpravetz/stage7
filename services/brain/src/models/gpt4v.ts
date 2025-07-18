import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class GPT4VModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 65,
                accuracyScore: 92,
                creativityScore: 90,
                speedScore: 82
            }],
            [LLMConversationType.TextToCode, {
                costScore: 65,
                accuracyScore: 92,
                creativityScore: 90,
                speedScore: 82
            }],
            [LLMConversationType.ImageToText, {
                costScore: 65,
                accuracyScore: 92,
                creativityScore: 90,
                speedScore: 82
            }]
        ]);

        super({
            name: "openai/gpt-4-vision-preview",
            modelName: "openai/gpt-4-vision-preview",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 4096, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new GPT4VModel();
export default aiModel;