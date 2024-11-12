import { BaseModel } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class CodeLlama34bModel extends BaseModel {
    constructor() {
        super({
            name: "codellama/CodeLlama-34b-Instruct-hf",
            modelName: "codellama/CodeLlama-34b-Instruct-hf",
            interfaceName: "huggingface",
            serviceName: "HFService",
            costScore: 95,
            accuracyScore: 88,
            creativityScore: 85,
            speedScore: 90,
            contentConversation: [LLMConversationType.CodeToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new CodeLlama34bModel();
export default aiModel;