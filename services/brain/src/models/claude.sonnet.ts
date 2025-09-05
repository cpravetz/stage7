import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class ClaudeSonnetModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 20,
                accuracyScore: 90,
                creativityScore: 90,
                speedScore: 80
            }],
            [LLMConversationType.TextToCode, {
                costScore: 20,
                accuracyScore: 90,
                creativityScore: 90,
                speedScore: 80
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 20,
                accuracyScore: 90,
                creativityScore: 90,
                speedScore: 80
            }]
        ]);

        super({
            name: "anthropic/claude-sonnet-4-20250514",
            modelName: "claude-sonnet-4-20250514",
            interfaceName: "anthropic",
            serviceName: "AntService",
            tokenLimit: 200000, // Adjust this value if you know the exact token limit for Claude Haiku
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new ClaudeSonnetModel();
export default aiModel;