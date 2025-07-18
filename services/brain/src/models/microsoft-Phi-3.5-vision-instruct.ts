import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class MSPhiVisionModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.ImageToText, {
                costScore: 100,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }]
        ]);

        super({
            name: "microsoft/Phi-3.5-vision-instruct",
            modelName: "microsoft/Phi-3.5-vision-instruct",
            interfaceName: 'huggingface',
            serviceName: 'HFService',
            tokenLimit: 4096, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new MSPhiVisionModel();
export default aiModel;