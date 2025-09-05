
import { ModelPerformanceTracker, RequestData, FeedbackData } from '../src/utils/performanceTracker';
import { LLMConversationType } from '@cktmcs/shared';
import fs from 'fs';

// Mock dependencies
jest.mock('fs');

describe('ModelPerformanceTracker', () => {
  let performanceTracker: ModelPerformanceTracker;

  beforeEach(() => {
    // Reset the singleton instance
    jest.resetModules();
    performanceTracker = new ModelPerformanceTracker();
  });

  describe('trackRequest and trackResponse', () => {
    it('should track a request and response, and update metrics', () => {
      const requestId = 'test-request';
      const modelName = 'test-model';
      const conversationType = LLMConversationType.TEXT_TO_TEXT;

      performanceTracker.trackRequest(requestId, modelName, conversationType, 'test-prompt');
      performanceTracker.trackResponse(requestId, 'test-response', 100, true);

      const metrics = performanceTracker.getPerformanceMetrics(modelName, conversationType);
      expect(metrics.usageCount).toBe(1);
      expect(metrics.successCount).toBe(1);
      expect(metrics.averageLatency).toBeGreaterThan(0);
    });
  });

  describe('recordFeedback', () => {
    it('should record feedback for a model', () => {
      const modelName = 'test-model';
      const conversationType = LLMConversationType.TEXT_TO_TEXT;
      const feedback: FeedbackData = {
        modelName,
        conversationType,
        requestId: 'test-request',
        prompt: 'test-prompt',
        response: 'test-response',
        scores: { relevance: 5, accuracy: 5, helpfulness: 5, creativity: 5, overall: 5 },
      };

      // First, track a request and response to initialize the model data
      performanceTracker.trackRequest('test-request', modelName, conversationType, 'test-prompt');
      performanceTracker.trackResponse('test-request', 'test-response', 100, true);

      performanceTracker.recordFeedback(feedback);

      const metrics = performanceTracker.getPerformanceMetrics(modelName, conversationType);
      expect(metrics.feedbackScores.overall).toBeGreaterThan(0);
    });
  });

  describe('isModelBlacklisted', () => {
    it('should blacklist a model after consecutive failures', () => {
      const modelName = 'test-model';
      const conversationType = LLMConversationType.TEXT_TO_TEXT;

      for (let i = 0; i < 5; i++) {
        const requestId = `test-request-${i}`;
        performanceTracker.trackRequest(requestId, modelName, conversationType, 'test-prompt');
        performanceTracker.trackResponse(requestId, 'test-response', 100, false, 'FATAL');
      }

      const isBlacklisted = performanceTracker.isModelBlacklisted(modelName, conversationType);
      expect(isBlacklisted).toBe(true);
    });
  });
});
