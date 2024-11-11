import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class ClaudeSonnetModel extends BaseModel {
    constructor() {
        super({
            name: "anthropic/claude-3.5-sonnet",
            modelName: "claude-3.5-sonnet",
            interfaceName: "anthropic",
            serviceName: "AntService",
            costScore: 10,
            accuracyScore: 95,
            creativityScore: 95,
            speedScore: 80,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode,]
        });
    }
}

const aiModel = new ClaudeSonnetModel();
export default aiModel;