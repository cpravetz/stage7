
import { BarkModel } from '../src/models/bark';
import { LLMConversationType } from '@cktmcs/shared';

describe('BarkModel', () => {
  it('should correctly initialize model properties', () => {
    const model = new BarkModel();

    expect(model.name).toBe('suno/bark');
    expect(model.modelName).toBe('suno/bark');
    expect(model.interfaceName).toBe('huggingface');
    expect(model.serviceName).toBe('HFService');
    expect(model.tokenLimit).toBe(4096);
    expect(model.contentConversation).toEqual([
      LLMConversationType.TextToAudio,
    ]);

    const textToAudioScores = model.scoresByConversationType.get(LLMConversationType.TextToAudio);
    expect(textToAudioScores).toEqual({
      costScore: 90,
      accuracyScore: 85,
      creativityScore: 90,
      speedScore: 82,
    });
  });
});
