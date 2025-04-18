import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class MistralSmallModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 90,
                accuracyScore: 85,
                creativityScore: 80,
                speedScore: 95
            }],
            [LLMConversationType.TextToCode, {
                costScore: 90,
                accuracyScore: 85,
                creativityScore: 80,
                speedScore: 95
            }]
        ]);

        super({
            name: "mistral/mistral-small-latest",
            modelName: "mistral-small-latest",
            interfaceName: "mistral",
            serviceName: "MistralService",
            tokenLimit: 32768,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new MistralSmallModel();
export default aiModel;