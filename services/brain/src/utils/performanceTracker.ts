import { LLMConversationType } from '../interfaces/baseInterface';
import fs from 'fs/promises';
import path from 'path';
import { analyzeError } from '@cktmcs/errorhandler';

/**
 * Performance metrics for a model
 */
export interface ModelPerformanceMetrics {
  usageCount: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  averageLatency: number;
  averageTokenCount: number;
  lastUsed: string;
  consecutiveFailures: number;
  lastFailureTime: string | null;
  blacklistedUntil: string | null;
  feedbackScores: {
    relevance: number;
    accuracy: number;
    helpfulness: number;
    creativity: number;
    overall: number;
  };
}

/**
 * Performance data for a model
 */
export interface ModelPerformanceData {
  modelName: string;
  metrics: Record<LLMConversationType, ModelPerformanceMetrics>;
  lastUpdated: string;
}

/**
 * Request data for tracking
 */
export interface RequestData {
  modelName: string;
  conversationType: LLMConversationType;
  prompt: string;
  response: string;
  startTime: number;
  endTime: number;
  tokenCount: number;
  success: boolean;
  error?: string;
}

/**
 * Feedback data for a response
 */
export interface FeedbackData {
  modelName: string;
  conversationType: LLMConversationType;
  requestId: string;
  prompt: string;
  response: string;
  scores: {
    relevance: number;
    accuracy: number;
    helpfulness: number;
    creativity: number;
    overall: number;
  };
  comments?: string;
}

/**
 * Model performance tracker
 */
export class ModelPerformanceTracker {
  private performanceData: Map<string, ModelPerformanceData> = new Map();
  private dataFilePath: string;
  private requestHistory: Map<string, RequestData> = new Map();

  constructor(dataDirectory: string = path.join(__dirname, '..', '..', 'data')) {
    this.dataFilePath = path.join(dataDirectory, 'model-performance.json');
    this.loadPerformanceData();

    // Set up periodic saving
    setInterval(() => this.savePerformanceData(), 5 * 60 * 1000); // Save every 5 minutes
  }

  /**
   * Load performance data from disk
   */
  private async loadPerformanceData(): Promise<void> {
    try {
      // Ensure the data directory exists
      const dataDir = path.dirname(this.dataFilePath);
      await fs.mkdir(dataDir, { recursive: true });

      // Try to read the performance data file
      const data = await fs.readFile(this.dataFilePath, 'utf-8');
      const performanceArray = JSON.parse(data) as ModelPerformanceData[];

      // Convert array to map
      this.performanceData = new Map(
        performanceArray.map(item => [item.modelName, item])
      );

      console.log(`Loaded performance data for ${this.performanceData.size} models`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.log('No performance data file found, starting with empty data');
      } else {
        console.error('Error loading performance data:', error);
        analyzeError(error as Error);
      }
    }
  }

  /**
   * Save performance data to disk
   */
  private async savePerformanceData(): Promise<void> {
    try {
      // Convert map to array for serialization
      const performanceArray = Array.from(this.performanceData.values());

      // Save to file
      await fs.writeFile(
        this.dataFilePath,
        JSON.stringify(performanceArray, null, 2),
        'utf-8'
      );

      console.log(`Saved performance data for ${performanceArray.length} models`);
    } catch (error) {
      console.error('Error saving performance data:', error);
      analyzeError(error as Error);
    }
  }

  /**
   * Get performance metrics for a model and conversation type
   * @param modelName Model name
   * @param conversationType Conversation type
   * @returns Performance metrics
   */
  getPerformanceMetrics(
    modelName: string,
    conversationType: LLMConversationType
  ): ModelPerformanceMetrics {
    const modelData = this.performanceData.get(modelName);

    if (!modelData || !modelData.metrics[conversationType]) {
      return {
        usageCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        averageLatency: 0,
        averageTokenCount: 0,
        lastUsed: new Date().toISOString(),
        consecutiveFailures: 0,
        lastFailureTime: null,
        blacklistedUntil: null,
        feedbackScores: {
          relevance: 0,
          accuracy: 0,
          helpfulness: 0,
          creativity: 0,
          overall: 0
        }
      };
    }

    return modelData.metrics[conversationType];
  }

  /**
   * Track a request to a model
   * @param requestId Request ID
   * @param modelName Model name
   * @param conversationType Conversation type
   * @param prompt Prompt
   * @returns Request ID
   */
  trackRequest(
    requestId: string,
    modelName: string,
    conversationType: LLMConversationType,
    prompt: string
  ): string {
    // Store request data
    this.requestHistory.set(requestId, {
      modelName,
      conversationType,
      prompt,
      response: '',
      startTime: Date.now(),
      endTime: 0,
      tokenCount: 0,
      success: false
    });

    return requestId;
  }

