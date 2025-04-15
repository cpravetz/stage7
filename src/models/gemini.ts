import { BaseModel, ModelScore } from './baseModel';
import { LLMConversationType } from '../interfaces/baseInterface';

const geminiModel = new BaseModel();
geminiModel.name = 'google/gemini-pro-1.5-exp';
geminiModel.modelName = 'gemini-pro-1.5';
geminiModel.interfaceName = 'gemini';
geminiModel.serviceName = 'gemini';
geminiModel.tokenLimit = 32000;
geminiModel.contentConversation = [
    LLMConversationType.TextToText,
    LLMConversationType.TextToCode,
    LLMConversationType.CodeToText,
];

// Set scores for different conversation types
const scoresByConversationType = new Map<LLMConversationType, ModelScore>([
    // Give high scores to make this model preferred
    [LLMConversationType.TextToText, { costScore: 90, accuracyScore: 105, creativityScore: 105, speedScore: 105 }],
    [LLMConversationType.TextToCode, { costScore: 90, accuracyScore: 105, creativityScore: 105, speedScore: 105 }],
    [LLMConversationType.CodeToText, { costScore: 90, accuracyScore: 105, creativityScore: 105, speedScore: 105 }],
]);

geminiModel.setScores(scoresByConversationType);

export default geminiModel;
