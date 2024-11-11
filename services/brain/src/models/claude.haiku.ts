import { BaseService} from './../services/baseService';
import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';


export class ClaudeHaikuModel extends BaseModel {
    constructor() {
        super({
            name: "anthropic/claude-3-haiku-20240307",
            modelName: "claude-3-haiku-20240307",
            interfaceName: "anthropic",
            serviceName: "AntService",
            costScore: 20,
            accuracyScore: 90,
            creativityScore: 90,
            speedScore: 80,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode,]
        });
    }
}

const aiModel = new ClaudeHaikuModel();
export default aiModel;