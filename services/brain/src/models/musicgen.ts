import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class MusicGenModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToAudio, {
                costScore: 88,
                accuracyScore: 83,
                creativityScore: 92,
                speedScore: 80
            }]
        ]);

        super({
            name: "facebook/musicgen-large",
            modelName: "facebook/musicgen-large",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 2048, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToAudio]
        });
    }
}

const aiModel = new MusicGenModel();
export default aiModel;