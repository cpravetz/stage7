import fs from 'fs';
import path from 'path';
import { ModelConfiguration } from '../types/ModelConfig';
import { LLMConversationType } from '@cktmcs/shared';

/**
 * Service configuration loaded from seedData.json
 */
export interface ServiceConfig {
    id: string;
    name: string;
    serviceName: string;
    provider: string;
    apiUrlBase: string;
    credentialName: string;
    keyVault: string;
    healthCheckEndpoint: string;
    healthCheckMethod: string;
    status: string;
    supportedInterfaces: string[];
    metadata: {
        description: string;
        documentation?: string;
        rateLimit?: string;
        authentication?: string;
    };
}

/**
 * Interface configuration loaded from seedData.json
 */
export interface InterfaceConfig {
    id: string;
    name: string;
    interfaceName: string;
    serviceName: string;
    supportedConversationTypes: string[];
    status: string;
    metadata: {
        description: string;
        models?: string[];
        capabilities?: string[];
    };
}

/**
 * Model score for a specific conversation type
 */
export interface ModelScore {
    costScore: number;
    accuracyScore: number;
    creativityScore: number;
    speedScore: number;
}

/**
 * Raw model data from JSON
 */
export interface RawModelData {
    id: string;
    name: string;
    provider: string;
    providerModelId: string;
    interfaceName: string;
    serviceName: string;
    tokenLimit: number;
    costPer1kTokens: {
        input: number;
        output: number;
    };
    supportedConversationTypes: string[];
    status: string;
    rolloutPercentage: number;
    scoresByConversationType: Record<string, ModelScore>;
    metadata: {
        version?: string;
        releaseDate?: string;
        knownLimitations?: string;
    };
}

/**
 * Seed data structure loaded from JSON
 */
export interface SeedData {
    version: string;
    lastUpdated: string;
    description: string;
    services: ServiceConfig[];
    interfaces: InterfaceConfig[];
    models: RawModelData[];
}

/**
 * SeedDataLoader - Loads and transforms seed data from JSON file
 */
export class SeedDataLoader {
    private static instance: SeedDataLoader;
    private seedData: SeedData | null = null;
    private seedDataPath: string;

    private constructor() {
        // Path to seedData.json relative to this file
        this.seedDataPath = path.join(__dirname, 'seedData.json');
    }

    /**
     * Get singleton instance
     */
    static getInstance(): SeedDataLoader {
        if (!SeedDataLoader.instance) {
            SeedDataLoader.instance = new SeedDataLoader();
        }
        return SeedDataLoader.instance;
    }

