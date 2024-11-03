import { Model, LLMConversionType } from './Model';

export class GeminiProModel extends Model {
    constructor() {
        super({
            name: "google/gemini-pro-1.5-exp",
            modelName: "google/gemini-pro-1.5-exp",
            interfaceKey: "openrouter",
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: [LLMConversionType.TextToText, LLMConversionType.ImageToText, LLMConversionType.TextToImage]
        });
    }
}

const aiModel = new GeminiProModel();
export default aiModel;