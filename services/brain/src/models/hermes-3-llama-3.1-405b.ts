import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class NousHermesModel extends BaseModel {
    constructor() {
        super({
            name: "nousresearch/hermes-3-llama-3.1-405b",
            modelName: "nousresearch/hermes-3-llama-3.1-405b:free",
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

const aiModel = new NousHermesModel();
export default aiModel;