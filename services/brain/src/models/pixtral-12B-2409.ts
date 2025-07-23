import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class Pixtral12BModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([

            [LLMConversationType.ImageToText, {
                costScore: 85,
                accuracyScore: 90,
                creativityScore: 85,
                speedScore: 90
            }]
        ]);

        super({
            name: "mistral/pixtral-12B-2409",
            modelName: "pixtral-12b-2409",
            interfaceName: "mistral",
            serviceName: "MistralService",
            tokenLimit: 32768,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [
                LLMConversationType.ImageToText
            ]
        });
    }
}

const aiModel = new Pixtral12BModel();
export default aiModel;