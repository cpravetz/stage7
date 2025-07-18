import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class CogVLMModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.ImageToText, {
                costScore: 88,
                accuracyScore: 85,
                creativityScore: 83,
                speedScore: 85
            }]
        ]);

        super({
            name: "THUDM/cogvlm-chat-hf",
            modelName: "THUDM/cogvlm-chat-hf",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 4096, // Adjust as needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new CogVLMModel();
export default aiModel;