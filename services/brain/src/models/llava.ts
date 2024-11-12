import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class LLaVAModel extends BaseModel {
    constructor() {
        super({
            name: "liuhaotian/llava-v1.5-13b",
            modelName: "liuhaotian/llava-v1.5-13b",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 90,
            accuracyScore: 83,
            creativityScore: 80,
            speedScore: 88,
            contentConversation: [LLMConversationType.ImageToText]
        });
    }
}

const aiModel = new LLaVAModel();
export default aiModel;