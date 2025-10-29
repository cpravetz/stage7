import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class GgptOSSModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 100,
                creativityScore: 80,
                speedScore: 80
            }],
            [LLMConversationType.TextToCode, {
                costScore: 100,
                accuracyScore: 100,
                creativityScore: 80,
                speedScore: 80
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 100,
                accuracyScore: 10,
                creativityScore: 10,
                speedScore: 50
            }]
        ]);

        super({
            name: "groq/openai/gpt-oss-20b",
            modelName: "openai/gpt-oss-20b",
            interfaceName: "groq",
            serviceName: "GroqService",
            tokenLimit: 100000, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new GgptOSSModel();
export default aiModel;