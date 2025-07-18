import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class WhisperLargeV3Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.AudioToText, {
                costScore: 85,
                accuracyScore: 90,
                creativityScore: 85,
                speedScore: 88
            }],
            [LLMConversationType.TextToAudio, {
                costScore: 85,
                accuracyScore: 90,
                creativityScore: 85,
                speedScore: 88
            }]
        ]);

        super({
            name: "openai/whisper-large-v3",
            modelName: "openai/whisper-large-v3",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 30000, // Adjust this value based on the actual audio length limit
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.AudioToText, LLMConversationType.TextToAudio]
        });
    }
}

const aiModel = new WhisperLargeV3Model();
export default aiModel;