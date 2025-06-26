import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class StableDiffusionXLModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToImage, {
                costScore: 90,
                accuracyScore: 88,
                creativityScore: 92,
                speedScore: 85
            }],
            [LLMConversationType.ImageToImage, {
                costScore: 90,
                accuracyScore: 88,
                creativityScore: 92,
                speedScore: 85
            }]
        ]);

        super({
            name: "stabilityai/stable-diffusion-xl-base-1.0",
            modelName: "stabilityai/stable-diffusion-xl-base-1.0",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 4096, // Adjust as needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToImage, LLMConversationType.ImageToImage]
        });
    }
}

const aiModel = new StableDiffusionXLModel();
export default aiModel;