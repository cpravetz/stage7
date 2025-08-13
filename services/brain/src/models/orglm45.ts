import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class GLM45Model extends BaseModel {
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
            name: "or/z-ai/glm-4.5-air:free",
            modelName: "z-ai/glm-4.5-air:free",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 130000, 
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.CodeToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new GLM45Model();
export default aiModel;