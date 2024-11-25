import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class BarkModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToAudio, {
                costScore: 90,
                accuracyScore: 85,
                creativityScore: 90,
                speedScore: 82
            }]
        ]);

        super({
            name: "suno/bark",
            modelName: "suno/bark",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 1000, // You may need to adjust this based on the actual model's limit
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToAudio]
        });
    }
}

const aiModel = new BarkModel();
export default aiModel;