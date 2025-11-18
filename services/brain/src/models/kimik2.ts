import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

export class KimiK2Model extends BaseModel {
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
            name: "or/moonshotai/kimi-k2",
            modelName: "moonshotai/kimi-k2",
            interfaceName: "openrouter",
            serviceName: "ORService",
            tokenLimit: 66000, // Adjust this value if you know the exact token limit for Claude 2
            scoresByConversationType: scoresByConversationType,
            contentConversation: [LLMConversationType.TextToCode, LLMConversationType.CodeToText, LLMConversationType.TextToText, LLMConversationType.TextToJSON]
        });
    }
}

const aiModel = new KimiK2Model();
export default aiModel;