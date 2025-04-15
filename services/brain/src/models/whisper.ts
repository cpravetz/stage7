import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class WhisperModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.AudioToText, {
                costScore: 75,
                accuracyScore: 93,
                creativityScore: 0, // N/A for audio transcription
                speedScore: 90
            }]
        ]);

        super({
            name: "openai/whisper",
            modelName: "whisper-1",
            interfaceName: "openai",
            serviceName: "OAService",
            tokenLimit: 25000, // Adjust this value based on the actual audio length limit
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.AudioToText]
        });
    }
}

const aiModel = new WhisperModel();
export default aiModel;