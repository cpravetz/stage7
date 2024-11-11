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
        const modelsDirectory = path.join(__dirname, '..','models');

        try {
            const files = await fs.readdir(modelsDirectory);
            console.log('Files in models directory',modelsDirectory,': ', files);
            for (const file of files) {
                // Skip non-TS or non-JS files
                if (!file.endsWith('.ts') && !file.endsWith('.js')) {
                    continue;
                }

                // Dynamically import the model class
                const modelModule = await import(path.join(modelsDirectory, file));

                // Assume that the class name is the default export from the module
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
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading models:', error instanceof Error ? error.message : error);
        }
    }

    getModel(name: string) : BaseModel | undefined{
        return this.models.get(name);
    }

    selectModel(optimization: OptimizationType, ConversationType: LLMConversationType = LLMConversationType.TextToText): BaseModel | undefined {
        let selectedModel: BaseModel | undefined;

        const compatibleModels = Array.from(this.models.values()).filter(model => 
            Array.isArray(model.contentConversation) && 
            model.contentConversation.includes(ConversationType)
        );

        if (compatibleModels.length === 0) {
            return undefined;
        }

        switch (optimization) {
            case 'cost':
                selectedModel = compatibleModels.reduce((a, b) => a.costScore > b.costScore ? a : b);
                break;
            case 'accuracy':
                selectedModel = compatibleModels.reduce((a, b) => a.accuracyScore > b.accuracyScore ? a : b);
                break;
            case 'creativity':
                selectedModel = compatibleModels.reduce((a, b) => a.creativityScore > b.creativityScore ? a : b);
                break;
            case 'speed':
                selectedModel = compatibleModels.reduce((a, b) => a.speedScore > b.speedScore ? a : b);
                break;
            case 'continuity':
                // Implement continuity logic if needed
                break;
        }

        if (!selectedModel) {
            selectedModel = Array.from(this.models.values()).find(model => model.name === 'hf/meta-lamma/llama-3.2-3b-instruct');
        }

        if (selectedModel) {
            return selectedModel;
        }

        return undefined;
    }

    getAvailableModels(): string[] {
        return Array.from(this.models.keys());
    }

}
