import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class StableDiffusionXLModel extends BaseModel {
    constructor() {
        super({
            name: "stabilityai/stable-diffusion-xl-base-1.0",
            modelName: "stabilityai/stable-diffusion-xl-base-1.0",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 90,
            accuracyScore: 88,
            creativityScore: 92,
            speedScore: 85,
            contentConversation: [LLMConversationType.ImageToImage, LLMConversationType.TextToImage]
        });
    }
}

const aiModel = new StableDiffusionXLModel();
export default aiModel;