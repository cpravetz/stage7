import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class DeepSeekR1Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToCode, {
                costScore: 100,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.CodeToText, {
                costScore: 100,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.TextToCode, {
                costScore: 100,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }]
        ]);

        super({
            name: "or/deepseek-ai/DeepSeek-R1:free",
            modelName: "deepseek-ai/DeepSeek-R1:free",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 164000, 
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.CodeToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new DeepSeekR1Model();
export default aiModel;