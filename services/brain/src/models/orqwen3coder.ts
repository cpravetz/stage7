import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class Qwen3CoderModel extends BaseModel {
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
                accuracyScore: 95,
                creativityScore: 95,
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
            name: "or/qwen/qwen3-coder:free",
            modelName: "qwen/qwen3-coder:free",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 260000, 
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.CodeToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new Qwen3CoderModel();
export default aiModel;