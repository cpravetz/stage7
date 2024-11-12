import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GPT4VisionModel extends BaseModel {
    constructor() {
        super({
            name: "openai/gpt-4-vision",
            modelName: "gpt-4-vision-preview",
            interfaceName: "openai",
            serviceName: "OAIService",
            costScore: 60,
            accuracyScore: 94,
            creativityScore: 92,
            speedScore: 85,
            contentConversation: [
                LLMConversationType.TextToText,
                LLMConversationType.TextToCode,
                LLMConversationType.ImageToText
            ]
        });
    }
}

const aiModel = new GPT4VisionModel();
export default aiModel;