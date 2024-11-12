import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class MusicGenModel extends BaseModel {
    constructor() {
        super({
            name: "facebook/musicgen-large",
            modelName: "facebook/musicgen-large",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 88,
            accuracyScore: 83,
            creativityScore: 92,
            speedScore: 80,
            contentConversation: [LLMConversationType.TextToAudio]
        });
    }
}

const aiModel = new MusicGenModel();
export default aiModel;