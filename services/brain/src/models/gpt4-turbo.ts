import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT4TurboModel extends BaseModel {
    constructor() {
        super({
            name: "openai/gpt-4-turbo",
            modelName: "gpt-4-turbo-preview",
            interfaceName: "openai",
            serviceName: "OAIService",
            costScore: 65,
            accuracyScore: 96,
            creativityScore: 94,
            speedScore: 88,
            contentConversation: [
                LLMConversationType.TextToCode,
                LLMConversationType.CodeToText,
                LLMConversationType.ImageToText,
                LLMConversationType.TextToText
            ]
        });
    }
}

const aiModel = new GPT4TurboModel();
export default aiModel;