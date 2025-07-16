import { promises as fs } from 'fs';
import path from 'path';
import { BaseModel } from '../models/baseModel';
import { serviceManager } from './serviceManager';
import { interfaceManager } from './interfaceManager';
import { BaseInterface, LLMConversationType } from '../interfaces/baseInterface';
import { BaseService } from '../services/baseService';
import { analyzeError } from '@cktmcs/errorhandler';
import { ModelPerformanceTracker } from './performanceTracker';
import { v4 as uuidv4 } from 'uuid';


export type OptimizationType = 'cost' | 'accuracy' | 'creativity' | 'speed' | 'continuity';

export class ModelManager {
    private models: Map<string, BaseModel> = new Map();
    public performanceTracker: ModelPerformanceTracker;
    private activeRequests: Map<string, { modelName: string, conversationType: LLMConversationType, startTime: number }> = new Map();

    // Cache for model selection results
    private modelSelectionCache: Map<string, { model: BaseModel, timestamp: number }> = new Map();
    private readonly CACHE_TTL = 60 * 1000; // 1 minute in milliseconds for testing

    constructor() {
        this.performanceTracker = new ModelPerformanceTracker();
        this.loadModels();
    }

    /**
     * Blacklist a model for a specific duration
     * @param modelName The name of the model to blacklist
     * @param until Date until which the model is blacklisted
     */
    blacklistModel(modelName: string, until: Date): void {
        console.log(`Blacklisting model ${modelName} until ${until.toISOString()}`);
        for (const conversationType of Object.values(LLMConversationType)) {
            const metrics = this.performanceTracker.getPerformanceMetrics(modelName, conversationType);
            if (metrics) {
                metrics.blacklistedUntil = until.toISOString();
                metrics.consecutiveFailures = Math.max(metrics.consecutiveFailures, 5); // Ensure it stays blacklisted
            }
        }
        this.clearModelSelectionCache();
    }

    private async loadModels() {
        const modelsDirectory = path.join(__dirname, '..', 'models');

        try {
            const files = await fs.readdir(modelsDirectory);
            for (const file of files) {
                if (!file.endsWith('.ts') && !file.endsWith('.js')) {
                    continue;
                }

                const modelModule = await import(path.join(modelsDirectory, file));
                const modelInstance = modelModule.default;
                if (typeof modelInstance === 'object' && modelInstance.name) {
                    const interfaceInstance = interfaceManager.getInterface(modelInstance.interfaceName);
                    const serviceInstance = serviceManager.getService(modelInstance.serviceName);
                    if (interfaceInstance && serviceInstance?.isAvailable()) {
                        modelInstance.setProviders(interfaceInstance, serviceInstance);
                        this.models.set(modelInstance.name.toLowerCase(), modelInstance);
                        console.log(`Loaded model: ${modelInstance.name}`);
                    }
                }
            }
            console.log(`modelManager Loaded ${this.models.size} models.`);
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error loading models:', error instanceof Error ? error.message : error);
        }
    }

    getModel(name: string): BaseModel | undefined {
        if (!name) {
            return undefined;
        }
        return this.models.get(name.toLowerCase());
    }

