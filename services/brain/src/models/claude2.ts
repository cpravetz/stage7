import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class Claude2Model extends BaseModel {
    constructor() {
        super({
            name: "anthropic/claude-2",
            modelName: "anthropic/claude-2",
            interfaceName: "openrouter",
            serviceName: "ORService",
            costScore: 70,
            accuracyScore: 95,
            creativityScore: 90,
            speedScore: 85,
            contentConversation: [LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.TextToText]
        });
    }
}

const aiModel = new Claude2Model();
export default aiModel;