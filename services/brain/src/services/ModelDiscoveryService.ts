import axios from 'axios';
import { ModelConfiguration } from '../types/ModelConfig';
import { modelConfigService } from './ModelConfigService';
import { LLMConversationType } from '@cktmcs/shared';

/**
 * ModelDiscoveryService - Discovers and updates LLM model configurations from providers
 */
export class ModelDiscoveryService {
    private static instance: ModelDiscoveryService;

    private constructor() {}

    static getInstance(): ModelDiscoveryService {
        if (!ModelDiscoveryService.instance) {
            ModelDiscoveryService.instance = new ModelDiscoveryService();
        }
        return ModelDiscoveryService.instance;
    }

    /**
     * Discover models from all active services
     */
    async discoverAllModels(): Promise<void> {
        console.log('[ModelDiscoveryService] Starting model discovery for all providers...');

        const services = await modelConfigService.getServices();
        const activeServices = services.filter(s => s.status === 'active');

        for (const service of activeServices) {
            try {
                await this.discoverModelsForService(service);
            } catch (error) {
                console.error(`[ModelDiscoveryService] Error discovering models for ${service.name}:`, error);
            }
        }

        console.log('[ModelDiscoveryService] Model discovery complete');
    }

    /**
     * Discover models for a specific service
     */
    private async discoverModelsForService(service: any): Promise<void> {
        const provider = service.provider.toLowerCase();
        const apiKey = process.env[this.getCredentialEnvVar(provider)];

        if (!apiKey) {
            console.warn(`[ModelDiscoveryService] No API key found for ${provider}, skipping discovery`);
            return;
        }

        let discoveredModels: Partial<ModelConfiguration>[] = [];

        switch (provider) {
            case 'openai':
                discoveredModels = await this.discoverOpenAIModels(apiKey);
                break;
            case 'openrouter':
                discoveredModels = await this.discoverOpenRouterModels(apiKey);
                break;
            case 'anthropic':
                discoveredModels = await this.discoverAnthropicModels(apiKey);
                break;
            case 'google':
                discoveredModels = await this.discoverGoogleModels(apiKey);
                break;
            // Add more providers as needed
            default:
                console.log(`[ModelDiscoveryService] Discovery not implemented for provider: ${provider}`);
                return;
        }

        if (discoveredModels.length > 0) {
            await this.updateModelConfigs(service, discoveredModels);
        }
    }

