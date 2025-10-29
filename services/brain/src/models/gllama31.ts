import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class GLlama3Model extends BaseModel {
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
                accuracyScore: 60,
                creativityScore: 10,
                speedScore: 50
            }]
        ]);

        super({
            name: "groq/llama-3.1-8b-instant",
            modelName: "llama-3.1-8b-instant",
            interfaceName: "groq",
            serviceName: "GroqService",
            tokenLimit: 128000, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new GLlama3Model();
export default aiModel;