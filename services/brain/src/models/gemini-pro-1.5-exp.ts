import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class GeminiProModel extends BaseModel {
    constructor() {
        super({
            name: "google/gemini-pro-1.5-exp",
            modelName: "google/gemini-pro-1.5-exp",
            interfaceName: "openrouter",
            serviceName: "ORService",
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.ImageToText, LLMConversationType.TextToImage]
        });
    }
}

const aiModel = new GeminiProModel();
export default aiModel;