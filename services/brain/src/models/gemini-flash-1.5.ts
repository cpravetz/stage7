import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class Gemini15FlashModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToCode, {
                costScore: 100,
                accuracyScore: 95,
                creativityScore: 95,
                speedScore: 95
            }],
            [LLMConversationType.TextToText, {
                costScore: 100,
                accuracyScore: 80,
                creativityScore: 80,
                speedScore: 80
            }]
        ]);

        super({
            name: "google/gemini-2.0-flash-lite",
            modelName: "gemini-2.0-flash-lite",
            interfaceName: "gemini",
            serviceName: "gemini",
            tokenLimit: 1048576, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new Gemini15FlashModel();
export default aiModel;