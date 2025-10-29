import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class KNLLMModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            // Use reasonable scores for fair comparison with other models
            [LLMConversationType.TextToText, { costScore: 100, accuracyScore: 85, creativityScore: 85, speedScore: 70 }],
            [LLMConversationType.TextToCode, { costScore: 100, accuracyScore: 85, creativityScore: 85, speedScore: 70 }],
            [LLMConversationType.CodeToText, { costScore: 100, accuracyScore: 85, creativityScore: 85, speedScore: 70 }],
            [LLMConversationType.ImageToText, { costScore: 100, accuracyScore: 85, creativityScore: 85, speedScore: 70 }],
            [LLMConversationType.TextToJSON, { costScore: 100, accuracyScore: 85, creativityScore: 85, speedScore: 70 }],
        ]);

        super({
            name: "openweb/mistral:7b",
            modelName: "mistral:7b",
            interfaceName: "openwebui", // Must match the interface name in OpenWebUIInterface.ts
            serviceName: "OWService", // Must match the service name in OWService.ts
            tokenLimit: 128000,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [
                LLMConversationType.TextToCode,
                LLMConversationType.CodeToText,
                LLMConversationType.ImageToText,
                LLMConversationType.TextToText,
                LLMConversationType.TextToJSON
            ]
        });

        console.log('Mistral:7b Model initialized with OpenWebUI interface');
    }
}

const aiModel = new KNLLMModel();
export default aiModel;