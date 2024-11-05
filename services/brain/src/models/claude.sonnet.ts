import { Model, LLMConversionType } from './Model';

export class ClaudeSonnetModel extends Model {
    constructor() {
        super({
            name: "anthropic/claude-3.5-sonnet",
            modelName: "claude-3.5-sonnet",
            interfaceKey: "anthropic",
            costScore: 10,
            accuracyScore: 95,
            creativityScore: 95,
            speedScore: 80,
            contentConversation: [LLMConversionType.TextToText, LLMConversionType.TextToCode,]
        });
    }
}

const aiModel = new ClaudeSonnetModel();
export default aiModel;