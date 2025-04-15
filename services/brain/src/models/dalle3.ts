import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class DALLE3Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToImage, {
                costScore: 65,
                accuracyScore: 92,
                creativityScore: 95,
                speedScore: 88
            }]
        ]);

        super({
            name: "openai/dall-e-3",
            modelName: "dall-e-3",
            interfaceName: "openai",
            serviceName: "OAService",
            tokenLimit: 1000, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToImage]
        });
    }
}

const aiModel = new DALLE3Model();
export default aiModel;