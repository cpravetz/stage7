import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class LLaVAModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.ImageToText, {
                costScore: 90,
                accuracyScore: 83,
                creativityScore: 80,
                speedScore: 88
            }]
        ]);

        super({
            name: "liuhaotian/llava-v1.5-13b",
            modelName: "liuhaotian/llava-v1.5-13b",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 4096,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new LLaVAModel();
export default aiModel;