import { Model, LLMConversionType } from './Model';

export class HFLlamaModel extends Model {
    constructor() {
        super({
            name: "hf/meta-lamma/llama-3.2-3b-instruct",
            modelName: "meta-llama/llama-3.2-3b-instruct",
            interfaceKey: "huggingface",
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: [LLMConversionType.TextToText]
        });
    }
}

const aiModel = new HFLlamaModel();
export default aiModel;