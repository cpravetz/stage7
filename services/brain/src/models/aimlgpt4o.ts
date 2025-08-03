import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class GPT4oModel extends BaseModel {
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
            [LLMConversationType.CodeToText, {
                costScore: 65,
                accuracyScore: 92,
                creativityScore: 90,
                speedScore: 82
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 65,
                accuracyScore: 92,
                creativityScore: 90,
                speedScore: 82
            }]
        ]);

        super({
            name: "aiml/gpt-40-2024-08-06",
            modelName: "gpt-40-2024-08-06",
            interfaceName: "openai",
            serviceName: "OIMLService",
            tokenLimit: 128000, 
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new GPT4oModel();
export default aiModel;