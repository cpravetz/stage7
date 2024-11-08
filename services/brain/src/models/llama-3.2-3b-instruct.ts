import { Model, LLMConversionType } from './Model';

export class LlamaModel extends Model {
    constructor() {
        super({
            name: "meta-lamma/llama-3.2-3b-instruct",
            modelName: "meta-llama/llama-3.2-3b-instruct:free",
            interfaceKey: "openrouter",
            costScore: 1000,
            accuracyScore: 800,
            creativityScore: 800,
            speedScore: 800,
            contentConversation: [LLMConversionType.TextToText]
        });
    }
}

const aiModel = new LlamaModel();
export default aiModel;