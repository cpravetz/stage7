
import { ResponseEvaluator, EvaluationCriteria } from '../src/utils/responseEvaluator';
import { LLMConversationType } from '@cktmcs/shared';
import fs from 'fs/promises';

// Mock dependencies
jest.mock('fs/promises');

describe('ResponseEvaluator', () => {
  let responseEvaluator: ResponseEvaluator;

  beforeEach(() => {
    // Reset the singleton instance
    jest.resetModules();
    responseEvaluator = new ResponseEvaluator();
  });

  describe('evaluateResponseAuto', () => {
    it('should evaluate a response automatically', async () => {
      const evaluation = await responseEvaluator.evaluateResponseAuto(
        'test-request',
        'test-model',
        LLMConversationType.TEXT_TO_TEXT,
        'What is the capital of France?',
        'The capital of France is Paris.'
      );

      expect(evaluation.criteria.overall).toBeGreaterThan(5);
    });
  });

  describe('recordHumanEvaluation', () => {
    it('should record a human evaluation', () => {
      const evaluationData = {
        requestId: 'test-request',
        modelName: 'test-model',
        conversationType: LLMConversationType.TEXT_TO_TEXT,
        prompt: 'test-prompt',
        response: 'test-response',
        scores: { relevance: 9, accuracy: 9, helpfulness: 9, creativity: 9, overall: 9 },
      };

      const evaluation = responseEvaluator.recordHumanEvaluation(evaluationData);

      expect(evaluation.evaluationType).toBe('human');
      expect(evaluation.criteria.overall).toBe(9);
    });
  });

  describe('getAverageScoresForModel', () => {
    it('should calculate the average scores for a model', async () => {
      await responseEvaluator.evaluateResponseAuto(
        'test-request-1',
        'test-model',
        LLMConversationType.TEXT_TO_TEXT,
        'prompt1',
        'response1'
      );
      await responseEvaluator.evaluateResponseAuto(
        'test-request-2',
        'test-model',
        LLMConversationType.TEXT_TO_TEXT,
        'prompt2',
        'response2'
      );

      const averageScores = responseEvaluator.getAverageScoresForModel('test-model');

      expect(averageScores).not.toBeNull();
      expect(averageScores!.overall).toBeGreaterThan(0);
    });
  });
});
