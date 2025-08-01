import { LLMConversationType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import fs from 'fs';
import path from 'path';

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
  private static PERSIST_PATH = path.resolve(process.cwd(), 'performance-metrics.json');

  constructor() {
    this.loadPerformanceData();

    // Reset any excessive blacklists on startup
    this.resetExcessiveBlacklists();

    // Set up periodic saving - more frequent (every 2 minutes)
    this.saveInterval = setInterval(() => {
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
   * Load performance data from disk if available
   */
  private async loadPerformanceData(): Promise<void> {
    try {
      if (fs.existsSync(ModelPerformanceTracker.PERSIST_PATH)) {
        const raw = fs.readFileSync(ModelPerformanceTracker.PERSIST_PATH, 'utf-8');
        const arr: ModelPerformanceData[] = JSON.parse(raw);
        this.performanceData = new Map(arr.map(d => [d.modelName, d]));
      } else {
        this.performanceData = new Map();
      }
    } catch (error) {
      console.error('Error initializing performance data:', error);
      analyzeError(error as Error);
      this.performanceData = new Map();
    }
  }

  /**
   * Save performance data to disk
   */
  async savePerformanceData(): Promise<void> {
    try {
      const arr = Array.from(this.performanceData.values());
      fs.writeFileSync(ModelPerformanceTracker.PERSIST_PATH, JSON.stringify(arr, null, 2), 'utf-8');
    } catch (err) {
      console.error('[PerformanceTracker] Error saving performance data:', err);
    }
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
    error?: string,
    isRetry?: boolean
  ): void {
    if (error) {
      console.log(`[PerformanceTracker] Error details: ${error}`);
    }

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

    // Calculate latency
    const latency = requestData.endTime - requestData.startTime;

    // Update performance metrics
    this.updateMetrics(requestData, isRetry);

    // Get updated metrics for logging
    const modelData = this.performanceData.get(requestData.modelName);
    if (modelData && modelData.metrics[requestData.conversationType]) {
      const metrics = modelData.metrics[requestData.conversationType];
    }

    // Clean up request history (keep last 1000 requests)
    if (this.requestHistory.size > 1000) {
      const oldestKey = Array.from(this.requestHistory.keys())[0];
      this.requestHistory.delete(oldestKey);
    }

    // Save after every response
    this.savePerformanceData().catch(e => console.error('[PerformanceTracker] Error saving after response:', e));
  }

  /**
   * Classify an error to determine blacklisting strategy.
   * @param error The error message string.
   * @returns The type of error.
   */
  private classifyError(error?: string): 'FATAL' | 'RETRYABLE' | 'UNKNOWN' {
    if (!error) return 'UNKNOWN';
    const lowerError = error.toLowerCase();

    // Fatal errors that suggest the model/service is down, misconfigured, or unresponsive
    const fatalPatterns = [
      'timeout', 'timed out', 'econnreset', 'econnrefused', 'enotfound',
      'network error', '500', '502', '503', '504', '429', '401', '403'
    ];
    if (fatalPatterns.some(p => lowerError.includes(p))) {
      return 'FATAL';
    }

    // Errors that might be fixed by retrying or changing the prompt (e.g., a flawed response)
    const retryablePatterns = [
      'invalid json', 'malformed json', 'json parse error', 'syntax error', '400'
    ];
    if (retryablePatterns.some(p => lowerError.includes(p))) {
      return 'RETRYABLE';
    }

    // Default to unknown for errors that don't fit the other categories
    return 'UNKNOWN';
  }


  /**
   * Update metrics for a model
   * @param requestData Request data
   */
  private updateMetrics(requestData: RequestData, isRetry: boolean = false): void {
    const { modelName, conversationType, startTime, endTime, tokenCount, success, error } = requestData;

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
    if (!isRetry) {
        const oldUsageCount = metrics.usageCount;
        metrics.usageCount++;
    }

    if (success) {
      const oldSuccessCount = metrics.successCount;
      metrics.successCount++;

      // Reset consecutive failures on success
      if (metrics.consecutiveFailures > 0) {
        metrics.consecutiveFailures = 0;
      }
    } else {
      const oldFailureCount = metrics.failureCount;
      metrics.failureCount++;

      // Track consecutive failures
      metrics.consecutiveFailures++;
      metrics.lastFailureTime = new Date().toISOString();

      if (error) {
        console.log(`[PerformanceTracker] Failure reason: ${error}`);
      }

      const errorType = this.classifyError(error);
      let blacklistThreshold: number;

      switch (errorType) {
        case 'FATAL':
          blacklistThreshold = 1; // Immediate blacklisting for fatal/unresponsive errors
          console.log(`[PerformanceTracker] Fatal error detected for ${modelName} (${error}), using immediate blacklisting.`);
          break;
        case 'RETRYABLE':
          blacklistThreshold = 3; // Higher threshold for fixable/flawed response errors
          console.log(`[PerformanceTracker] Retryable error detected for ${modelName}, using threshold ${blacklistThreshold}.`);
          break;
        default: // UNKNOWN
          blacklistThreshold = 2; // Middle-ground for unknown errors
          console.log(`[PerformanceTracker] Unknown error type for ${modelName}, using threshold ${blacklistThreshold}.`);
          break;
      }

      // Special handling for less reliable models like Huggingface
      const isHuggingfaceModel = modelName.toLowerCase().includes('huggingface') || modelName.toLowerCase().includes('hf/');
      if (isHuggingfaceModel && errorType !== 'FATAL') {
        blacklistThreshold = 2; // More aggressive for Huggingface on non-fatal errors
        console.log(`[PerformanceTracker] Adjusting threshold for Huggingface model to ${blacklistThreshold}.`);
      }

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


        if (isHuggingfaceModel) {
          console.log(`[PerformanceTracker] Huggingface model ${modelName} blacklisted more aggressively due to frequent failures`);
        }
      }
    }

    // Calculate success rate
    const oldSuccessRate = metrics.successRate;
    metrics.successRate = metrics.usageCount > 0 ? metrics.successCount / metrics.usageCount : 0;

    // Update latency (moving average)
    const latency = endTime - startTime;
    const oldLatency = metrics.averageLatency;
    metrics.averageLatency = metrics.averageLatency === 0
      ? latency
      : (metrics.averageLatency * 0.9) + (latency * 0.1);

    // Update token count (moving average)
    const oldTokenCount = metrics.averageTokenCount;
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

    // Update feedback scores (moving average)
    const { feedbackScores } = metrics;
    const weight = 0.2; // Higher weight for direct evaluations

    // Track old values for logging
    const oldScores = { ...feedbackScores };

    if (scores.relevance !== undefined) {
      feedbackScores.relevance = (feedbackScores.relevance * (1 - weight)) + (scores.relevance * weight);
    }

    if (scores.accuracy !== undefined) {
      feedbackScores.accuracy = (feedbackScores.accuracy * (1 - weight)) + (scores.accuracy * weight);
    }

    if (scores.helpfulness !== undefined) {
      feedbackScores.helpfulness = (feedbackScores.helpfulness * (1 - weight)) + (scores.helpfulness * weight);
    }

    if (scores.creativity !== undefined) {
      feedbackScores.creativity = (feedbackScores.creativity * (1 - weight)) + (scores.creativity * weight);
    }

    if (scores.overall !== undefined) {
      feedbackScores.overall = (feedbackScores.overall * (1 - weight)) + (scores.overall * weight);
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
      }
    }

    // Update model data
    modelData.lastUpdated = new Date().toISOString();

    // Save performance data
    this.savePerformanceData().catch(error => {
      console.error('[PerformanceTracker] Error saving performance data after feedback update:', error);
    });

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
   * Get all performance data, including unused models with default metrics
   * @param allModels Array of all models (with .name and .contentConversation)
   * @returns Performance data for all models
   */
  getAllPerformanceData(allModels?: { name: string, contentConversation: LLMConversationType[] }[]): ModelPerformanceData[] {
    // If no allModels provided, fallback to old behavior
    if (!allModels) {
      const data = Array.from(this.performanceData.values());
      return data;
    }

    const data: ModelPerformanceData[] = [];
    const seen = new Set<string>();

    // Add all models, filling in with default metrics if not present
    for (const model of allModels) {
      seen.add(model.name);
      let modelData = this.performanceData.get(model.name);
      if (!modelData) {
        // Create default metrics for all supported conversation types
        const metrics: Partial<Record<LLMConversationType, ModelPerformanceMetrics>> = {};
        for (const convType of model.contentConversation) {
          metrics[convType] = {
            usageCount: 0,
            successCount: 0,
            failureCount: 0,
            successRate: 0,
            averageLatency: 0,
            averageTokenCount: 0,
            lastUsed: '',
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
        modelData = {
          modelName: model.name, // Use unique name
          metrics: metrics as Record<LLMConversationType, ModelPerformanceMetrics>,
          lastUpdated: ''
        };
      } else {
        // Patch: ensure modelName is always the unique name
        modelData.modelName = model.name;
      }
      data.push(modelData);
    }

    // Add any used models not in allModels (shouldn't happen, but for safety)
    for (const [modelName, modelData] of this.performanceData.entries()) {
      if (!seen.has(modelName)) {
        // Patch: ensure modelName is always the unique name
        modelData.modelName = modelName;
        data.push(modelData);
      }
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
              resetCount++;
            }
          }
        }
      }
    }

    if (resetCount > 0) {
      this.savePerformanceData().catch(error => {
        console.error('Error saving performance data after resetting blacklists:', error);
      });
    }
  }

  /**
   * Reset all blacklisted models
   * This can be called manually to clear all blacklists
   */
  resetAllBlacklists(): void {
    let resetCount = 0;

    for (const [modelName, modelData] of this.performanceData.entries()) {
      if (modelData && modelData.metrics) {
        for (const [conversationType, metrics] of Object.entries(modelData.metrics)) {
          if (metrics && metrics.blacklistedUntil) {
            // Clear the blacklist
            metrics.blacklistedUntil = null;
            // Reset consecutive failures
            metrics.consecutiveFailures = 0;
            resetCount++;
          }
        }
      }
    }

    if (resetCount > 0) {
      this.savePerformanceData().catch(error => {
        console.error('Error saving performance data after resetting all blacklists:', error);
      });
    }

    // Also clear the global Huggingface blacklist if it exists
    if ((global as any).huggingfaceBlacklistedUntil) {
      (global as any).huggingfaceBlacklistedUntil = null;
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

  /**
   * Set all performance data (used for restoring from Librarian)
   */
  setAllPerformanceData(perfData: ModelPerformanceData[]): void {
    if (Array.isArray(perfData)) {
      this.performanceData = new Map(perfData.map(d => [d.modelName, d]));
    } else {
      console.warn('[PerformanceTracker] setAllPerformanceData: input is not an array');
    }
  }
}
