import { promises as fs } from 'fs';
import path from 'path';
import { BaseModel } from '../models/baseModel';
import { serviceManager } from './serviceManager';
import { interfaceManager } from './interfaceManager';
import { BaseInterface, LLMConversationType } from '../interfaces/baseInterface';
import { BaseService } from '../services/baseService';
import { analyzeError } from '@cktmcs/errorhandler';


export type OptimizationType = 'cost' | 'accuracy' | 'creativity' | 'speed' | 'continuity';

export class ModelManager {
    private models: Map<string, BaseModel> = new Map();

    constructor() {
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

        return bestModel;
    }

    private calculateScore(model: BaseModel, optimization: OptimizationType, conversationType: LLMConversationType): number {
        const scores = model.getScoresForConversationType(conversationType);
        if (!scores) return -Infinity;

        switch (optimization) {
            case 'speed':
                return scores.speedScore;
            case 'accuracy':
                return scores.accuracyScore;
            case 'creativity':
                return scores.creativityScore;
            case 'cost':
                return -scores.costScore; // Invert cost score so lower cost is better
            case 'continuity':
                // You might want to define how to calculate continuity score
                return (scores.speedScore + scores.accuracyScore + scores.creativityScore - scores.costScore) / 4;
            default:
                return (scores.speedScore + scores.accuracyScore + scores.creativityScore - scores.costScore) / 4;
        }
    }    

    getAvailableModels(): string[] {
        return Array.from(this.models.keys());
    }
}