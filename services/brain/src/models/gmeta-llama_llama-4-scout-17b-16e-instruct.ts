import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class GLlama4Model extends BaseModel {
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
                accuracyScore: 100,
                creativityScore: 80,
                speedScore: 80
            }]
        ]);

        super({
            name: "groq/meta-llama/llama-4-scout-17b-16e-instruct",
            modelName: "meta-llama/llama-4-scout-17b-16e-instruct",
            interfaceName: "groq",
            serviceName: "GroqService",
            tokenLimit: 8192, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON],
        });
    }
}

const aiModel = new GLlama4Model();
export default aiModel;