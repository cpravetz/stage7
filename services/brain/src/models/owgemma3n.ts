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
        ]);

        super({
            name: "openweb/gemma3n:latest",
            modelName: "gemma3n:latest", // This is the model name that will be sent to the OpenWebUI API
            interfaceName: "openwebui", // Must match the interface name in OpenWebUIInterface.ts
            serviceName: "OWService", // Must match the service name in OWService.ts
            tokenLimit: 32000,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [
                LLMConversationType.TextToCode,
                LLMConversationType.CodeToText,
                LLMConversationType.ImageToText,
                LLMConversationType.TextToText
            ]
        });

        console.log('OWGemma3N Model initialized with OpenWebUI interface');
    }
}

const aiModel = new KNLLMModel();
export default aiModel;