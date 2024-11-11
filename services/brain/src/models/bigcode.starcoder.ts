import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class HFBigCoderModel extends BaseModel {
    constructor() {
        super({
            name: "bigcoder/starcoder",
            modelName: "bigcoder/starcoder",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 1000,
            accuracyScore: 800,
            creativityScore: 800,
            speedScore: 800,
            contentConversation: [LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new HFBigCoderModel();
export default aiModel;