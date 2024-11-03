import { Model, LLMConversionType } from './Model';

export class LlamaVisionModel extends Model {
    constructor() {
        super({
            name: "meta-llama/llama-3.2-11b-vision-instruct",
            modelName: "meta-llama/llama-3.2-11b-vision-instruct:free",
            interfaceKey: "openrouter",
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: [LLMConversionType.ImageToText]
        });
    }
}

const aiModel = new LlamaVisionModel();
export default aiModel;