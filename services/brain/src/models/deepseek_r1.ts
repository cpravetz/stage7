import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class DeepSeekR1Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.CodeToText, {
                costScore: 95,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.TextToCode, {
                costScore: 95,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }]
        ]);

        super({
            name: "deepseek-ai/DeepSeek-R1",
            modelName: "deepseek-ai/DeepSeek-R1",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 8192, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.CodeToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new DeepSeekR1Model();
export default aiModel;