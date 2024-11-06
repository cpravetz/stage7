import { Model, LLMConversionType } from './Model';

export class LiquidLFM40BModel extends Model {
    constructor() {
        super({
            name: "liquid/lfm-40b",
            modelName: "liquid/lfm-40b:free",
            interfaceKey: "openrouter",
            costScore: 100,
            accuracyScore: 75,
            creativityScore: 75,
            speedScore: 80,
            contentConversation: [LLMConversionType.TextToText, LLMConversionType.ImageToText, LLMConversionType.TextToImage]
        });
    }
}

const aiModel = new LiquidLFM40BModel();
export default aiModel;