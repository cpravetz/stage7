import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class FasterWhisperModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.AudioToText, {
                costScore: 95,
                accuracyScore: 85,
                creativityScore: 0, // N/A for audio transcription
                speedScore: 92
            }]
        ]);

        super({
            name: "openai/whisper-large-v3",
            modelName: "openai/whisper-large-v3",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 30000, // Adjust this value based on the actual audio length limit
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.AudioToText]
        });
    }
}

const aiModel = new FasterWhisperModel();
export default aiModel;