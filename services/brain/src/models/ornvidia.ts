import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class ORNvidiaModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.ImageToText, {
                costScore: 100,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.TextToCode, {
                costScore: 100,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 100,
                accuracyScore: 62,
                creativityScore: 80,
                speedScore: 90
            }]
        ]);

        super({
            name: "or/nvidia/nemotron-nano-12b-v2-vl:free",
            modelName: "nvidia/nemotron-nano-12b-v2-vl:free",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 128000, 
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.ImageToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new ORNvidiaModel();
export default aiModel;