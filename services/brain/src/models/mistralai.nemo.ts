import { BaseService} from '../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class HFNemoModel extends BaseModel {
    constructor() {
        super({
            name: "bigcoder/starcoder",
            modelName: "bigcoder/starcoder",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: [LLMConversationType.TextToText,LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new HFNemoModel();
export default aiModel;