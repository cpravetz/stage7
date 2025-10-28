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
            // Enable TextToJSON with lower accuracy score but still functional
            [LLMConversationType.TextToJSON, { costScore: 100, accuracyScore: 75, creativityScore: 75, speedScore: 70 }],
        ]);

        super({
            name: "openweb/cogito",
            modelName: "cogito:3b", // This is the model name that will be sent to the OpenWebUI API
            interfaceName: "openwebui", // Must match the interface name in OpenWebUIInterface.ts
            serviceName: "OWService", // Must match the service name in OWService.ts
            tokenLimit: 128000,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [
                LLMConversationType.TextToCode,
                LLMConversationType.CodeToText,
                LLMConversationType.ImageToText,
                LLMConversationType.TextToText,
                LLMConversationType.TextToJSON  // Enable TextToJSON with JSON repair handling
            ]
        });

    }
}

const aiModel = new KNLLMModel();
export default aiModel;