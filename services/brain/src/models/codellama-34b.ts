import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class CodeLlama34bModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.CodeToText, {
                costScore: 95,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.TextToCode, {
                costScore: 95,
                accuracyScore: 88,
                creativityScore: 85,
                speedScore: 90
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 95,
                accuracyScore: 10,
                creativityScore: 10,
                speedScore: 50
            }]
        ]);

        super({
            name: "codellama/CodeLlama-34b-Instruct-hf",
            modelName: "codellama/CodeLlama-34b-Instruct-hf",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 8192, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.CodeToText, LLMConversationType.TextToCode, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new CodeLlama34bModel();
export default aiModel;