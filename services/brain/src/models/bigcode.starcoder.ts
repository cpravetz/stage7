import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class HFBigCoderModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToCode, {
                costScore: 1000,
                accuracyScore: 800,
                creativityScore: 800,
                speedScore: 800
            }]
        ]);

        super({
            name: "bigcoder/starcoder",
            modelName: "bigcoder/starcoder",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 8192, // Adjust this value if you know the exact token limit for Starcoder
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new HFBigCoderModel();
export default aiModel;