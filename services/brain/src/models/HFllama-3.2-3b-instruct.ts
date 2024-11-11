import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class HFLlamaModel extends BaseModel {
    constructor() {
        super({
            name: "hf/meta-lamma/llama-3.2-3b-instruct",
            modelName: "meta-llama/llama-3.2-3b-instruct",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 1000,
            accuracyScore: 800,
            creativityScore: 800,
            speedScore: 800,
            contentConversation: [LLMConversationType.TextToText]
        });
    }
}

const aiModel = new HFLlamaModel();
export default aiModel;