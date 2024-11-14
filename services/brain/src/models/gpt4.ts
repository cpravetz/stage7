import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT4Model extends BaseModel {
    constructor() {
        super({
            name: "openai/gpt-4",
            modelName: "gpt-4",
            interfaceName: "openai",
            serviceName: "OAIService",
            costScore: 60,
            accuracyScore: 95,
            creativityScore: 93,
            speedScore: 85,
            contentConversation: [
                LLMConversationType.TextToCode,
                LLMConversationType.CodeToText,
                LLMConversationType.ImageToText,
                LLMConversationType.TextToText
            ]
        });
    }
}

const aiModel = new GPT4Model();
export default aiModel;