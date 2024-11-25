import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class ClaudeHaikuModel extends BaseModel {
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
            }]
        ]);

        super({
            name: "anthropic/claude-3-haiku-20240307",
            modelName: "claude-3-haiku-20240307",
            interfaceName: "anthropic",
            serviceName: "AntService",
            tokenLimit: 200000, // Adjust this value if you know the exact token limit for Claude Haiku
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new ClaudeHaikuModel();
export default aiModel;