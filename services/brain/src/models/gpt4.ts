import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT4Model extends BaseModel {
    constructor() {
        super({
            name: "openai/gpt-4",
            modelName: "openai/gpt-4",
            interfaceName: "openrouter",
            serviceName: "ORService",
            costScore: 65,
            accuracyScore: 93,
            creativityScore: 92,
            speedScore: 80,
            contentConversation: [LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.ImageToText, LLMConversationType.TextToText]
        });
    }
}

const aiModel = new GPT4Model();
export default aiModel;