  /**
   * Track a response from a model
   * @param requestId Request ID
   * @param response Response
   * @param tokenCount Token count
   * @param success Success flag
   * @param error Error message
   */
  trackResponse(
    requestId: string,
    response: string,
    tokenCount: number,
    success: boolean,
    error?: string
  ): void {
    // Get request data
    const requestData = this.requestHistory.get(requestId);
    if (!requestData) {
      console.error(`No request data found for request ID ${requestId}`);
      return;
    }

    // Update request data
    requestData.response = response;
    requestData.endTime = Date.now();
    requestData.tokenCount = tokenCount;
    requestData.success = success;
    requestData.error = error;

    // Update performance metrics
    this.updateMetrics(requestData);

    // Clean up request history (keep last 1000 requests)
    if (this.requestHistory.size > 1000) {
      const oldestKey = Array.from(this.requestHistory.keys())[0];
      this.requestHistory.delete(oldestKey);
    }
  }

  /**
   * Update metrics for a model
   * @param requestData Request data
   */
  private updateMetrics(requestData: RequestData): void {
    const { modelName, conversationType, startTime, endTime, tokenCount, success } = requestData;

    // Get or create model data
    let modelData = this.performanceData.get(modelName);
    if (!modelData) {
      modelData = {
        modelName,
        metrics: {} as Record<LLMConversationType, ModelPerformanceMetrics>,
        lastUpdated: new Date().toISOString()
      };
      this.performanceData.set(modelName, modelData);
    }

    // Get or create metrics for conversation type
    let metrics = modelData.metrics[conversationType];
    if (!metrics) {
      metrics = {
        usageCount: 0,
        successCount: 0,
        failureCount: 0,
        successRate: 0,
        averageLatency: 0,
        averageTokenCount: 0,
        lastUsed: new Date().toISOString(),
        consecutiveFailures: 0,
        lastFailureTime: null,
        blacklistedUntil: null,
        feedbackScores: {
          relevance: 0,
          accuracy: 0,
          helpfulness: 0,
          creativity: 0,
          overall: 0
        }
      };
      modelData.metrics[conversationType] = metrics;
    }

    // Update metrics
    metrics.usageCount++;
    if (success) {
      metrics.successCount++;
      // Reset consecutive failures on success
      metrics.consecutiveFailures = 0;
    } else {
      metrics.failureCount++;
      // Track consecutive failures
      metrics.consecutiveFailures++;
      metrics.lastFailureTime = new Date().toISOString();

      // Blacklist model if it has too many consecutive failures
      // Blacklist duration increases with more failures
      if (metrics.consecutiveFailures >= 3) {
        // Calculate blacklist duration: 1 hour * 2^(consecutiveFailures-3)
        // 3 failures: 1 hour, 4 failures: 2 hours, 5 failures: 4 hours, etc.
        const blacklistHours = Math.pow(2, metrics.consecutiveFailures - 3);
        const blacklistDuration = blacklistHours * 60 * 60 * 1000; // Convert to milliseconds

        const blacklistedUntil = new Date(Date.now() + blacklistDuration);
        metrics.blacklistedUntil = blacklistedUntil.toISOString();

        console.log(`Model ${modelName} blacklisted for ${blacklistHours} hour(s) until ${blacklistedUntil.toLocaleString()} due to ${metrics.consecutiveFailures} consecutive failures`);
      }
    }

    metrics.successRate = metrics.successCount / metrics.usageCount;

    // Update latency (moving average)
    const latency = endTime - startTime;
    metrics.averageLatency = metrics.averageLatency === 0
      ? latency
      : (metrics.averageLatency * 0.9) + (latency * 0.1);

    // Update token count (moving average)
    metrics.averageTokenCount = metrics.averageTokenCount === 0
      ? tokenCount
      : (metrics.averageTokenCount * 0.9) + (tokenCount * 0.1);

    metrics.lastUsed = new Date().toISOString();

    // Update model data
    modelData.lastUpdated = new Date().toISOString();
  }

