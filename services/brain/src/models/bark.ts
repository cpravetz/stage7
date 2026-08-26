import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class BarkModel extends BaseModel {
    constructor() {
        const scores = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToAudio, { costScore: 90, accuracyScore: 85, creativityScore: 90, speedScore: 82 }],
        ]);

        super({
            name: 'suno/bark',
            modelName: 'suno/bark',
            interfaceName: 'huggingface',
            serviceName: 'HFService',
            tokenLimit: 4096,
            scoresByConversationType: scores,
            contentConversation: [LLMConversationType.TextToAudio],
        });
    }
}

const barkInstance = new BarkModel();
export default barkInstance;
