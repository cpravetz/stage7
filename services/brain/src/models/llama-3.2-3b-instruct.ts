import { Model, ContentConversationType } from './Model';

export class LlamaModel extends Model {
    constructor() {
        super({
            name: "meta-lamma/llama-3.2-3b-instruct",
            modelName: "meta-llama/llama-3.2-3b-instruct:free",
            interfaceKey: "openrouter",
            costScore: 100,
            accuracyScore: 80,
            creativityScore: 80,
            speedScore: 80,
            contentConversation: ContentConversationType.TextToText
        });
    }
}

const aiModel = new LlamaModel();
export default aiModel;