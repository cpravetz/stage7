import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class HFNemoModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 1000,
                accuracyScore: 800,
                creativityScore: 800,
                speedScore: 800
            }],
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
            tokenLimit: 8192, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new HFNemoModel();
export default aiModel;