import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class SeamlessM4TModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToAudio, {
                costScore: 90,
                accuracyScore: 88,
                creativityScore: 0, // N/A
                speedScore: 85
            }],
            [LLMConversationType.AudioToText, {
                costScore: 90,
                accuracyScore: 88,
                creativityScore: 0, // N/A
                speedScore: 85
            }]
        ]);

        super({
            name: "facebook/seamless-m4t-large",
            modelName: "facebook/seamless-m4t-large",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 4096, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToAudio, LLMConversationType.AudioToText]
        });
    }
}

const aiModel = new SeamlessM4TModel();
export default aiModel;