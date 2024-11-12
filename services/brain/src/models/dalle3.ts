import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class DALLE3Model extends BaseModel {
    constructor() {
        super({
            name: "openai/dall-e-3",
            modelName: "dall-e-3",
            interfaceName: "openai",
            serviceName: "OAIService",
            costScore: 70,
            accuracyScore: 90,
            creativityScore: 93,
            speedScore: 88,
            contentConversation: [LLMConversationType.ImageToImage, LLMConversationType.TextToImage]
        });
    }
}

const aiModel = new DALLE3Model();
export default aiModel;