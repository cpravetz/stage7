import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class Llama270bModel extends BaseModel {
    constructor() {
        super({
            name: "meta-llama/Llama-2-70b-chat-hf",
            modelName: "meta-llama/Llama-2-70b-chat-hf",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 85,
            accuracyScore: 88,
            creativityScore: 85,
            speedScore: 88,
            contentConversation: [LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.TextToText]
        });
    }
}

const aiModel = new Llama270bModel();
export default aiModel;