    private async discoverOpenAIModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        const response = await axios.get('https://api.openai.com/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        return response.data.data.map((m: any) => ({
            providerModelId: m.id,
            name: m.id,
            status: 'active' as const,
            // Basic metadata, pricing not available in this API
        }));
    }

    private async discoverOpenRouterModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        const response = await axios.get('https://openrouter.ai/api/v1/models', {
            headers: { 'Authorization': `Bearer ${apiKey}` }
        });

        return response.data.data.map((m: any) => ({
            providerModelId: m.id,
            name: m.name || m.id,
            tokenLimit: m.context_length,
            costPer1kTokens: {
                input: parseFloat(m.pricing?.prompt || '0') * 1000,
                output: parseFloat(m.pricing?.completion || '0') * 1000
            },
            status: 'active' as const,
        }));
    }

    private async discoverAnthropicModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        // Anthropic models API (as of recent updates)
        try {
            const response = await axios.get('https://api.anthropic.com/v1/models', {
                headers: {
                    'x-api-key': apiKey,
                    'anthropic-version': '2023-06-01'
                }
            });

            return response.data.data.map((m: any) => ({
                providerModelId: m.id,
                name: m.display_name || m.id,
                status: 'active' as const,
            }));
        } catch (error) {
            // Fallback if API is not yet available for this key
            return [
                { providerModelId: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet' },
                { providerModelId: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
                { providerModelId: 'claude-3-sonnet-20240229', name: 'Claude 3 Sonnet' },
                { providerModelId: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku' }
            ];
        }
    }

    private async discoverGoogleModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        const response = await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);

        return response.data.models.map((m: any) => ({
            providerModelId: m.name.replace('models/', ''),
            name: m.displayName || m.name,
            tokenLimit: m.inputTokenLimit,
            status: 'active' as const,
        }));
    }

    /**
     * Update model configurations in the database
     */
    private async updateModelConfigs(service: any, discovered: Partial<ModelConfiguration>[]): Promise<void> {
        const existingModels = await modelConfigService.getActiveModels();
        const serviceModels = existingModels.filter(m => m.provider === service.provider);

        for (const disc of discovered) {
            const existing = serviceModels.find(m => m.providerModelId === disc.providerModelId);

            if (existing) {
                // Update existing model if needed (pricing, etc.)
                const needsUpdate = this.checkIfUpdateNeeded(existing, disc);
                if (needsUpdate) {
                    console.log(`[ModelDiscoveryService] Updating model ${existing.id} (${disc.providerModelId})`);
                    await modelConfigService.updateModel(existing.id, disc, 'Automatic discovery update', 'system');
                }
            } else {
                // Create new model
                console.log(`[ModelDiscoveryService] Discovered new model ${disc.providerModelId} for ${service.provider}`);
                const newModel = this.createNewModelConfig(service, disc);
                await modelConfigService.createModel(newModel, 'system');
            }
        }

        // Check for retired models
        for (const existing of serviceModels) {
            if (existing.status === 'active' && !discovered.find(d => d.providerModelId === existing.providerModelId)) {
                console.log(`[ModelDiscoveryService] Model ${existing.id} (${existing.providerModelId}) no longer found, marking as retired`);
                await modelConfigService.archiveModel(existing.id, 'system');
            }
        }
    }

    private checkIfUpdateNeeded(existing: ModelConfiguration, discovered: Partial<ModelConfiguration>): boolean {
        if (discovered.tokenLimit && existing.tokenLimit !== discovered.tokenLimit) return true;
        if (discovered.costPer1kTokens) {
            if (existing.costPer1kTokens.input !== discovered.costPer1kTokens.input) return true;
            if (existing.costPer1kTokens.output !== discovered.costPer1kTokens.output) return true;
        }
        return false;
    }

    private createNewModelConfig(service: any, disc: Partial<ModelConfiguration>): ModelConfiguration {
        const id = disc.providerModelId?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'unknown-model';
        const now = new Date().toISOString();

        return {
            id: `${service.provider}-${id}`,
            name: disc.name || disc.providerModelId || 'Unknown Model',
            provider: service.provider,
            providerModelId: disc.providerModelId || '',
            tokenLimit: disc.tokenLimit || 4096,
            costPer1kTokens: disc.costPer1kTokens || { input: 0, output: 0 },
            supportedConversationTypes: [LLMConversationType.TextToText],
            status: 'active',
            deployedAt: now,
            rolloutPercentage: 100,
            providerCredentials: {
                keyVault: service.keyVault,
                credentialName: service.credentialName,
                validated: true,
                validatedAt: now
            },
            availability: {
                status: 'available',
                checkedAt: now
            },
            healthChecks: {
                endpoint: service.healthCheckEndpoint,
                method: service.healthCheckMethod as any,
                timeout: 5000,
                expectedStatusCodes: [200, 429],
                frequency: 300000
            },
            metadata: {
                version: '1.0.0',
                releaseNotes: 'Discovered via automatic update',
                knownLimitations: [],
                optimizations: []
            },
            createdAt: now,
            createdBy: 'system',
            updatedAt: now,
            updatedBy: 'system'
        };
    }

    private getCredentialEnvVar(provider: string): string {
        const providerEnvMap: Record<string, string> = {
            'groq': 'GROQ_API_KEY',
            'anthropic': 'ANTHROPIC_API_KEY',
            'openai': 'OPENAI_API_KEY',
            'google': 'GEMINI_API_KEY',
            'mistral': 'MISTRAL_API_KEY',
            'huggingface': 'HUGGINGFACE_API_KEY',
            'openrouter': 'OPENROUTER_API_KEY',
            'openwebui': 'OPENWEBUI_API_KEY',
            'cloudflare': 'CLOUDFLARE_WORKERS_AI_API_TOKEN',
            'aiml': 'AIML_API_KEY',
        };

        return providerEnvMap[provider.toLowerCase()] || `${provider.toUpperCase()}_API_KEY`;
    }
}

export const modelDiscoveryService = ModelDiscoveryService.getInstance();