    /**
     * Load seed data from JSON file
     */
    async loadSeedData(): Promise<SeedData> {
        if (this.seedData) {
            return this.seedData;
        }

        try {
            if (!fs.existsSync(this.seedDataPath)) {
                throw new Error(`Seed data file not found at ${this.seedDataPath}`);
            }

            const fileContent = fs.readFileSync(this.seedDataPath, 'utf-8');
            this.seedData = JSON.parse(fileContent);

            if (!this.seedData) {
                throw new Error('Failed to parse seed data JSON');
            }

            console.log(`[SeedDataLoader] Loaded seed data: ${this.seedData.models.length} models, ` +
                `${this.seedData.services.length} services, ${this.seedData.interfaces.length} interfaces`);

            return this.seedData;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[SeedDataLoader] Failed to load seed data: ${errorMessage}`);
            throw error;
        }
    }

    /**
     * Get all services from seed data
     */
    async getServices(): Promise<ServiceConfig[]> {
        const data = await this.loadSeedData();
        return data.services;
    }

    /**
     * Get all interfaces from seed data
     */
    async getInterfaces(): Promise<InterfaceConfig[]> {
        const data = await this.loadSeedData();
        return data.interfaces;
    }

    /**
     * Get all models as ModelConfiguration objects
     */
    async getModels(): Promise<ModelConfiguration[]> {
        const data = await this.loadSeedData();
        return data.models.map(rawModel => this.transformRawModel(rawModel));
    }

    /**
     * Get services by provider
     */
    async getServicesByProvider(provider: string): Promise<ServiceConfig[]> {
        const services = await this.getServices();
        return services.filter(s => s.provider === provider);
    }

    /**
     * Get interfaces by service name
     */
    async getInterfacesByService(serviceName: string): Promise<InterfaceConfig[]> {
        const interfaces = await this.getInterfaces();
        return interfaces.filter(i => i.serviceName === serviceName);
    }

    /**
     * Get models by service name
     */
    async getModelsByService(serviceName: string): Promise<ModelConfiguration[]> {
        const models = await this.getModels();
        return models.filter(m => (m.metadata as any)?.provider === serviceName);
    }

    /**
     * Get models by conversation type
     */
    async getModelsByConversationType(type: LLMConversationType): Promise<ModelConfiguration[]> {
        const models = await this.getModels();
        return models.filter(m => m.supportedConversationTypes.includes(type));
    }

    /**
     * Transform raw model data to ModelConfiguration
     */
    private transformRawModel(raw: RawModelData): ModelConfiguration {
        // Convert string conversation types to enum values
        const conversationTypes = raw.supportedConversationTypes.map(type => {
            const enumValue = (LLMConversationType as Record<string, any>)[type];
            return enumValue || type;
        }) as LLMConversationType[];

        const now = new Date().toISOString();

        return {
            id: raw.id,
            name: raw.name,
            provider: raw.provider,
            providerModelId: raw.providerModelId,
            tokenLimit: raw.tokenLimit,
            costPer1kTokens: raw.costPer1kTokens,
            supportedConversationTypes: conversationTypes,
            status: raw.status as 'active' | 'beta' | 'deprecated',
            deployedAt: now,
            rolloutPercentage: raw.rolloutPercentage,
            providerCredentials: {
                keyVault: 'ENV',
                credentialName: this.getCredentialEnvVar(raw.provider),
                validated: false,
                validationError: 'Not validated yet'
            },
            availability: {
                status: 'unknown',
                reason: 'Pending initial validation'
            },
            healthChecks: {
                endpoint: this.getHealthCheckEndpoint(raw),
                method: 'GET',
                timeout: 5000,
                expectedStatusCodes: [200, 401, 429],
                expectedResponseBody: this.getExpectedResponseBody(raw.provider),
                frequency: 300000
            },
            sla: {
                successRateMinimum: 0.98,
                p99LatencyMs: raw.id.includes('gpt-4-turbo') ? 4000 : 3000,
                availabilityPercentage: 0.99
            },
            metadata: {
                version: raw.metadata.version || '1.0.0',
                releaseDate: raw.metadata.releaseDate || now,
                knownLimitations: raw.metadata.knownLimitations || 'None documented',
                scores: raw.scoresByConversationType,
                provider: raw.provider
            } as any,
            createdAt: now,
            createdBy: 'system',
            updatedAt: now,
            updatedBy: 'system'
        };
    }

    /**
     * Get health check endpoint for a model based on provider
     * Uses environment variables where available for dynamic configuration
     */
    private getHealthCheckEndpoint(model: RawModelData): string {
        // Get OpenWebUI URL from environment variable
        const openWebUIUrl = process.env.OPENWEB_URL || 'http://localhost:8000';
        
        const endpointMap: Record<string, string> = {
            'openai': 'https://api.openai.com/v1/models',
            'anthropic': 'https://api.anthropic.com/v1/messages',
            'google': 'https://generativelanguage.googleapis.com/v1/models?key={apiKey}',
            'groq': 'https://api.groq.com/v1/models',
            'openrouter': 'https://openrouter.ai/api/v1/models',
            'huggingface': 'https://api-inference.huggingface.co/models/',
            'mistral': 'https://api.mistral.ai/v1/models',
            'openwebui': `${openWebUIUrl}/api/v1/models`,
            'cloudflare': 'https://api.cloudflare.com/client/v4/accounts/{accountId}/ai/models',
            'aiml': 'https://api.aiml.com/v1/models',
            'gg': 'https://api.gg.com/v1/models'
        };

        return endpointMap[model.provider] || `https://api.${model.provider}.com/v1/models`;
    }

    /**
     * Get the environment variable name for a provider's API key
     */
    private getCredentialEnvVar(provider: string): string {
        const providerEnvMap: Record<string, string> = {
            'groq': 'GROQ_API_KEY',
            'anthropic': 'ANTHROPIC_API_KEY',
            'openai': 'OPENAI_API_KEY',
            'google': 'GEMINI_API_KEY',
            'gemini': 'GEMINI_API_KEY',
            'mistral': 'MISTRAL_API_KEY',
            'huggingface': 'HUGGINGFACE_API_KEY',
            'openrouter': 'OPENROUTER_API_KEY',
            'openwebui': 'OPENWEBUI_API_KEY',
            'openweb': 'OPENWEBUI_API_KEY',
            'cloudflare': 'CLOUDFLARE_WORKERS_AI_API_TOKEN',
            'cloudflare-workers-ai': 'CLOUDFLARE_WORKERS_AI_API_TOKEN',
            'aiml': 'AIML_API_KEY',
            'gg': 'GEMINI_API_KEY',
        };

        return providerEnvMap[provider.toLowerCase()] || `${provider.toUpperCase()}_API_KEY`;
    }

    /**
     * Get expected response body pattern for health checks based on provider
     */
    private getExpectedResponseBody(provider: string): string {
        // Different providers return different response formats
        const patternMap: Record<string, string> = {
            'openai': '"object":\\s*"list"',
            'anthropic': '.*',  // Anthropic returns minimal response for health check
            'google': '"models"',
            'groq': '"object":\\s*"list"',
            'openrouter': '"data"',
            'huggingface': '.*',  // HuggingFace returns model info
            'mistral': '"object":\\s*"list"',
            'openwebui': '"data":\\s*\\[',  // OpenWebUI returns {"data":[...]} with model objects
            'cloudflare': '"models"',
            'aiml': '"object":\\s*"list"',
            'gg': '"models"'
        };

        return patternMap[provider.toLowerCase()] || '"object":\\s*"list"';
    }

    /**
     * Get seed data version
     */
    async getVersion(): Promise<string> {
        const data = await this.loadSeedData();
        return data.version;
    }

    /**
     * Reload seed data from disk (useful for development)
     */
    async reload(): Promise<void> {
        this.seedData = null;
        await this.loadSeedData();
        console.log('[SeedDataLoader] Seed data reloaded from disk');
    }
}

/**
 * Export singleton instance
 */
export const seedDataLoader = SeedDataLoader.getInstance();
