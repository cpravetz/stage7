import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class Claude2Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 70,
                accuracyScore: 95,
                creativityScore: 90,
                speedScore: 85
            }],
            [LLMConversationType.TextToCode, {
                costScore: 70,
                accuracyScore: 95,
                creativityScore: 90,
                speedScore: 85
            }],
            [LLMConversationType.CodeToText, {
                costScore: 70,
                accuracyScore: 95,
                creativityScore: 90,
                speedScore: 85
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 70,
                accuracyScore: 95,
                creativityScore: 90,
                speedScore: 85
            }]
        ]);

        super({
            name: "anthropic/claude-3.5-haiku-20241022",
            modelName: "anthropic/claude-3.5-haiku-20241022",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 100000, // Adjust this value if you know the exact token limit for Claude 2
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.TextToText, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new Claude2Model();
export default aiModel;