import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class TTSModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToAudio, {
                costScore: 80,
                accuracyScore: 90,
                creativityScore: 85,
                speedScore: 92
            }]
        ]);

        super({
            name: "openai/tts",
            modelName: "tts-1",
            interfaceName: "openai",
            serviceName: "OAService",
            tokenLimit: 4096, // Adjust this value based on the actual token limit for the TTS model
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToAudio]
        });
    }
}

const aiModel = new TTSModel();
export default aiModel;