    selectModel(optimization: OptimizationType, conversationType: LLMConversationType): BaseModel | null {
        console.log(`Selecting model for optimization: ${optimization}, conversationType: ${conversationType}`);

        // Check cache first, but only if the cached model is not blacklisted
        const cacheKey = `${optimization}-${conversationType}`;
        const cachedResult = this.modelSelectionCache.get(cacheKey);

        if (cachedResult && (Date.now() - cachedResult.timestamp) < this.CACHE_TTL) {
            // Verify cached model is still available and not blacklisted
            if (cachedResult.model.isAvailable() &&
                !this.performanceTracker.isModelBlacklisted(cachedResult.model.name, conversationType)) {
                console.log(`**** CACHE HIT **** Using cached model selection result: ${cachedResult.model.name}`);
                console.log(`Cache age: ${Math.floor((Date.now() - cachedResult.timestamp) / 1000)} seconds`);
                return cachedResult.model;
            } else {
                console.log(`**** CACHE INVALIDATED **** Cached model ${cachedResult.model.name} is no longer available or blacklisted`);
                this.modelSelectionCache.delete(cacheKey);
            }
        }

        console.log(`**** CACHE MISS **** No cached result for key: ${cacheKey}`);

        console.log(`Cache miss or expired. Selecting model from scratch.`);
        console.log(`Total models loaded: ${this.models.size}`);

        // Get all available models that support the conversation type
        const availableModels = Array.from(this.models.values())
            .filter(model => {

                // Check if model supports the conversation type
                if (!model.contentConversation.includes(conversationType)) {
                    return false;
                }

                // Check if model's interface is available
                const interfaceInstance = interfaceManager.getInterface(model.interfaceName);
                if (!interfaceInstance) {
                    return false;
                }

                // Check if model's service is available
                const service = serviceManager.getService(model.serviceName);
                if (!service) {
                    return false;
                }

                if (!service.isAvailable()) {
                    return false;
                }

                // Check if model is blacklisted
                const isBlacklisted = this.performanceTracker.isModelBlacklisted(model.name, conversationType);
                if (isBlacklisted) {
                    console.log(`Model ${model.name} is blacklisted for conversation type ${conversationType}`);
                    return false;
                } else {
                    console.log(`Model ${model.name} is NOT blacklisted for conversation type ${conversationType}`);
                }

                return true;
            });

        if (availableModels.length === 0) {
            console.log(`No available models found for conversation type ${conversationType}`);
            return null;
        }

        // Sort models by their score for the given optimization
        const scoredModels = availableModels.map(model => {
            const score = this.calculateScore(model, optimization, conversationType);
            return { model, score };
        });

        // Sort by score (highest first)
        scoredModels.sort((a, b) => b.score - a.score);

        // No longer prioritizing specific models - using pure score-based selection
        console.log(`Using score-based model selection. Top model: ${scoredModels.length > 0 ? scoredModels[0].model.name : 'none'}`);

        // Return the highest-scoring model
        if (scoredModels.length > 0) {
            const selectedModel = scoredModels[0].model;
            console.log(`Selected model ${selectedModel.name} for ${optimization} optimization and conversation type ${conversationType}`);

            // Store in cache
            this.modelSelectionCache.set(cacheKey, {
                model: selectedModel,
                timestamp: Date.now()
            });

            return selectedModel;
        }

        console.log('No suitable models found after scoring');
        return null;
    }

    private calculateScore(model: BaseModel, optimization: OptimizationType, conversationType: LLMConversationType): number {
        const scores = model.getScoresForConversationType(conversationType);
        if (!scores) return -Infinity;

        let baseScore: number;
        switch (optimization) {
            case 'speed':
                baseScore = scores.speedScore;
                break;
            case 'accuracy':
                baseScore = scores.accuracyScore;
                break;
            case 'creativity':
                baseScore = scores.creativityScore;
                break;
            case 'cost':
                baseScore = -scores.costScore; // Invert cost score so lower cost is better
                break;
            case 'continuity':
                // You might want to define how to calculate continuity score
                baseScore = (scores.speedScore + scores.accuracyScore + scores.creativityScore - scores.costScore) / 4;
                break;
            default:
                baseScore = (scores.speedScore + scores.accuracyScore + scores.creativityScore - scores.costScore) / 4;
        }

        // Get performance metrics for reliability boost
        const performanceMetrics = this.performanceTracker.getPerformanceMetrics(model.name, conversationType);

        // Apply reliability boost for models with good track records
        let reliabilityBoost = 0;
        if (performanceMetrics.usageCount > 5) { // Only consider models with some usage history
            // Boost score based on success rate and low consecutive failures
            const successRateBoost = performanceMetrics.successRate * 20; // Up to 20 point boost for 100% success rate
            const failuresPenalty = Math.min(performanceMetrics.consecutiveFailures * 10, 50); // Up to 50 point penalty
            reliabilityBoost = successRateBoost - failuresPenalty;

            // Extra boost for models that haven't failed recently
            if (performanceMetrics.consecutiveFailures === 0) {
                reliabilityBoost += 10;
            }
        }

        // Adjust score based on actual performance and add reliability boost
        const adjustedScore = this.performanceTracker.adjustModelScore(baseScore, model.name, conversationType);
        const finalScore = adjustedScore + reliabilityBoost;

        console.log(`Model ${model.name} score calculation: base=${baseScore}, adjusted=${adjustedScore}, reliability=${reliabilityBoost}, final=${finalScore}`);

        return finalScore;
    }

