import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

export class KNLLMModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            // Give highest scores to make this model preferred over all others
            [LLMConversationType.TextToText, { costScore: 100, accuracyScore: 110, creativityScore: 110, speedScore: 110 }],
            [LLMConversationType.TextToCode, { costScore: 100, accuracyScore: 110, creativityScore: 110, speedScore: 110 }],
            [LLMConversationType.CodeToText, { costScore: 100, accuracyScore: 110, creativityScore: 110, speedScore: 110 }],
            [LLMConversationType.ImageToText, { costScore: 100, accuracyScore: 110, creativityScore: 110, speedScore: 110 }],
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