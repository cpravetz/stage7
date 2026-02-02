import { promises as fs } from 'fs';
import path from 'path';
import { BaseModel } from '../models/baseModel';
import { serviceManager } from './serviceManager';
import { interfaceManager } from './interfaceManager';
import { BaseInterface } from '../interfaces/baseInterface';
import { LLMConversationType } from '@cktmcs/shared';
import { BaseService } from '../services/baseService';
import { analyzeError } from '@cktmcs/shared';
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
    blacklistModel(modelName: string, until: Date, conversationType: LLMConversationType | null = null): void {
        const metrics = this.performanceTracker.getPerformanceMetrics(modelName, LLMConversationType.TextToText); // Use a default conversation type for fetching failure count
        const consecutiveFailures = metrics ? metrics.consecutiveFailures : 0;
        const backoffTime = Math.pow(2, consecutiveFailures) * 60 * 1000; // Exponential backoff in minutes
        const blacklistUntil = new Date(Date.now() + backoffTime);

        console.log(`Blacklisting model ${modelName} until ${blacklistUntil.toISOString()} due to ${consecutiveFailures} consecutive failures.`);

        if (conversationType) {
            const specificMetrics = this.performanceTracker.getPerformanceMetrics(modelName, conversationType);
            if (specificMetrics) {
                specificMetrics.blacklistedUntil = blacklistUntil.toISOString();
                specificMetrics.consecutiveFailures = Math.max(specificMetrics.consecutiveFailures, 1);
            }
        } else {
            for (const modelConversationType of Object.values(LLMConversationType)) {
                const specificMetrics = this.performanceTracker.getPerformanceMetrics(modelName, modelConversationType);
                if (specificMetrics) {
                    specificMetrics.blacklistedUntil = blacklistUntil.toISOString();
                    specificMetrics.consecutiveFailures = Math.max(specificMetrics.consecutiveFailures, 1);
                }
            }
        }
        this.clearModelSelectionCache();

        // Immediately save the blacklist to disk and trigger database sync
        this.performanceTracker.savePerformanceData().then(() => {
            console.log(`[ModelManager] Blacklist for ${modelName} Type ${conversationType ? conversationType : 'none'} saved to disk`);
            this.triggerImmediateDatabaseSync();
        }).catch(error => {
            console.error(`[ModelManager] Failed to save blacklist for ${modelName} Type ${conversationType ? conversationType : 'none'}:`, error);
        });
    }

    private async loadModels() {
        // Ensure interfaces are loaded before attempting to load models
        await interfaceManager.ready();

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
                    console.log(`[ModelManager Debug] Processing model file: ${file}`);
                    console.log(`[ModelManager Debug] Model name: ${modelInstance.name}, Interface: ${modelInstance.interfaceName}, Service: ${modelInstance.serviceName}`);

                    const interfaceInstance = interfaceManager.getInterface(modelInstance.interfaceName);
                    const serviceInstance = serviceManager.getService(modelInstance.serviceName);

                    console.log(`[ModelManager Debug] Interface instance found: ${!!interfaceInstance}`);
                    console.log(`[ModelManager Debug] Service instance found: ${!!serviceInstance}`);
                    if (serviceInstance) {
                        console.log(`[ModelManager Debug] Service is available: ${serviceInstance.isAvailable()}`);
                    }

                    if (interfaceInstance && serviceInstance?.isAvailable()) {
                        modelInstance.setProviders(interfaceInstance, serviceInstance);
                        this.models.set(modelInstance.name.toLowerCase(), modelInstance);
                        console.log(`Loaded model: ${modelInstance.name}`);
                    } else {
                        console.warn(`[ModelManager Warn] Skipping model ${modelInstance.name} due to missing interface, service, or unavailable service.`);
                    }
                } else {
                    console.warn(`[ModelManager Warn] Skipping file ${file}: default export is not a valid model instance.`);
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

    selectModel(optimization: OptimizationType, conversationType: LLMConversationType, excludedModels: string[] = [], estimatedTokens: number = 0): BaseModel | null {
        console.log(`Selecting model for optimization: ${optimization}, conversationType: ${conversationType}`);

        // Special handling for TextToJSON - if no models are available due to blacklisting, reset blacklist
        if (conversationType === LLMConversationType.TextToJSON) {
            const allTextToJsonModels = Array.from(this.models.values())
                .filter(model => model.contentConversation.includes(conversationType));

            const availableTextToJsonModels = allTextToJsonModels.filter(model => {
                const interfaceInstance = interfaceManager.getInterface(model.interfaceName);
                const service = serviceManager.getService(model.serviceName);
                return interfaceInstance && service && service.isAvailable();
            });

            const nonBlacklistedModels = availableTextToJsonModels.filter(model =>
                !this.performanceTracker.isModelBlacklisted(model.name, conversationType)
            );

            if (availableTextToJsonModels.length > 0 && nonBlacklistedModels.length === 0) {
                console.log(`All TextToJSON models are blacklisted. Resetting all blacklists...`);
                this.performanceTracker.resetAllBlacklists();
                this.clearModelSelectionCache(); // Clear cache to force re-selection
            }
        }

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
        const filterReasons: Map<string, string[]> = new Map();
        const availableModels = Array.from(this.models.values())
            .filter(model => {
                const reasons: string[] = [];

                if (excludedModels.includes(model.name)) {
                    reasons.push('excluded (already tried this request)');
                    filterReasons.set(model.name, reasons);
                    return false;
                }


                // Check if the model can handle the estimated token count
                if (estimatedTokens > 0 && model.tokenLimit < estimatedTokens) {
                    reasons.push(`tokenLimit ${model.tokenLimit} < estimatedTokens ${estimatedTokens}`);
                    filterReasons.set(model.name, reasons);
                    return false;
                }

                // Check if model supports the conversation type
                if (!model.contentConversation.includes(conversationType)) {
                    reasons.push(`does not support conversation type ${conversationType}`);
                    filterReasons.set(model.name, reasons);
                    return false;
                }

                // Check if model's interface is available
                const interfaceInstance = interfaceManager.getInterface(model.interfaceName);
                if (!interfaceInstance) {
                    reasons.push('interface unavailable');
                    filterReasons.set(model.name, reasons);
                    return false;
                }

                // Check if model's service is available
                const service = serviceManager.getService(model.serviceName);
                if (!service) {
                    reasons.push('service unavailable');
                    filterReasons.set(model.name, reasons);
                    return false;
                }
                if (!service.isAvailable()) {
                    reasons.push('service not available');
                    filterReasons.set(model.name, reasons);
                    return false;
                }

                // Check if model is blacklisted
                const isBlacklisted = this.performanceTracker.isModelBlacklisted(model.name, conversationType);
                if (isBlacklisted) {
                    reasons.push('blacklisted');
                    filterReasons.set(model.name, reasons);
                    return false;
                }

                // If we reach here, model is considered available
                console.log(`[ModelSelection] Considering ${model.name}: tokenLimit=${model.tokenLimit}, supports=${model.contentConversation}, not blacklisted`);
                return true;
            });

        if (availableModels.length === 0) {
            console.log(`No available models found for conversation type ${conversationType}`);
            console.log(`Total models checked: ${this.models.size}`);

            // Log per-model filter reasons to aid debugging why selection failed
            for (const model of Array.from(this.models.values())) {
                const reasons = filterReasons.get(model.name) || ['not considered (unexpected)'];
                console.log(`[ModelSelection Debug] Model ${model.name}: ${reasons.join('; ')}`);
            }

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

        // Compute a more balanced reliability boost that reduces bias toward
        // heavily-used models and gives a small exploration bonus to under-used models.
        // This is a universal fix (no hardcoding of any model names).
        let reliabilityBoost = 0;
        const usageCount = performanceMetrics?.usageCount || 0;
        const successRate = performanceMetrics?.successRate || 0;
        const consecutiveFailures = performanceMetrics?.consecutiveFailures || 0;

        if (usageCount > 0) {
            // Scale the success-rate based boost with diminishing returns using log(1+usageCount)
            const usageFactor = Math.log10(1 + usageCount);
            const successRateBoost = successRate * 10 * usageFactor; // scaled boost
            const failuresPenalty = Math.min(consecutiveFailures * 10, 50);
            reliabilityBoost = successRateBoost - failuresPenalty;

            // Small stability bonus for models without recent failures
            if (consecutiveFailures === 0) {
                reliabilityBoost += 5;
            }
        } else {
            // Provide a small baseline for models with no history to avoid starving new models
            reliabilityBoost = 3;
        }

        // Exploration bonus for under-used models to avoid over-reuse of popular models
        const explorationThreshold = 5;
        if (usageCount < explorationThreshold) {
            const explorationBonus = (explorationThreshold - usageCount) * 3; // up to +15
            reliabilityBoost += explorationBonus;
        }

        // Cap reliability boost to avoid overwhelming base score adjustments
        const MAX_BOOST = 30;
        const MIN_BOOST = -50;
        reliabilityBoost = Math.max(MIN_BOOST, Math.min(MAX_BOOST, reliabilityBoost));

        // Adjust score based on actual performance and add reliability boost
        const adjustedScore = this.performanceTracker.adjustModelScore(baseScore, model.name, conversationType);
        const logicFailurePenalty = (performanceMetrics.logicFailureCount || 0) * 15;
        const finalScore = adjustedScore + reliabilityBoost - logicFailurePenalty;

        console.log(`Model ${model.name} score calculation: base=${baseScore}, adjusted=${adjustedScore}, reliability=${reliabilityBoost}, final=${finalScore}`);

        return finalScore;
    }

    getAvailableModels(): string[] {
        return Array.from(this.models.keys());
    }



    getAvailableAndNotBlacklistedModels(conversationType: LLMConversationType): BaseModel[] {
        return Array.from(this.models.values())
            .filter(model => {
                if (!model.contentConversation.includes(conversationType)) {
                    return false;
                }

                const interfaceInstance = interfaceManager.getInterface(model.interfaceName);
                if (!interfaceInstance) {
                    return false;
                }

                const service = serviceManager.getService(model.serviceName);
                if (!service || !service.isAvailable()) {
                    return false;
                }

                if (this.performanceTracker.isModelBlacklisted(model.name, conversationType)) {
                    return false;
                }

                return true;
            });
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
    trackModelResponse(requestId: string, response: string, tokenCount: number, success: boolean, error?: string, isRetry?: boolean, logicFailure: boolean = false): void {
        console.log(`[ModelManager] Tracking model response for request ${requestId}, success: ${success}, token count: ${tokenCount}, isRetry: ${isRetry}, logicFailure: ${logicFailure}`);

        // Get active request
        const request = this.activeRequests.get(requestId);
        if (!request) {
            console.error(`No active request found for request ID ${requestId}`);
            return;
        }

        console.log(`[ModelManager] Found active request for model ${request.modelName}, conversation type ${request.conversationType}`);

        // Track response in performance tracker
        this.performanceTracker.trackResponse(requestId, response, tokenCount, success, error, isRetry);

        if (logicFailure) {
            this.performanceTracker.trackLogicFailure(request.modelName, request.conversationType);
        }

        // If the request failed, clear the model selection cache
        // This ensures we don't keep using a model that's failing
        if (!success) {
            this.clearModelSelectionCache();
        }
    }

    /**
     * Get an active request by ID
     * @param requestId Request ID
     * @returns The active request or undefined
     */
    public getActiveRequest(requestId: string): { modelName: string; conversationType: LLMConversationType; startTime: number } | undefined {
        return this.activeRequests.get(requestId);
    }

    /**
     * Track a logic failure for a model
     * @param modelName Model name
     * @param conversationType Conversation type
     * @param severity "critical" for instruction-following failures, "normal" for others
     */
    public trackLogicFailure(modelName: string, conversationType: LLMConversationType, severity: string = 'normal'): void {
        console.log(`[ModelManager] Tracking ${severity} logic failure for model ${modelName}, conversation type ${conversationType}`);
        this.performanceTracker.trackLogicFailure(modelName, conversationType, severity);
        // Clear cache so next selection considers the updated logic failure count
        this.clearModelSelectionCache();
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
     * Trigger immediate database sync for blacklist changes
     * This method can be overridden by Brain to trigger immediate sync
     */

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
     * Get all loaded models
     * @returns Array of all models
     */
    getAllModels(): BaseModel[] {
        return Array.from(this.models.values());
    }

    /**
     * Trigger immediate database sync for blacklist changes
     * This method can be overridden by Brain to trigger immediate sync
     */
    triggerImmediateDatabaseSync(): void {
        // Default implementation - can be overridden by Brain
        console.log('[ModelManager] Immediate database sync requested');
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

    /**
     * Register models from ModelConfiguration objects (seed data)
     * This bridges the gap between the new config-based system and the legacy BaseModel system
     */
    async registerModelsFromConfig(configs: Array<{
        id: string;
        name: string;
        provider: string;
        providerModelId: string;
        supportedConversationTypes: LLMConversationType[];
        tokenLimit: number;
        metadata?: any;
    }>): Promise<number> {
        await interfaceManager.ready();
        
        let registeredCount = 0;
        
        for (const config of configs) {
            try {
                // Find the interface by provider name
                const interfaceInstance = interfaceManager.getInterface(config.provider);
                
                // Find the service - try different naming conventions
                const serviceNames = [
                    `${config.provider.charAt(0).toUpperCase()}${config.provider.slice(1)}Service`,  // e.g., GroqService
                    `${config.provider.toUpperCase()}Service`,  // e.g., GROQService
                    config.provider,  // e.g., groq
                    `${config.provider.charAt(0).toUpperCase()}${config.provider.slice(1).toLowerCase()}Service`  // e.g., GroqService
                ];
                
                let serviceInstance: BaseService | undefined;
                for (const serviceName of serviceNames) {
                    serviceInstance = serviceManager.getService(serviceName);
                    if (serviceInstance) break;
                }
                
                // Also try common service name mappings
                if (!serviceInstance) {
                    const serviceNameMap: Record<string, string> = {
                        'openai': 'OAService',
                        'anthropic': 'AntService',
                        'google': 'GeminiService',
                        'gemini': 'GeminiService',
                        'groq': 'GroqService',
                        'openrouter': 'ORService',
                        'huggingface': 'HFService',
                        'mistral': 'MistralService',
                        'openwebui': 'OWService',
                        'openweb': 'OWService',
                        'cloudflare': 'cloudflare-workers-ai',
                        'aiml': 'AIMLService',
                        'gg': 'GGService'
                    };
                    const mappedName = serviceNameMap[config.provider.toLowerCase()];
                    if (mappedName) {
                        serviceInstance = serviceManager.getService(mappedName);
                    }
                }

                if (!interfaceInstance) {
                    console.warn(`[ModelManager] No interface found for provider "${config.provider}", skipping model ${config.name}`);
                    continue;
                }

                if (!serviceInstance) {
                    console.warn(`[ModelManager] No service found for provider "${config.provider}", skipping model ${config.name}`);
                    continue;
                }

                if (!serviceInstance.isAvailable()) {
                    console.warn(`[ModelManager] Service for provider "${config.provider}" is not available, skipping model ${config.name}`);
                    continue;
                }

                // Build scores map from metadata
                const scoresMap = new Map<LLMConversationType, { costScore: number; accuracyScore: number; creativityScore: number; speedScore: number }>();
                if (config.metadata?.scores) {
                    for (const [typeKey, score] of Object.entries(config.metadata.scores)) {
                        const convType = (LLMConversationType as Record<string, any>)[typeKey] || typeKey;
                        scoresMap.set(convType, score as { costScore: number; accuracyScore: number; creativityScore: number; speedScore: number });
                    }
                }

                // Create the BaseModel instance
                const modelInstance = new BaseModel({
                    name: config.name,
                    modelName: config.providerModelId,
                    interfaceName: config.provider,
                    serviceName: serviceInstance.serviceName,
                    tokenLimit: config.tokenLimit,
                    scoresByConversationType: scoresMap,
                    contentConversation: config.supportedConversationTypes
                });

                // Set the providers
                modelInstance.setProviders(interfaceInstance as BaseInterface, serviceInstance);

                // Register the model
                this.models.set(config.name.toLowerCase(), modelInstance);
                registeredCount++;
                console.log(`[ModelManager] Registered model from config: ${config.name}`);
                
            } catch (error) {
                console.error(`[ModelManager] Error registering model ${config.name}:`, error);
            }
        }

        console.log(`[ModelManager] Registered ${registeredCount} models from configuration`);
        return registeredCount;
    }
}

// Create and export a singleton instance
export const modelManagerInstance = new ModelManager();