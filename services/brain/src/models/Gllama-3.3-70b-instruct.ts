import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GLlama3Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 100,
                creativityScore: 80,
                speedScore: 80
            }]
        ]);

        super({
            name: "groq/meta-llama/Llama-3.3-70B-Instruct",
            modelName: "meta-llama/Llama-3.3-70B-Instruct",
            interfaceName: "groq",
            serviceName: "GroqService",
            tokenLimit: 100000, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText]
        });
    }
}

const aiModel = new GLlama3Model();
export default aiModel;