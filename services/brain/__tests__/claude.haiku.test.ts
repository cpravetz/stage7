
import { ClaudeHaikuModel } from '../src/models/claude.haiku';
import { LLMConversationType } from '@cktmcs/shared';

describe('ClaudeHaikuModel', () => {
  it('should correctly initialize model properties', () => {
    const model = new ClaudeHaikuModel();

    expect(model.name).toBe('anthropic/claude-3-haiku-20240307');
    expect(model.modelName).toBe('claude-3-haiku-20240307');
    expect(model.interfaceName).toBe('anthropic');
    expect(model.serviceName).toBe('AntService');
    expect(model.tokenLimit).toBe(200000);
    expect(model.contentConversation).toEqual([
      LLMConversationType.TextToText,
      LLMConversationType.TextToCode,
      LLMConversationType.TextToJSON,
    ]);

    const textToTextScores = model.scoresByConversationType.get(LLMConversationType.TextToText);
    expect(textToTextScores).toEqual({
      costScore: 20,
      accuracyScore: 90,
      creativityScore: 90,
      speedScore: 80,
    });
  });
});
