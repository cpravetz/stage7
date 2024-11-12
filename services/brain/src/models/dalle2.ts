import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class DALLE2Model extends BaseModel {
    constructor() {
        super({
            name: "openai/dall-e-2",
            modelName: "dall-e-2",
            interfaceName: "openai",
            serviceName: "OAIService",
            costScore: 75,
            accuracyScore: 85,
            creativityScore: 88,
            speedScore: 90,
            contentConversation: [
                LLMConversationType.ImageToImage,
                LLMConversationType.TextToImage
            ]
        });
    }
}

const aiModel = new DALLE2Model();
export default aiModel;