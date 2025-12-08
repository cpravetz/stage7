import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class MistralSmallModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 90,
                accuracyScore: 55,
                creativityScore: 60,
                speedScore: 70
            }],
            [LLMConversationType.TextToCode, {
                costScore: 90,
                accuracyScore: 85,
                creativityScore: 80,
                speedScore: 95
            }],
            [LLMConversationType.TextToJSON, {
                // Lowered accuracy/creativity/speed scores for TextToJSON (planning/reflect tasks)
                // to make this model less likely to be selected for structured output generation.
                costScore: 90,
                accuracyScore: 40,
                creativityScore: 30,
                speedScore: 70
            }]
        ]);

        super({
            name: "mistral/mistral-small-latest",
            modelName: "mistral-small-latest",
            interfaceName: "mistral",
            serviceName: "MistralService",
            tokenLimit: 32768,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new MistralSmallModel();
export default aiModel;