  /**
   * Record feedback for a response
   * @param feedbackData Feedback data
   */
  recordFeedback(feedbackData: FeedbackData): void {
    const { modelName, conversationType, scores } = feedbackData;

    // Get or create model data
    let modelData = this.performanceData.get(modelName);
    if (!modelData) {
      console.error(`No performance data found for model ${modelName}`);
      return;
    }

    // Get or create metrics for conversation type
    let metrics = modelData.metrics[conversationType];
    if (!metrics) {
      console.error(`No metrics found for conversation type ${conversationType}`);
      return;
    }

    // Update feedback scores (moving average)
    const { feedbackScores } = metrics;
    const weight = 0.1; // Weight for new scores

    feedbackScores.relevance = (feedbackScores.relevance * (1 - weight)) + (scores.relevance * weight);
    feedbackScores.accuracy = (feedbackScores.accuracy * (1 - weight)) + (scores.accuracy * weight);
    feedbackScores.helpfulness = (feedbackScores.helpfulness * (1 - weight)) + (scores.helpfulness * weight);
    feedbackScores.creativity = (feedbackScores.creativity * (1 - weight)) + (scores.creativity * weight);
    feedbackScores.overall = (feedbackScores.overall * (1 - weight)) + (scores.overall * weight);

    // Update model data
    modelData.lastUpdated = new Date().toISOString();
  }

  /**
   * Adjust a model's score based on performance metrics
   * @param baseScore Base score
   * @param modelName Model name
   * @param conversationType Conversation type
   * @returns Adjusted score
   */
  adjustModelScore(
    baseScore: number,
    modelName: string,
    conversationType: LLMConversationType
  ): number {
    const metrics = this.getPerformanceMetrics(modelName, conversationType);

    // No adjustment for new models
    if (metrics.usageCount < 10) return baseScore;

    // Adjust score based on success rate
    const successFactor = metrics.successRate * 0.5; // Up to 50% impact

    // Adjust score based on feedback
    const feedbackFactor = metrics.feedbackScores.overall * 0.3; // Up to 30% impact

    // Adjust score based on latency
    const latencyFactor = Math.max(0, 1 - (metrics.averageLatency / 10000)) * 0.2; // Up to 20% impact

    return baseScore * (1 + successFactor + feedbackFactor + latencyFactor);
  }

  /**
   * Get all performance data
   * @returns Performance data for all models
   */
  getAllPerformanceData(): ModelPerformanceData[] {
    return Array.from(this.performanceData.values());
  }

  /**
   * Get request history
   * @param limit Maximum number of requests to return
   * @returns Request history
   */
  getRequestHistory(limit: number = 100): RequestData[] {
    return Array.from(this.requestHistory.values())
      .filter(request => request.endTime > 0) // Only completed requests
      .sort((a, b) => b.endTime - a.endTime) // Sort by end time (newest first)
      .slice(0, limit);
  }

  /**
   * Check if a model is currently blacklisted
   * @param modelName Model name
   * @param conversationType Conversation type
   * @returns True if the model is blacklisted, false otherwise
   */
  isModelBlacklisted(modelName: string, conversationType: LLMConversationType): boolean {
    const metrics = this.getPerformanceMetrics(modelName, conversationType);

    // If the model has no blacklistedUntil date, it's not blacklisted
    if (!metrics.blacklistedUntil) return false;

    // Check if the blacklist period has expired
    const blacklistedUntil = new Date(metrics.blacklistedUntil);
    const now = new Date();

    if (now > blacklistedUntil) {
      // Blacklist period has expired, clear the blacklist
      const modelData = this.performanceData.get(modelName);
      if (modelData && modelData.metrics[conversationType]) {
        modelData.metrics[conversationType].blacklistedUntil = null;
      }
      return false;
    }

    // Model is still blacklisted
    return true;
  }

  /**
   * Get model rankings for a conversation type
   * @param conversationType Conversation type
   * @param metric Metric to rank by
   * @returns Ranked models
   */
  getModelRankings(
    conversationType: LLMConversationType,
    metric: 'successRate' | 'averageLatency' | 'overall' = 'overall'
  ): { modelName: string, score: number }[] {
    const models = Array.from(this.performanceData.values())
      .filter(model => model.metrics[conversationType])
      .map(model => {
        const metrics = model.metrics[conversationType];
        let score: number;

        switch (metric) {
          case 'successRate':
            score = metrics.successRate;
            break;
          case 'averageLatency':
            score = 1 / (metrics.averageLatency || 1); // Invert latency so lower is better
            break;
          case 'overall':
            score = (
              metrics.successRate * 0.4 +
              metrics.feedbackScores.overall * 0.4 +
              (1 / (metrics.averageLatency || 1)) * 0.2
            );
            break;
        }

        return { modelName: model.modelName, score };
      })
      .sort((a, b) => b.score - a.score);

    return models;
  }
}
