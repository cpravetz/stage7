import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT4VModel extends BaseModel {
    constructor() {
        super({
            name: "openai/gpt-4-vision-preview",
            modelName: "openai/gpt-4-vision-preview",
            interfaceName: "openrouter",
            serviceName: "ORService",
            costScore: 65,
            accuracyScore: 92,
            creativityScore: 90,
            speedScore: 82,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode, LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new GPT4VModel();
export default aiModel;