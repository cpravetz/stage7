import { Model, ContentConversationType } from './Model';

export class LlamaGeminiModel extends Model {
    constructor() {
        super({
            name: "google/gemini-flash-1.5-exp",
            modelName: "google/gemini-flash-1.5-exp",
            interfaceKey: "openrouter",
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: ContentConversationType.TextToText
        });
    }
}

const aiModel = new LlamaGeminiModel();
export default aiModel;