    getAvailableModels(): string[] {
        return Array.from(this.models.keys());
    }

    /**
     * Get all models
     * @returns Map of all models
     */
    getAllModels(): Map<string, BaseModel> {
        return this.models;
    }

    /**
     * Get the interface manager
     * @returns The interface manager
     */
    getInterfaceManager() {
        return interfaceManager;
    }

    /**
     * Get the service manager
     * @returns The service manager
     */
    getServiceManager() {
        return serviceManager;
    }

    // getModel is already defined above

    /**
     * Track a request to a model
     * @param modelName Model name
     * @param conversationType Conversation type
     * @param prompt Prompt
     * @returns Request ID
     */
    trackModelRequest(modelName: string, conversationType: LLMConversationType, prompt: string): string {
        const requestId = uuidv4();

        console.log(`[ModelManager] Tracking model request: ${requestId} for model ${modelName}, conversation type ${conversationType}`);

        // Track request in performance tracker
        this.performanceTracker.trackRequest(requestId, modelName, conversationType, prompt);

        // Store active request
        this.activeRequests.set(requestId, {
            modelName,
            conversationType,
            startTime: Date.now()
        });

        console.log(`[ModelManager] Active requests count: ${this.activeRequests.size}`);

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
    trackModelResponse(requestId: string, response: string, tokenCount: number, success: boolean, error?: string, isRetry?: boolean): void {
        console.log(`[ModelManager] Tracking model response for request ${requestId}, success: ${success}, token count: ${tokenCount}, isRetry: ${isRetry}`);

        // Get active request
        const request = this.activeRequests.get(requestId);
        if (!request) {
            console.error(`No active request found for request ID ${requestId}`);
            return;
        }

        console.log(`[ModelManager] Found active request for model ${request.modelName}, conversation type ${request.conversationType}`);

        // Track response in performance tracker
        this.performanceTracker.trackResponse(requestId, response, tokenCount, success, error, isRetry);

        // If the request failed, clear the model selection cache
        // This ensures we don't keep using a model that's failing
        if (!success) {
            this.clearModelSelectionCache();
        }
    }

    /**
     * Clear the model selection cache
     * This should be called when a model is blacklisted or when model availability changes
     */
    public clearModelSelectionCache(): void {
        console.log('Clearing model selection cache');
        this.modelSelectionCache.clear();
    }

    /**
     * Get performance metrics for a model
     * @param modelName Model name
     * @param conversationType Conversation type
     * @returns Performance metrics
     */
    getModelPerformanceMetrics(modelName: string, conversationType: LLMConversationType) {
        return this.performanceTracker.getPerformanceMetrics(modelName, conversationType);
    }

    /**
     * Get model rankings for a conversation type
     * @param conversationType Conversation type
     * @param metric Metric to rank by
     * @returns Ranked models
     */
    getModelRankings(conversationType: LLMConversationType | string, metric: 'successRate' | 'averageLatency' | 'overall' = 'overall') {
        return this.performanceTracker.getModelRankings(conversationType as LLMConversationType, metric);
    }

    /**
     * Get all performance data in the format expected by the ModelPerformanceDashboard
     * @returns Array of model performance data
     */
    getAllPerformanceData(): Array<{
        modelName: string;
        metrics: Record<string, any>;
    }> {
        const performanceData = this.performanceTracker.getAllPerformanceData();
        const result: Array<{ modelName: string; metrics: Record<string, any> }> = [];

        // Convert the performance data to the expected format
        for (const [modelName, modelData] of Object.entries(performanceData)) {
            if (modelData && modelData.metrics) {
                result.push({
                    modelName,
                    metrics: modelData.metrics
                });
            }
        }

        return result;
    }

    /**
     * Get blacklisted models
     * @returns List of blacklisted models
     */
    getBlacklistedModels() {
        const blacklistedModels = [];

        for (const model of this.models.values()) {
            for (const conversationType of model.contentConversation) {
                if (this.performanceTracker.isModelBlacklisted(model.name, conversationType)) {
                    const metrics = this.performanceTracker.getPerformanceMetrics(model.name, conversationType);
                    blacklistedModels.push({
                        modelName: model.name,
                        conversationType,
                        blacklistedUntil: metrics.blacklistedUntil,
                        consecutiveFailures: metrics.consecutiveFailures,
                        lastFailureTime: metrics.lastFailureTime
                    });
                }
            }
        }

        return blacklistedModels;
    }

    /**
     * Save performance data to disk
     * @returns Promise that resolves when data is saved
     */
    async savePerformanceData(): Promise<void> {
        return this.performanceTracker.savePerformanceData();
    }

    /**
     * Reset all blacklisted models
     */
    resetAllBlacklists(): void {
        return this.performanceTracker.resetAllBlacklists();
    }

    /**
     * Update model performance data based on evaluation
     * @param modelName Model name
     * @param conversationType Conversation type
     * @param scores Evaluation scores
     */
    updateModelPerformanceFromEvaluation(
        modelName: string,
        conversationType: LLMConversationType,
        scores: any
    ): void {
        console.log(`[ModelManager] Updating performance for model ${modelName} with scores:`, scores);

        // Forward to performance tracker
        this.performanceTracker.updateModelFeedback(modelName, conversationType, scores);

        // Clear model selection cache to ensure updated scores are used
        this.clearModelSelectionCache();
    }

    /**
     * Get the count of active model requests
     * @returns Number of active requests
     */
    getActiveRequestsCount(): number {
        return this.activeRequests.size;
    }

    /**
     * Get performance summary
     * @returns Performance summary for all models
     */
    getPerformanceSummary() {
        const summary: {
            totalRequests: number;
            successfulRequests: number;
            failedRequests: number;
            averageLatency: number;
            averageTokenCount: number;
            modelPerformance: Array<{
                modelName: string;
                conversationType: string;
                usageCount: number;
                successRate: number;
                averageLatency: number;
                averageTokenCount: number;
                feedbackScores: any;
            }>;
        } = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            averageLatency: 0,
            averageTokenCount: 0,
            modelPerformance: []
        };

        const performanceData = this.performanceTracker.getAllPerformanceData();

        // Convert the performance data to an array of entries
        const entries = Object.entries(performanceData);

        for (const [modelName, modelData] of entries) {
            if (modelData && modelData.metrics) {
                for (const [conversationType, metrics] of Object.entries(modelData.metrics)) {
                    if (metrics) {
                        summary.totalRequests += metrics.usageCount || 0;
                        summary.successfulRequests += metrics.successCount || 0;
                        summary.failedRequests += metrics.failureCount || 0;

                        // Add model performance data
                        summary.modelPerformance.push({
                            modelName,
                            conversationType,
                            usageCount: metrics.usageCount || 0,
                            successRate: metrics.successRate || 0,
                            averageLatency: metrics.averageLatency || 0,
                            averageTokenCount: metrics.averageTokenCount || 0,
                            feedbackScores: metrics.feedbackScores || {}
                        });
                    }
                }
            }
        }

        // Calculate overall averages
        if (summary.totalRequests > 0) {
            let totalLatency = 0;
            let totalTokens = 0;

            for (const model of summary.modelPerformance) {
                if (model && typeof model.averageLatency === 'number' && typeof model.usageCount === 'number') {
                    totalLatency += model.averageLatency * model.usageCount;
                }

                if (model && typeof model.averageTokenCount === 'number' && typeof model.usageCount === 'number') {
                    totalTokens += model.averageTokenCount * model.usageCount;
                }
            }

            summary.averageLatency = totalLatency / summary.totalRequests;
            summary.averageTokenCount = totalTokens / summary.totalRequests;
        }

        return summary;
    }
}