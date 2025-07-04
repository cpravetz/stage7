import { LLMConversationType } from '../interfaces/baseInterface';
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
  private requestHistory: Map<string, RequestData> = new Map();

  private saveInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.loadPerformanceData();

    // Reset any excessive blacklists on startup
    this.resetExcessiveBlacklists();

    // Set up periodic saving - more frequent (every 2 minutes)
    this.saveInterval = setInterval(() => {
      console.log('Checking for excessive blacklists on regular interval...');
      // Reset excessive blacklists during periodic check
      this.resetExcessiveBlacklists();
    }, 2 * 60 * 1000); // Check every 2 minutes

    // Handle process exit to save data
    process.on('SIGINT', this.handleExit.bind(this));
    process.on('SIGTERM', this.handleExit.bind(this));
  }

  /**
   * Handle process exit - clean up interval
   */
  private async handleExit() {
    console.log('Process exiting...');
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    console.log('Cleanup complete');
  }

  /**
   * Load performance data from memory
   * This method initializes the performance data with an empty map
   * The Brain service will handle loading data from Librarian when needed
   */
  private async loadPerformanceData(): Promise<void> {
    try {
      // Initialize with empty data
      this.performanceData = new Map();
      console.log('[PerformanceTracker] Initialized with empty performance data');
    } catch (error) {
      console.error('Error initializing performance data:', error);
      analyzeError(error as Error);
      this.performanceData = new Map();
    }
  }

  /**
   * Save performance data
   * This is a placeholder method that doesn't actually save to disk
   * The Brain service will handle saving to Librarian
   * @public - This method is public so it can be called from outside
   */
  async savePerformanceData(): Promise<void> {
    // This is now a no-op method since saving is handled by the Brain service
    // which calls getAllPerformanceData() and sends it to Librarian
    console.log('[PerformanceTracker] savePerformanceData called - data will be synced by Brain service');
    return Promise.resolve();
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
    console.log(`[PerformanceTracker] Tracking request ${requestId} for model ${modelName}, conversation type ${conversationType}`);

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

    console.log(`[PerformanceTracker] Request history size: ${this.requestHistory.size}`);
    console.log(`[PerformanceTracker] Current performance data contains ${this.performanceData.size} models`);

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
    error?: string,
    isRetry?: boolean
  ): void {
    console.log(`[PerformanceTracker] Tracking response for request ${requestId}, success: ${success}, token count: ${tokenCount}, isRetry: ${isRetry}`);
    if (error) {
      console.log(`[PerformanceTracker] Error details: ${error}`);
    }

    // Get request data
    const requestData = this.requestHistory.get(requestId);
    if (!requestData) {
      console.error(`No request data found for request ID ${requestId}`);
      return;
    }

    console.log(`[PerformanceTracker] Found request data for model ${requestData.modelName}, conversation type ${requestData.conversationType}`);

    // Update request data
    requestData.response = response;
    requestData.endTime = Date.now();
    requestData.tokenCount = tokenCount;
    requestData.success = success;
    requestData.error = error;

    // Calculate latency
    const latency = requestData.endTime - requestData.startTime;
    console.log(`[PerformanceTracker] Request latency: ${latency}ms`);

    // Update performance metrics
    this.updateMetrics(requestData, isRetry);

    // Get updated metrics for logging
    const modelData = this.performanceData.get(requestData.modelName);
    if (modelData && modelData.metrics[requestData.conversationType]) {
      const metrics = modelData.metrics[requestData.conversationType];
      console.log(`[PerformanceTracker] Updated metrics for model ${requestData.modelName}:
        - Usage count: ${metrics.usageCount}
        - Success rate: ${metrics.successRate.toFixed(2)}
        - Average latency: ${metrics.averageLatency.toFixed(2)}ms
        - Average token count: ${metrics.averageTokenCount.toFixed(2)}
        - Consecutive failures: ${metrics.consecutiveFailures}
        - Blacklisted: ${metrics.blacklistedUntil ? 'Yes, until ' + new Date(metrics.blacklistedUntil).toLocaleString() : 'No'}`);
    }

    console.log(`[PerformanceTracker] Current performance data size: ${this.performanceData.size} models`);

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
  private updateMetrics(requestData: RequestData, isRetry: boolean = false): void {
    const { modelName, conversationType, startTime, endTime, tokenCount, success, error } = requestData;
    console.log(`[PerformanceTracker] Updating metrics for model ${modelName}, conversation type ${conversationType}, success: ${success}, isRetry: ${isRetry}`);

    // Get or create model data
    let modelData = this.performanceData.get(modelName);
    if (!modelData) {
      console.log(`[PerformanceTracker] Creating new model data for ${modelName}`);
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
      console.log(`[PerformanceTracker] Creating new metrics for ${modelName}, conversation type ${conversationType}`);
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
    if (!isRetry) {
        const oldUsageCount = metrics.usageCount;
        metrics.usageCount++;
        console.log(`[PerformanceTracker] Incremented usage count for ${modelName} from ${oldUsageCount} to ${metrics.usageCount}`);
    }

    if (success) {
      const oldSuccessCount = metrics.successCount;
      metrics.successCount++;
      console.log(`[PerformanceTracker] Incremented success count for ${modelName} from ${oldSuccessCount} to ${metrics.successCount}`);

      // Reset consecutive failures on success
      if (metrics.consecutiveFailures > 0) {
        console.log(`[PerformanceTracker] Resetting consecutive failures for ${modelName} from ${metrics.consecutiveFailures} to 0`);
        metrics.consecutiveFailures = 0;
      }
    } else {
      const oldFailureCount = metrics.failureCount;
      metrics.failureCount++;
      console.log(`[PerformanceTracker] Incremented failure count for ${modelName} from ${oldFailureCount} to ${metrics.failureCount}`);

      // Track consecutive failures
      metrics.consecutiveFailures++;
      metrics.lastFailureTime = new Date().toISOString();
      console.log(`[PerformanceTracker] Incremented consecutive failures for ${modelName} to ${metrics.consecutiveFailures}`);

      if (error) {
        console.log(`[PerformanceTracker] Failure reason: ${error}`);
      }

      // Blacklist model if it has too many consecutive failures
      // Blacklist duration increases with more failures
      // Huggingface models are blacklisted more aggressively
      const isHuggingfaceModel = modelName.toLowerCase().includes('huggingface') || modelName.toLowerCase().includes('hf/');
      const blacklistThreshold = isHuggingfaceModel ? 2 : 3; // Lower threshold for Huggingface models

      if (metrics.consecutiveFailures >= blacklistThreshold) {
        // Calculate blacklist duration: 1 hour * 2^(consecutiveFailures-threshold)
        // For regular models: 3 failures: 1 hour, 4 failures: 2 hours, 5 failures: 4 hours, etc.
        // For Huggingface: 2 failures: 1 hour, 3 failures: 2 hours, 4 failures: 4 hours, etc.
        let blacklistHours = Math.pow(2, metrics.consecutiveFailures - blacklistThreshold);

        // Set a reasonable maximum blacklist duration
        const MAX_BLACKLIST_HOURS = 24; // Maximum 24 hours for regular models
        const MAX_HUGGINGFACE_BLACKLIST_HOURS = 168; // Maximum 7 days (168 hours) for Huggingface models

        // Cap the blacklist hours to the maximum
        if (isHuggingfaceModel) {
          blacklistHours = Math.min(blacklistHours, MAX_HUGGINGFACE_BLACKLIST_HOURS);
        } else {
          blacklistHours = Math.min(blacklistHours, MAX_BLACKLIST_HOURS);
        }

        // Huggingface models get longer blacklist periods
        const multiplier = isHuggingfaceModel ? 4 : 1; // 4x longer blacklist for Huggingface models
        const actualBlacklistHours = blacklistHours * multiplier;
        const blacklistDuration = actualBlacklistHours * 60 * 60 * 1000; // Convert to milliseconds

        const blacklistedUntil = new Date(Date.now() + blacklistDuration);
        metrics.blacklistedUntil = blacklistedUntil.toISOString();

        console.log(`[PerformanceTracker] Model ${modelName} blacklisted for ${actualBlacklistHours} hour(s) until ${blacklistedUntil.toLocaleString()} due to ${metrics.consecutiveFailures} consecutive failures`);

        if (isHuggingfaceModel) {
          console.log(`[PerformanceTracker] Huggingface model ${modelName} blacklisted more aggressively due to frequent failures`);
        }
      }
    }

    // Calculate success rate
    const oldSuccessRate = metrics.successRate;
    metrics.successRate = metrics.usageCount > 0 ? metrics.successCount / metrics.usageCount : 0;
    console.log(`[PerformanceTracker] Updated success rate for ${modelName} from ${oldSuccessRate.toFixed(2)} to ${metrics.successRate.toFixed(2)}`);

    // Update latency (moving average)
    const latency = endTime - startTime;
    const oldLatency = metrics.averageLatency;
    metrics.averageLatency = metrics.averageLatency === 0
      ? latency
      : (metrics.averageLatency * 0.9) + (latency * 0.1);
    console.log(`[PerformanceTracker] Updated average latency for ${modelName} from ${oldLatency.toFixed(2)}ms to ${metrics.averageLatency.toFixed(2)}ms`);

    // Update token count (moving average)
    const oldTokenCount = metrics.averageTokenCount;
    metrics.averageTokenCount = metrics.averageTokenCount === 0
      ? tokenCount
      : (metrics.averageTokenCount * 0.9) + (tokenCount * 0.1);
    console.log(`[PerformanceTracker] Updated average token count for ${modelName} from ${oldTokenCount.toFixed(2)} to ${metrics.averageTokenCount.toFixed(2)}`);

    metrics.lastUsed = new Date().toISOString();

    // Update model data
    modelData.lastUpdated = new Date().toISOString();

    // Log significant updates that would trigger a save
    if (metrics.usageCount % 5 === 0 || !success) {
      console.log(`[PerformanceTracker] Significant update detected (usageCount: ${metrics.usageCount}, success: ${success})`);
    }
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
   * Update model feedback scores directly from evaluation
   * @param modelName Model name
   * @param conversationType Conversation type
   * @param scores Evaluation scores
   */
  updateModelFeedback(
    modelName: string,
    conversationType: LLMConversationType,
    scores: any
  ): void {
    console.log(`[PerformanceTracker] Updating feedback for model ${modelName}, conversation type ${conversationType}`);
    console.log(`[PerformanceTracker] Received scores:`, JSON.stringify(scores, null, 2));

    // Get or create model data
    let modelData = this.performanceData.get(modelName);
    if (!modelData) {
      console.log(`[PerformanceTracker] Creating new performance data for model ${modelName}`);
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
      console.log(`[PerformanceTracker] Creating new metrics for conversation type ${conversationType}`);
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

    // Update feedback scores (moving average)
    const { feedbackScores } = metrics;
    const weight = 0.2; // Higher weight for direct evaluations

    console.log(`[PerformanceTracker] Current feedback scores for ${modelName}:`, JSON.stringify(feedbackScores, null, 2));

    // Track old values for logging
    const oldScores = { ...feedbackScores };

    if (scores.relevance !== undefined) {
      feedbackScores.relevance = (feedbackScores.relevance * (1 - weight)) + (scores.relevance * weight);
      console.log(`[PerformanceTracker] Updated relevance score from ${oldScores.relevance.toFixed(2)} to ${feedbackScores.relevance.toFixed(2)}`);
    }

    if (scores.accuracy !== undefined) {
      feedbackScores.accuracy = (feedbackScores.accuracy * (1 - weight)) + (scores.accuracy * weight);
      console.log(`[PerformanceTracker] Updated accuracy score from ${oldScores.accuracy.toFixed(2)} to ${feedbackScores.accuracy.toFixed(2)}`);
    }

    if (scores.helpfulness !== undefined) {
      feedbackScores.helpfulness = (feedbackScores.helpfulness * (1 - weight)) + (scores.helpfulness * weight);
      console.log(`[PerformanceTracker] Updated helpfulness score from ${oldScores.helpfulness.toFixed(2)} to ${feedbackScores.helpfulness.toFixed(2)}`);
    }

    if (scores.creativity !== undefined) {
      feedbackScores.creativity = (feedbackScores.creativity * (1 - weight)) + (scores.creativity * weight);
      console.log(`[PerformanceTracker] Updated creativity score from ${oldScores.creativity.toFixed(2)} to ${feedbackScores.creativity.toFixed(2)}`);
    }

    if (scores.overall !== undefined) {
      feedbackScores.overall = (feedbackScores.overall * (1 - weight)) + (scores.overall * weight);
      console.log(`[PerformanceTracker] Updated overall score from ${oldScores.overall.toFixed(2)} to ${feedbackScores.overall.toFixed(2)}`);
    } else if (scores.relevance !== undefined || scores.accuracy !== undefined ||
               scores.helpfulness !== undefined || scores.creativity !== undefined) {
      // If overall is not provided but other scores are, calculate a new overall score
      const validScores = [];
      if (scores.relevance !== undefined) validScores.push(scores.relevance);
      if (scores.accuracy !== undefined) validScores.push(scores.accuracy);
      if (scores.helpfulness !== undefined) validScores.push(scores.helpfulness);
      if (scores.creativity !== undefined) validScores.push(scores.creativity);

      if (validScores.length > 0) {
        const avgScore = validScores.reduce((sum, score) => sum + score, 0) / validScores.length;
        feedbackScores.overall = (feedbackScores.overall * (1 - weight)) + (avgScore * weight);
        console.log(`[PerformanceTracker] Calculated and updated overall score from ${oldScores.overall.toFixed(2)} to ${feedbackScores.overall.toFixed(2)}`);
      }
    }

    // Update model data
    modelData.lastUpdated = new Date().toISOString();

    // Save performance data
    console.log(`[PerformanceTracker] Saving performance data after feedback update for ${modelName}`);
    this.savePerformanceData().catch(error => {
      console.error('[PerformanceTracker] Error saving performance data after feedback update:', error);
    });

    console.log(`[PerformanceTracker] Updated feedback scores for model ${modelName}, conversation type ${conversationType}`);
    console.log(`[PerformanceTracker] New feedback scores:`, JSON.stringify(feedbackScores, null, 2));
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
    const data = Array.from(this.performanceData.values());
    console.log(`[PerformanceTracker] Getting all performance data: ${data.length} models`);

    // Log a summary of the data
    if (data.length > 0) {
      console.log('[PerformanceTracker] Performance data summary:');
      data.forEach(model => {
        console.log(`[PerformanceTracker] Model: ${model.modelName}`);
        let totalUsage = 0;
        let hasBlacklisted = false;

        Object.entries(model.metrics).forEach(([type, metrics]) => {
          totalUsage += metrics.usageCount;
          if (metrics.blacklistedUntil) hasBlacklisted = true;
          console.log(`[PerformanceTracker]   - ${type}: usage=${metrics.usageCount}, blacklisted=${metrics.blacklistedUntil ? 'Yes' : 'No'}`);
        });

        console.log(`[PerformanceTracker]   - Total usage: ${totalUsage}`);
        console.log(`[PerformanceTracker]   - Has blacklisted conversation types: ${hasBlacklisted}`);
      });
    }

    return data;
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
        console.log(`Model ${modelName} blacklist period has expired, removing from blacklist`);
      }
      return false;
    }

    // Model is still blacklisted
    return true;
  }

  /**
   * Reset blacklisted models that have been blacklisted for too long
   * This is a safety measure to prevent models from being blacklisted forever
   */
  resetExcessiveBlacklists(): void {
    console.log('Checking for excessive blacklists...');
    const MAX_BLACKLIST_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const now = new Date();
    let resetCount = 0;

    for (const [modelName, modelData] of this.performanceData.entries()) {
      if (modelData && modelData.metrics) {
        for (const [conversationType, metrics] of Object.entries(modelData.metrics)) {
          if (metrics && metrics.blacklistedUntil) {
            const blacklistedUntil = new Date(metrics.blacklistedUntil);
            const blacklistDuration = blacklistedUntil.getTime() - now.getTime();

            // If blacklist duration is more than MAX_BLACKLIST_DURATION_MS, reset it
            if (blacklistDuration > MAX_BLACKLIST_DURATION_MS) {
              // Set a more reasonable blacklist duration (24 hours from now)
              const newBlacklistedUntil = new Date(now.getTime() + (24 * 60 * 60 * 1000));
              metrics.blacklistedUntil = newBlacklistedUntil.toISOString();
              console.log(`Reset excessive blacklist for model ${modelName} (${conversationType}). ` +
                          `Was blacklisted until ${blacklistedUntil.toLocaleString()}, ` +
                          `now until ${newBlacklistedUntil.toLocaleString()}`);
              resetCount++;
            }
          }
        }
      }
    }

    if (resetCount > 0) {
      console.log(`Reset ${resetCount} excessive blacklists`);
      this.savePerformanceData().catch(error => {
        console.error('Error saving performance data after resetting blacklists:', error);
      });
    } else {
      console.log('No excessive blacklists found');
    }
  }

  /**
   * Reset all blacklisted models
   * This can be called manually to clear all blacklists
   */
  resetAllBlacklists(): void {
    console.log('Resetting all blacklisted models...');
    let resetCount = 0;

    for (const [modelName, modelData] of this.performanceData.entries()) {
      if (modelData && modelData.metrics) {
        for (const [conversationType, metrics] of Object.entries(modelData.metrics)) {
          if (metrics && metrics.blacklistedUntil) {
            // Clear the blacklist
            metrics.blacklistedUntil = null;
            // Reset consecutive failures
            metrics.consecutiveFailures = 0;
            console.log(`Reset blacklist for model ${modelName} (${conversationType})`);
            resetCount++;
          }
        }
      }
    }

    if (resetCount > 0) {
      console.log(`Reset ${resetCount} blacklisted models`);
      this.savePerformanceData().catch(error => {
        console.error('Error saving performance data after resetting all blacklists:', error);
      });
    } else {
      console.log('No blacklisted models found');
    }

    // Also clear the global Huggingface blacklist if it exists
    if ((global as any).huggingfaceBlacklistedUntil) {
      (global as any).huggingfaceBlacklistedUntil = null;
      console.log('Cleared global Huggingface blacklist');
    }
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
