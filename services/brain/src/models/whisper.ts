import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class WhisperModel extends BaseModel {
    constructor() {
        super({
            name: "openai/whisper",
            modelName: "whisper-1",
            interfaceName: "openai",
            serviceName: "OAIService",
            costScore: 75,
            accuracyScore: 93,
            creativityScore: 0, // N/A
            speedScore: 90,
            contentConversation: [
                LLMConversationType.AudioToText
            ]
        });
    }
}

const aiModel = new WhisperModel();
export default aiModel;