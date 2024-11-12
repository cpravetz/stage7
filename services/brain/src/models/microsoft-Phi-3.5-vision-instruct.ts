import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class MSPhiVisionModel extends BaseModel {

    constructor() {
        super({
            name: "microsoft/Phi-3.5-vision-instruct",
            modelName: "microsoft/Phi-3.5-vision-instruct",
            interfaceName: 'huggingface',
            serviceName: 'HFService',
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: [LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new MSPhiVisionModel();
export default aiModel;