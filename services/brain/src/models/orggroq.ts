import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class ORGROQModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 58,
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
                accuracyScore: 52,
                creativityScore: 70,
                speedScore: 90
            }]
        ]);

        super({
            name: "or/x-ai/grok-4.1-fast:free",
            modelName: "x-ai/grok-4.1-fast:free",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 1500000, 
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.CodeToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new ORGROQModel();
export default aiModel;