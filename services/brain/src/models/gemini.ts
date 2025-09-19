import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '@cktmcs/shared';

// Set scores for different conversation types
const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
    // Give high scores to make this model preferred
    [LLMConversationType.TextToText, { costScore: 90, accuracyScore: 105, creativityScore: 105, speedScore: 105 }],
    [LLMConversationType.TextToCode, { costScore: 90, accuracyScore: 105, creativityScore: 105, speedScore: 105 }],
    [LLMConversationType.CodeToText, { costScore: 90, accuracyScore: 105, creativityScore: 105, speedScore: 105 }],
    [LLMConversationType.TextToJSON, { costScore: 90, accuracyScore: 105, creativityScore: 105, speedScore: 105 }]
]);

const geminiModel = new BaseModel({
    name: 'google/gemini-pro-1.5-exp',
    modelName: 'gemini-pro-1.5',
    interfaceName: 'gemini',
    serviceName: 'gemini',
    tokenLimit: 32000,
    scoresByConversationType: scoresByConversationType,
    contentConversation: [
        LLMConversationType.TextToText,
        LLMConversationType.CodeToText,
        LLMConversationType.TextToCode,
        LLMConversationType.TextToJSON
    ]
});

export default geminiModel;
