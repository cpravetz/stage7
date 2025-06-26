import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class DALLE2Model extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToImage, {
                costScore: 75,
                accuracyScore: 85,
                creativityScore: 88,
                speedScore: 90
            }],
            [LLMConversationType.ImageToImage, {
                costScore: 75,
                accuracyScore: 85,
                creativityScore: 88,
                speedScore: 90
            }]
        ]);

        super({
            name: "openai/dall-e-2",
            modelName: "dall-e-2",
            interfaceName: "openai",
            serviceName: "OAService",
            tokenLimit: 4096, // Adjust as needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToImage, LLMConversationType.ImageToImage]
        });
    }
}

const aiModel = new DALLE2Model();
export default aiModel;