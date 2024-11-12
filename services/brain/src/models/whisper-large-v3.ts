import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class WhisperLargeV3Model extends BaseModel {
    constructor() {
        super({
            name: "openai/whisper-large-v3",
            modelName: "openai/whisper-large-v3",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 85,
            accuracyScore: 90,
            creativityScore: 85,
            speedScore: 88,
            contentConversation: [LLMConversationType.AudioToText, LLMConversationType.TextToAudio]
        });
    }
}

const aiModel = new WhisperLargeV3Model();
export default aiModel;