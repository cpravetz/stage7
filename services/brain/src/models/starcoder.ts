import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class StarCoderModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.CodeToText, {
                costScore: 90,
                accuracyScore: 85,
                creativityScore: 82,
                speedScore: 88
            }],
            [LLMConversationType.TextToCode, {
                costScore: 90,
                accuracyScore: 85,
                creativityScore: 82,
                speedScore: 88
            }]
        ]);

        super({
            name: "bigcode/starcoder",
            modelName: "bigcode/starcoder",
            interfaceName: "huggingface",
            serviceName: "HFService",
            tokenLimit: 8192, // Adjust this value if needed
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.CodeToText, LLMConversationType.TextToCode]
        });
    }
}

const aiModel = new StarCoderModel();
export default aiModel;