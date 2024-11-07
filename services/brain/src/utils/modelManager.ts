import { promises as fs } from 'fs';
import path from 'path';
import { Model, LLMConversionType } from '../models/Model';
import { ModelInterface } from '../interfaces/ModelInterface';
import { analyzeError } from '@cktmcs/errorhandler';

export type OptimizationType = 'cost' | 'accuracy' | 'creativity' | 'speed' | 'continuity';

export class ModelManager {
    private models: Map<string, Model> = new Map();
    private interfaces: Map<string, ModelInterface> = new Map();

    constructor() {
        this.loadModels();
        this.loadInterfaces();
    }

    private async loadInterfaces() {
        const interfaceDirectory = path.join(__dirname, '..','interfaces');

        try {
            const files = await fs.readdir(interfaceDirectory);
            console.log('Files in interface directory',interfaceDirectory,': ', files);
            for (const file of files) {
                // Skip non-TS or non-JS files
                if (!file.endsWith('.ts') && !file.endsWith('.js')) {
                    continue;
                }

                // Dynamically import the model class
                const interfaceModule = await import(path.join(interfaceDirectory, file));

                // Assume that the class name is the default export from the module
                const interfaceInstance = interfaceModule.default;
                if (typeof interfaceInstance === 'object' && interfaceInstance.name) {
                    this.interfaces.set(interfaceInstance.name.toLowerCase(), interfaceInstance);
                    console.log(`Loaded interface: ${interfaceInstance.name}`);
                }
            }
            console.log(`modelManager Loaded ${this.interfaces.size} interfaces.`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading interfaces:', error instanceof Error ? error.message : error);
        }
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
                    this.models.set(modelInstance.name.toLowerCase(), modelInstance);
                    console.log(`Loaded model: ${modelInstance.name}`);
                }
            }
            console.log(`modelManager Loaded ${this.models.size} models.`);
        } catch (error) { analyzeError(error as Error);
            console.error('Error loading models:', error instanceof Error ? error.message : error);
        }
    }

    selectModel(optimization: OptimizationType, conversionType: LLMConversionType = LLMConversionType.TextToText): { model: Model, interface: ModelInterface } | undefined {
        let selectedModel: Model | undefined;

        // Temp force the OpenRouter interface and the llama model for now
        selectedModel = Array.from(this.models.values()).find(model => model.name === 'hf/meta-lamma/llama-3.2-3b-instruct');
        if (selectedModel) {
            const selectedInterface = this.interfaces.get(selectedModel.interfaceKey);
            if (selectedInterface) {
                return { model: selectedModel, interface: selectedInterface };
            }
        }

        const compatibleModels = Array.from(this.models.values()).filter(model => 
            Array.isArray(model.contentConversation) && 
            model.contentConversation.includes(conversionType)
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

        if (selectedModel) {
            const selectedInterface = this.interfaces.get(selectedModel.interfaceKey);
            if (selectedInterface) {
                return { model: selectedModel, interface: selectedInterface };
            }
        }

        return undefined;
    }

    getAvailableModels(): string[] {
        return Array.from(this.models.keys());
    }

}
