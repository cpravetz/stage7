import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class LlamaGeminiModel extends BaseModel {
    constructor() {
        super({
            name: "google/gemini-flash-1.5-exp",
            modelName: "google/gemini-flash-1.5-exp",
            interfaceName: "openrouter",
            serviceName: "ORService",
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: [LLMConversationType.TextToText]
        });
    }
}

const aiModel = new LlamaGeminiModel();
export default aiModel;