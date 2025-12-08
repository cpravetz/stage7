import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class DeepSeekR1Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
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
            }],
            [LLMConversationType.CodeToText, {
                costScore: 100,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 100,
                accuracyScore: 92,
                creativityScore: 80,
                speedScore: 90
            }]
        ]);

        super({
            name: "or/tngtech/deepseek-r1t2-chimera:free",
            modelName: "tngtech/deepseek-r1t2-chimera:free",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 164000, 
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.CodeToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new DeepSeekR1Model();
export default aiModel;