import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class KNLLMModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            // Use reasonable scores for fair comparison with other models
            [LLMConversationType.TextToText, { costScore: 80, accuracyScore: 85, creativityScore: 85, speedScore: 70 }],
            [LLMConversationType.TextToCode, { costScore: 80, accuracyScore: 85, creativityScore: 85, speedScore: 70 }],
            [LLMConversationType.CodeToText, { costScore: 80, accuracyScore: 85, creativityScore: 85, speedScore: 70 }],
            [LLMConversationType.ImageToText, { costScore: 80, accuracyScore: 85, creativityScore: 85, speedScore: 70 }],
        ]);

        super({
            name: "openweb/knownow",
            modelName: "knownow", // This is the model name that will be sent to the OpenWebUI API
            interfaceName: "openwebui", // Must match the interface name in OpenWebUIInterface.ts
            serviceName: "OWService", // Must match the service name in OWService.ts
            tokenLimit: 8192,
            scoresByConversationType: scoresByConversationType,
            contentConversation: [
                LLMConversationType.TextToCode,
                LLMConversationType.CodeToText,
                LLMConversationType.ImageToText,
                LLMConversationType.TextToText
            ]
        });

        console.log('KNLLMModel initialized with OpenWebUI interface');
    }
}

const aiModel = new KNLLMModel();
export default aiModel;