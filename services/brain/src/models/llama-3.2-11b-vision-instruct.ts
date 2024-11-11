import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class LlamaVisionModel extends BaseModel {

    constructor() {
        super({
            name: "meta-llama/llama-3.2-11b-vision-instruct",
            modelName: "meta-llama/llama-3.2-11b-vision-instruct:free",
            interfaceName: 'openrouter',
            serviceName: 'ORService',
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: [LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new LlamaVisionModel();
export default aiModel;