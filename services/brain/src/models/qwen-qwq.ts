import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class QwenQwqModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 95,
                accuracyScore: 95,
                creativityScore: 95,
                speedScore: 95
            }],
            [LLMConversationType.TextToCode, {
                costScore: 95,
                accuracyScore: 95,
                creativityScore: 95,
                speedScore: 95
            }]
        ]);

        super({
            name: "groq/qwen-qwq-32b",
            modelName: "qwen-qwq-32b",
            interfaceName: "groq",
            serviceName: "groq",
            tokenLimit: 32768, // Qwen has a large context window
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new QwenQwqModel();
export default aiModel;
