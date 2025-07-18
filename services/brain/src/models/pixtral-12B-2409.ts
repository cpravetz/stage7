import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class Pixtral12BModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 85,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.TextToCode, {
                costScore: 85,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
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
                LLMConversationType.TextToText, 
                LLMConversationType.TextToCode,
                LLMConversationType.ImageToText
            ]
        });
    }
}

const aiModel = new Pixtral12BModel();
export default aiModel;