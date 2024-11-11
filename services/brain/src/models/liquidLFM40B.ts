import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class LiquidLFM40BModel extends BaseModel {
    constructor() {
        super({
            name: "liquid/lfm-40b",
            modelName: "liquid/lfm-40b:free",
            interfaceName: "openrouter",
            serviceName: "ORService",
            costScore: 100,
            accuracyScore: 75,
            creativityScore: 75,
            speedScore: 80,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.ImageToText, LLMConversationType.TextToImage]
        });
    }
}

const aiModel = new LiquidLFM40BModel();
export default aiModel;