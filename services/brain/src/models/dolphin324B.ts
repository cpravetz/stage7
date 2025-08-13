import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class Dolphin324BModel extends BaseModel {
    constructor() {
        const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
            [LLMConversationType.TextToText, {
                costScore: 100,  
                accuracyScore: 75,  
                creativityScore: 40,  
                speedScore: 50  
            }],
            [LLMConversationType.TextToCode, {
                costScore: 100,  
                accuracyScore: 75,  
                creativityScore: 40,  
                speedScore: 50  
            }],
            [LLMConversationType.CodeToText, {
                costScore: 100,  
                accuracyScore: 75,  
                creativityScore: 40,  
                speedScore: 50  
            }],
            [LLMConversationType.TextToJSON, {
                costScore: 100,  
                accuracyScore: 75,  
                creativityScore: 40,  
                speedScore: 50  
            }]
        ]);

        super({
            name: "or/cognitivecomputations/dolphin3.0-mistral-24b:free",
            modelName: "cognitivecomputations/dolphin3.0-mistral-24b:free",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 32000, 
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.TextToText, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new Dolphin324BModel();
export default aiModel;