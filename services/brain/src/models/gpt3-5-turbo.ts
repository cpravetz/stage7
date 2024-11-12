import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT35TurboModel extends BaseModel {
    constructor() {
        super({
            name: "openai/gpt-3.5-turbo",
            modelName: "gpt-3.5-turbo-16k",
            interfaceName: "openai",
            serviceName: "OAIService",
            costScore: 85,
            accuracyScore: 88,
            creativityScore: 85,
            speedScore: 92,
            contentConversation: [
                LLMConversationType.TextToCode,
                LLMConversationType.CodeToText,
                LLMConversationType.TextToText
            ]
        });
    }
}

const aiModel = new GPT35TurboModel();
export default aiModel;