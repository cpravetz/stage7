import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class LlamaModel extends BaseModel {
    constructor() {
        super({
            name: "meta-lamma/llama-3.2-3b-instruct",
            modelName: "meta-llama/llama-3.2-3b-instruct:free",
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

const aiModel = new LlamaModel();
export default aiModel;