
import { GPT4oModel } from '../src/models/aimlgpt4o';
import { LLMConversationType } from '@cktmcs/shared';

describe('GPT4oModel', () => {
  it('should correctly initialize model properties', () => {
    const model = new GPT4oModel();

    expect(model.name).toBe('aiml/gpt-40-2024-08-06');
    expect(model.modelName).toBe('gpt-40-2024-08-06');
    expect(model.interfaceName).toBe('openai');
    expect(model.serviceName).toBe('OIMLService');
    expect(model.tokenLimit).toBe(128000);
    expect(model.contentConversation).toEqual([
      LLMConversationType.TextToText,
      LLMConversationType.TextToCode,
      LLMConversationType.CodeToText,
      LLMConversationType.TextToJSON,
    ]);

    const textToTextScores = model.scoresByConversationType.get(LLMConversationType.TextToText);
    expect(textToTextScores).toEqual({
      costScore: 65,
      accuracyScore: 92,
      creativityScore: 90,
      speedScore: 82,
    });
  });
});
