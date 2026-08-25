import axios from 'axios';
import { ModelConfiguration } from '../types/ModelConfig';
import { modelConfigService } from './ModelConfigService';
import { LLMConversationType } from '@cktmcs/shared';

const DEFAULT_SCORES = {
    costScore: 70,
    accuracyScore: 80,
    creativityScore: 75,
    speedScore: 80
} as const;

function inferCapabilities(modelName: string, provider: string): string[] {
    const name = modelName.toLowerCase();
    const capabilities: string[] = ['text_generation'];

    if (name.includes('vision') || name.includes('-v') || name.includes('vision') || name.includes('llava') || name.includes('gemini') || name.includes('claude-3') || name.includes('gpt-4o')) {
        capabilities.push('vision');
    }
    if (name.includes('json') || name.includes('instruct') || name.includes('turbo') || name.includes('gpt') || name.includes('claude') || name.includes('gemini')) {
        capabilities.push('json_mode');
    }
    if (name.includes('tool') || name.includes('function') || name.includes('claude') || name.includes('gpt') || name.includes('gemini')) {
        capabilities.push('function_calling');
    }
    if (name.includes('embed') || name.includes('embedding')) {
        capabilities.push('embeddings');
    }

    if (provider === 'openai' && (name.includes('gpt-4') || name.includes('gpt-3.5'))) {
        capabilities.push('function_calling', 'json_mode');
    }
    if (provider === 'anthropic' && name.includes('claude')) {
        capabilities.push('function_calling', 'json_mode');
    }
    if (provider === 'google' && name.includes('gemini')) {
        capabilities.push('vision', 'function_calling', 'json_mode', 'system_instructions');
    }
    if (provider === 'openrouter') {
        capabilities.push('json_mode');
    }

    return capabilities;
}

function computeInitialScores(modelName: string, pricing?: { input: number; output: number }): Record<string, { costScore: number; accuracyScore: number; creativityScore: number; speedScore: number }> {
    const name = modelName.toLowerCase();
    const inputCost = pricing?.input || 0;
    const outputCost = pricing?.output || 0;
    const avgCost = (inputCost + outputCost) / 2;

    let costScore = 70;
    if (avgCost === 0) costScore = 100;
    else if (avgCost < 0.001) costScore = 90;
    else if (avgCost < 0.01) costScore = 70;
    else if (avgCost < 0.1) costScore = 50;
    else if (avgCost < 1) costScore = 30;
    else costScore = 20;

    let accuracyScore = 80;
    let creativityScore = 75;
    let speedScore = 80;

    if (name.includes('opus') || name.includes('gpt-4') || name.includes('gemini-pro') || name.includes('claude-3-opus')) {
        accuracyScore = 95;
        creativityScore = 90;
        speedScore = 80;
    } else if (name.includes('sonnet') || name.includes('gpt-4o') || name.includes('gemini')) {
        accuracyScore = 90;
        creativityScore = 85;
        speedScore = 85;
    } else if (name.includes('haiku') || name.includes('flash') || name.includes('3b') || name.includes('7b') || name.includes('llama-3.2')) {
        accuracyScore = 75;
        creativityScore = 70;
        speedScore = 90;
    } else if (name.includes('70b') || name.includes('405b') || name.includes('llama-3.3')) {
        accuracyScore = 85;
        creativityScore = 80;
        speedScore = 75;
    }

    const scores: Record<string, { costScore: number; accuracyScore: number; creativityScore: number; speedScore: number }> = {};
    for (const convType of Object.values(LLMConversationType)) {
        scores[convType] = { costScore, accuracyScore, creativityScore, speedScore };
    }
    return scores;
}

export class ModelDiscoveryService {
    private static instance: ModelDiscoveryService;

    private constructor() {}

