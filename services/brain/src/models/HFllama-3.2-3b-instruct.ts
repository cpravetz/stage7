import { Model, LLMConversionType } from './Model';

export class HFLlamaModel extends Model {
    constructor() {
        super({
            name: "hf/meta-lamma/llama-3.2-3b-instruct",
            modelName: "meta-llama/llama-3.2-3b-instruct",
            interfaceKey: "huggingface",
            costScore: 1000,
            accuracyScore: 800,
            creativityScore: 800,
            speedScore: 800,
            contentConversation: [LLMConversionType.TextToText]
        });
    }
}

const aiModel = new HFLlamaModel();
export default aiModel;