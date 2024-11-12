import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class StarCoderModel extends BaseModel {
    constructor() {
        super({
            name: "bigcode/starcoder",
            modelName: "bigcode/starcoder",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 90,
            accuracyScore: 85,
            creativityScore: 82,
            speedScore: 88,
            contentConversation: [LLMConversationType.CodeToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new StarCoderModel();
export default aiModel;