    static getInstance(): ModelDiscoveryService {
        if (!ModelDiscoveryService.instance) {
            ModelDiscoveryService.instance = new ModelDiscoveryService();
        }
        return ModelDiscoveryService.instance;
    }

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
            case 'groq':
                discoveredModels = await this.discoverGroqModels(apiKey);
                break;
            case 'mistral':
                discoveredModels = await this.discoverMistralModels(apiKey);
                break;
            case 'huggingface':
                discoveredModels = await this.discoverHuggingfaceModels(apiKey);
                break;
            default:
                console.log(`[ModelDiscoveryService] Discovery not implemented for provider: ${provider}`);
                return;
        }

        if (discoveredModels.length > 0) {
            await this.updateModelConfigs(service, discoveredModels);
        }
    }

    private async discoverOpenAIModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        try {
            const response = await axios.get('https://api.openai.com/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            return response.data.data.map((m: any) => ({
                providerModelId: m.id,
                name: m.id,
                tokenLimit: this.inferTokenLimit(m.id),
                capabilities: inferCapabilities(m.id, 'openai'),
                scoresByConversationType: computeInitialScores(m.id),
                status: 'active' as const,
            }));
        } catch (error) {
            console.error('[ModelDiscoveryService] Error fetching OpenAI models:', error);
            return [];
        }
    }

    private async discoverOpenRouterModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        try {
            const response = await axios.get('https://openrouter.ai/api/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            return response.data.data.map((m: any) => {
                const pricing = {
                    input: parseFloat(m.pricing?.prompt || '0') * 1000,
                    output: parseFloat(m.pricing?.completion || '0') * 1000
                };
                return {
                    providerModelId: m.id,
                    name: m.name || m.id,
                    tokenLimit: m.context_length,
                    costPer1kTokens: pricing,
                    capabilities: inferCapabilities(m.id, 'openrouter'),
                    scoresByConversationType: computeInitialScores(m.id, pricing),
                    status: 'active' as const,
                };
            });
        } catch (error) {
            console.error('[ModelDiscoveryService] Error fetching OpenRouter models:', error);
            return [];
        }
    }

    private async discoverAnthropicModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
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
                tokenLimit: this.inferTokenLimit(m.id),
                capabilities: inferCapabilities(m.id, 'anthropic'),
                scoresByConversationType: computeInitialScores(m.id),
                status: 'active' as const,
            }));
        } catch (error) {
            console.warn('[ModelDiscoveryService] Anthropic discovery API not available, using known models');
            return [
                { providerModelId: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', tokenLimit: 200000, capabilities: inferCapabilities('claude-sonnet-4', 'anthropic'), scoresByConversationType: computeInitialScores('claude-sonnet-4'), status: 'active' as const },
                { providerModelId: 'claude-3-5-sonnet-20240620', name: 'Claude 3.5 Sonnet', tokenLimit: 200000, capabilities: inferCapabilities('claude-3-5-sonnet', 'anthropic'), scoresByConversationType: computeInitialScores('claude-3-5-sonnet'), status: 'active' as const },
                { providerModelId: 'claude-3-opus-20240229', name: 'Claude 3 Opus', tokenLimit: 200000, capabilities: inferCapabilities('claude-3-opus', 'anthropic'), scoresByConversationType: computeInitialScores('claude-3-opus'), status: 'active' as const },
                { providerModelId: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', tokenLimit: 200000, capabilities: inferCapabilities('claude-3-haiku', 'anthropic'), scoresByConversationType: computeInitialScores('claude-3-haiku'), status: 'active' as const }
            ];
        }
    }

    private async discoverGoogleModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        try {
            const response = await axios.get(`https://generativelanguage.googleapis.com/v1/models?key=${apiKey}`);

            return response.data.models.map((m: any) => ({
                providerModelId: m.name.replace('models/', ''),
                name: m.displayName || m.name,
                tokenLimit: m.inputTokenLimit || m.outputTokenLimit || this.inferTokenLimit(m.name),
                capabilities: inferCapabilities(m.name, 'google'),
                scoresByConversationType: computeInitialScores(m.name),
                status: 'active' as const,
            }));
        } catch (error) {
            console.error('[ModelDiscoveryService] Error fetching Google models:', error);
            return [];
        }
    }

    private async discoverGroqModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        try {
            const response = await axios.get('https://api.groq.com/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            return response.data.data.map((m: any) => ({
                providerModelId: m.id,
                name: m.id,
                tokenLimit: m.context_length || this.inferTokenLimit(m.id),
                capabilities: inferCapabilities(m.id, 'groq'),
                scoresByConversationType: computeInitialScores(m.id),
                status: 'active' as const,
            }));
        } catch (error) {
            console.error('[ModelDiscoveryService] Error fetching Groq models:', error);
            return [];
        }
    }

    private async discoverMistralModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        try {
            const response = await axios.get('https://api.mistral.ai/v1/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            return response.data.data.map((m: any) => ({
                providerModelId: m.id,
                name: m.name || m.id,
                tokenLimit: m.context_length || this.inferTokenLimit(m.id),
                capabilities: inferCapabilities(m.id, 'mistral'),
                scoresByConversationType: computeInitialScores(m.id),
                status: 'active' as const,
            }));
        } catch (error) {
            console.error('[ModelDiscoveryService] Error fetching Mistral models:', error);
            return [];
        }
    }

    private async discoverHuggingfaceModels(apiKey: string): Promise<Partial<ModelConfiguration>[]> {
        try {
            const response = await axios.get('https://huggingface.co/api/models', {
                headers: { 'Authorization': `Bearer ${apiKey}` },
                params: { limit: 100 }
            });

            return response.data.map((m: any) => ({
                providerModelId: m.id,
                name: m.id,
                tokenLimit: this.inferTokenLimit(m.id),
                capabilities: inferCapabilities(m.id, 'huggingface'),
                scoresByConversationType: computeInitialScores(m.id),
                status: 'active' as const,
            }));
        } catch (error) {
            console.error('[ModelDiscoveryService] Error fetching HuggingFace models:', error);
            return [];
        }
    }

    private inferTokenLimit(modelId: string): number {
        const name = modelId.toLowerCase();
        if (name.includes('8k') || name.includes('8k')) return 8192;
        if (name.includes('16k')) return 16384;
        if (name.includes('32k')) return 32768;
        if (name.includes('64k')) return 65536;
        if (name.includes('128k') || name.includes('128k')) return 131072;
        if (name.includes('200k')) return 200000;
        if (name.includes('1m') || name.includes('1m')) return 1048576;
        if (name.includes('gpt-4') || name.includes('claude-3') || name.includes('gemini')) return 128000;
        if (name.includes('llama-3.3')) return 128000;
        if (name.includes('llama-3.2')) return 8192;
        return 4096;
    }

    private async updateModelConfigs(service: any, discovered: Partial<ModelConfiguration>[]): Promise<void> {
        const existingModels = await modelConfigService.getActiveModels();
        const serviceModels = existingModels.filter(m => m.provider === service.provider);

        for (const disc of discovered) {
            const existing = serviceModels.find(m => m.providerModelId === disc.providerModelId);

            if (existing) {
                const needsUpdate = this.checkIfUpdateNeeded(existing, disc);
                if (needsUpdate) {
                    console.log(`[ModelDiscoveryService] Updating model ${existing.id} (${disc.providerModelId})`);
                    const updates = { ...disc };
                    delete updates.id;
                    delete updates.provider;
                    delete updates.providerModelId;
                    await modelConfigService.updateModel(existing.id, updates, 'Automatic discovery update', 'system');
                }
            } else {
                console.log(`[ModelDiscoveryService] Discovered new model ${disc.providerModelId} for ${service.provider}`);
                const newModel = this.createNewModelConfig(service, disc);
                await modelConfigService.createModel(newModel, 'system');
            }
        }

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
        if (discovered.capabilities) {
            const existingCaps = existing.capabilities || [];
            const newCaps = discovered.capabilities || [];
            if (JSON.stringify(existingCaps.sort()) !== JSON.stringify(newCaps.sort())) return true;
        }
        if (discovered.scoresByConversationType) {
            const existingScores = existing.scoresByConversationType || {};
            const newScores = discovered.scoresByConversationType || {};
            for (const key of Object.keys(newScores)) {
                if (JSON.stringify(existingScores[key]) !== JSON.stringify(newScores[key])) return true;
            }
        }
        return false;
    }

    private createNewModelConfig(service: any, disc: Partial<ModelConfiguration>): ModelConfiguration {
        const id = disc.providerModelId?.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase() || 'unknown-model';
        const now = new Date().toISOString();
        const capabilities = disc.capabilities || inferCapabilities(disc.providerModelId || '', service.provider);
        const scores = disc.scoresByConversationType || computeInitialScores(disc.name || disc.providerModelId || 'unknown', disc.costPer1kTokens);

        return {
            id: `${service.provider}-${id}`,
            name: disc.name || disc.providerModelId || 'Unknown Model',
            provider: service.provider,
            providerModelId: disc.providerModelId || '',
            tokenLimit: disc.tokenLimit || 4096,
            costPer1kTokens: disc.costPer1kTokens || { input: 0, output: 0 },
            supportedConversationTypes: [LLMConversationType.TextToText],
            capabilities,
            scoresByConversationType: scores,
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
