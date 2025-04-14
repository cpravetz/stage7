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
    private performanceTracker: ModelPerformanceTracker;
    private activeRequests: Map<string, { modelName: string, conversationType: LLMConversationType, startTime: number }> = new Map();

    constructor() {
        this.performanceTracker = new ModelPerformanceTracker();
        this.loadModels();
    }

    private async loadModels() {
        const modelsDirectory = path.join(__dirname, '..', 'models');

        try {
            const files = await fs.readdir(modelsDirectory);
            console.log('Files in models directory', modelsDirectory, ':', files);
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
        let bestModel: BaseModel | null = null;
        let bestScore = -Infinity;

        for (const model of this.models.values()) {
            if (model.contentConversation.includes(conversationType)) {
                const score = this.calculateScore(model, optimization, conversationType);
                if (score > bestScore) {
                    bestScore = score;
                    bestModel = model;
                }
            }
        }
        console.log(`Selected model: ${bestModel?.name} with score ${bestScore} for ${optimization} and conversation type ${conversationType}`);
        return bestModel;
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

        // Adjust score based on actual performance
        return this.performanceTracker.adjustModelScore(baseScore, model.name, conversationType);
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

        // Track request in performance tracker
        this.performanceTracker.trackRequest(requestId, modelName, conversationType, prompt);

        // Store active request
        this.activeRequests.set(requestId, {
            modelName,
            conversationType,
            startTime: Date.now()
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
    trackModelResponse(requestId: string, response: string, tokenCount: number, success: boolean, error?: string): void {
        // Get active request
        const request = this.activeRequests.get(requestId);
        if (!request) {
            console.error(`No active request found for request ID ${requestId}`);
            return;
        }

        // Track response in performance tracker
        this.performanceTracker.trackResponse(requestId, response, tokenCount, success, error);

        // Remove active request
        this.activeRequests.delete(requestId);
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
    getModelRankings(conversationType: LLMConversationType, metric: 'successRate' | 'averageLatency' | 'overall' = 'overall') {
        return this.performanceTracker.getModelRankings(conversationType, metric);
    }

    /**
     * Get all performance data
     * @returns Performance data for all models
     */
    getAllPerformanceData() {
        return this.performanceTracker.getAllPerformanceData();
    }
}