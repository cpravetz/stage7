import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class SeamlessM4TModel extends BaseModel {
    constructor() {
        super({
            name: "facebook/seamless-m4t-large",
            modelName: "facebook/seamless-m4t-large",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 90,
            accuracyScore: 88,
            creativityScore: 0, // N/A
            speedScore: 85,
            contentConversation: [LLMConversationType.TextToAudio, LLMConversationType.AudioToText]
        });
    }
}

const aiModel = new SeamlessM4TModel();
export default aiModel;