import { Model, LLMConversionType } from './Model';

export class ClaudeHaikuModel extends Model {
    constructor() {
        super({
            name: "anthropic/claude-3-haiku-20240307",
            modelName: "claude-3-haiku-20240307",
            interfaceKey: "anthropic",
            costScore: 20,
            accuracyScore: 90,
            creativityScore: 90,
            speedScore: 80,
            contentConversation: [LLMConversionType.TextToText, LLMConversionType.TextToCode,]
        });
    }
}

const aiModel = new ClaudeHaikuModel();
export default aiModel;