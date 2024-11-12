import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class TTSModel extends BaseModel {
    constructor() {
        super({
            name: "openai/tts",
            modelName: "tts-1",
            interfaceName: "openai",
            serviceName: "OAIService",
            costScore: 80,
            accuracyScore: 90,
            creativityScore: 85,
            speedScore: 92,
            contentConversation: [
                LLMConversationType.TextToAudio
            ]
        });
    }
}

const aiModel = new TTSModel();
export default aiModel;