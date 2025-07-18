import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class LiquidLFM40BModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 75,
                creativityScore: 75,
                speedScore: 80
            }],
            [LLMConversationType.ImageToText, {
                costScore: 100,
                accuracyScore: 75,
                creativityScore: 75,
                speedScore: 80
            }],
            [LLMConversationType.TextToImage, {
                costScore: 100,
                accuracyScore: 75,
                creativityScore: 75,
                speedScore: 80
            }]
        ]);

        super({
            name: "liquid/lfm-40b",
            modelName: "liquid/lfm-40b:free",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 4096, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.ImageToText, LLMConversationType.TextToImage]
        });
    }
}

const aiModel = new LiquidLFM40BModel();
export default aiModel;