import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class CogVLMModel extends BaseModel {
    constructor() {
        super({
            name: "THUDM/cogvlm-chat-hf",
            modelName: "THUDM/cogvlm-chat-hf",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 88,
            accuracyScore: 85,
            creativityScore: 83,
            speedScore: 85,
            contentConversation: [LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new CogVLMModel();
export default aiModel;