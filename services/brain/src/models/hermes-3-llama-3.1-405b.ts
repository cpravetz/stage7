import { Model, LLMConversionType } from './Model';

export class NousHermesModel extends Model {
    constructor() {
        super({
            name: "nousresearch/hermes-3-llama-3.1-405b",
            modelName: "nousresearch/hermes-3-llama-3.1-405b:free",
            interfaceKey: "openrouter",
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: [LLMConversionType.TextToText, LLMConversionType.ImageToText, LLMConversionType.TextToImage]
        });
    }
}

const aiModel = new NousHermesModel();
export default aiModel;