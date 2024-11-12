import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class BarkModel extends BaseModel {
    constructor() {
        super({
            name: "suno/bark",
            modelName: "suno/bark",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 90,
            accuracyScore: 85,
            creativityScore: 90,
            speedScore: 82,
            contentConversation: [LLMConversationType.TextToAudio]
        });
    }
}

const aiModel = new BarkModel();
export default aiModel;