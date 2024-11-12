import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class FasterWhisperModel extends BaseModel {
    constructor() {
        super({
            name: "openai/whisper-large-v3",
            modelName: "openai/whisper-large-v3",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 95,
            accuracyScore: 85,
            creativityScore: 0, // N/A
            speedScore: 92,
            contentConversation: [LLMConversationType.AudioToText]
        });
    }
}

const aiModel = new FasterWhisperModel();
export default aiModel;