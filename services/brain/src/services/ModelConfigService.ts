import { redisCache, BaseEntity } from '@cktmcs/shared';
import { ModelConfiguration, ModelConfigChange, ModelConfigVersion } from '../types/ModelConfig';
import { seedDataLoader, SeedData, ServiceConfig, InterfaceConfig } from '../utils/seedDataLoader';
import crypto from 'crypto';

/**
 * ModelConfigService - Manages model configurations
 * Handles CRUD operations, versioning, and persistence
 * Note: Authenticates as 'Brain' since it's a service within Brain, not a standalone service
 */
export class ModelConfigService extends BaseEntity {
    private modelCache: Map<string, ModelConfiguration> = new Map();
    private readonly CACHE_TTL = 300; // 5 minutes
    private readonly CONFIG_COLLECTION = 'model_configs';

    constructor() {
        // Use 'Brain' as componentType for authentication since this is an internal service
        super('ModelConfigService', 'Brain', 'model-config-service', '5080', true);
    }

    /**
     * Get all active models
     */
    async getActiveModels(): Promise<ModelConfiguration[]> {
        try {
            // Try Redis cache first
            const cached = await redisCache.get<ModelConfiguration[]>('models:active');
            if (cached && cached.length > 0) {
                console.log(`[ModelConfigService] Retrieved ${cached.length} models from cache`);
                return cached;
            }

            // Fallback to Librarian
            const response = await this.authenticatedApi.get(`http://librarian:5040/loadData/model-configs-active`, {
                params: { collection: this.CONFIG_COLLECTION, storageType: 'mongo' }
            });

            const models: ModelConfiguration[] = response.data?.data || [];

            // Cache the results
            if (models.length > 0) {
                await redisCache.set('models:active', models, this.CACHE_TTL);
                console.log(`[ModelConfigService] Cached ${models.length} models`);
            }

            return models;
        } catch (error) {
            console.error('[ModelConfigService] Error fetching active models:', error);
            return Array.from(this.modelCache.values()).filter(m => m.status === 'active');
        }
    }

    /**
     * Get specific model by name
     */
    async getModel(modelName: string): Promise<ModelConfiguration | null> {
        try {
            // Check local cache first
            if (this.modelCache.has(modelName)) {
                return this.modelCache.get(modelName) || null;
            }

            // Try Redis
            const cached = await redisCache.get<ModelConfiguration>(`model:${modelName}`);
            if (cached) {
                this.modelCache.set(modelName, cached);
                return cached;
            }

            // Query from Librarian
            const response = await this.authenticatedApi.get(
                `http://librarian:5040/loadData/model-config-${modelName}`,
                { params: { collection: this.CONFIG_COLLECTION, storageType: 'mongo' } }
            );

            const model = response.data?.data;
            if (model) {
                this.modelCache.set(modelName, model);
                await redisCache.set(`model:${modelName}`, model, this.CACHE_TTL);
            }

            return model || null;
        } catch (error) {
            console.error(`[ModelConfigService] Error fetching model ${modelName}:`, error);
            return null;
        }
    }

    /**
     * Create a new model configuration
     */
    async createModel(config: ModelConfiguration, userId: string): Promise<ModelConfiguration> {
        try {
            // Validate configuration
            this.validateModelConfig(config);

            // Add metadata
            const now = new Date().toISOString();
            config.createdBy = userId;
            config.createdAt = now;
            config.updatedBy = userId;
            config.updatedAt = now;

            // Store in Librarian
            const storageId = `model-config-${config.id}`;
            await this.authenticatedApi.post(`http://librarian:5040/storeData`, {
                id: storageId,
                data: config,
                storageType: 'mongo',
                collection: this.CONFIG_COLLECTION
            });

            // Update caches
            this.modelCache.set(config.name, config);
            await redisCache.set(`model:${config.name}`, config, this.CACHE_TTL);
            await this.invalidateActiveModelsCache();

            console.log(`[ModelConfigService] Created model: ${config.name}`);
            return config;
        } catch (error) {
            console.error(`[ModelConfigService] Error creating model:`, error);
            throw error;
        }
    }

    /**
     * Update model configuration
     */
    async updateModel(
        modelName: string,
        updates: Partial<ModelConfiguration>,
        reason: string,
        userId: string
    ): Promise<ModelConfiguration> {
        try {
            const existing = await this.getModel(modelName);
            if (!existing) {
                throw new Error(`Model ${modelName} not found`);
            }

            // Create new version with updates
            const updated: ModelConfiguration = {
                ...existing,
                ...updates,
                updatedBy: userId,
                updatedAt: new Date().toISOString()
            };

            // Validate
            this.validateModelConfig(updated);

            // Store new version
            const storageId = `model-config-${updated.id}`;
            await this.authenticatedApi.post(`http://librarian:5040/storeData`, {
                id: storageId,
                data: updated,
                storageType: 'mongo',
                collection: this.CONFIG_COLLECTION
            });

            // Record change in audit log
            await this.recordConfigChange(modelName, existing, updated, reason, userId);

            // Update caches
            this.modelCache.set(modelName, updated);
            await redisCache.set(`model:${modelName}`, updated, this.CACHE_TTL);
            await this.invalidateActiveModelsCache();

            console.log(`[ModelConfigService] Updated model: ${modelName}`);
            return updated;
        } catch (error) {
            console.error(`[ModelConfigService] Error updating model ${modelName}:`, error);
            throw error;
        }
    }

    /**
     * Update model rollout percentage
     */
    async updateRollout(modelName: string, percentage: number, userId: string): Promise<void> {
        if (percentage < 0 || percentage > 100) {
            throw new Error('Rollout percentage must be between 0 and 100');
        }

        await this.updateModel(modelName, { rolloutPercentage: percentage }, 
            `Rollout updated to ${percentage}%`, userId);
    }

    /**
     * Archive/retire a model
     */
    async archiveModel(modelName: string, userId: string): Promise<void> {
        await this.updateModel(modelName, 
            { status: 'retired', retiredAt: new Date().toISOString() },
            'Model archived',
            userId
        );
    }

    /**
     * Record configuration change for audit trail
     */
    private async recordConfigChange(
        modelName: string,
        previousConfig: ModelConfiguration,
        newConfig: ModelConfiguration,
        reason: string,
        userId: string
    ): Promise<void> {
        try {
            const change: ModelConfigChange = {
                timestamp: new Date().toISOString(),
                changedBy: userId,
                previousValue: previousConfig,
                newValue: newConfig,
                reason
            };

            await this.authenticatedApi.post(`http://librarian:5040/storeData`, {
                id: `model-config-change-${modelName}-${Date.now()}`,
                data: change,
                storageType: 'mongo',
                collection: 'model_config_changes'
            });
        } catch (error) {
            console.error(`[ModelConfigService] Error recording config change:`, error);
            // Don't throw; logging changes should not block model updates
        }
    }

    /**
     * Get configuration history for a model
     */
    async getConfigHistory(modelName: string): Promise<ModelConfigChange[]> {
        try {
            const response = await this.authenticatedApi.get(
                `http://librarian:5040/query`,
                {
                    params: {
                        collection: 'model_config_changes',
                        filter: JSON.stringify({ 'data.newValue.name': modelName }),
                        sort: JSON.stringify({ 'data.timestamp': -1 })
                    }
                }
            );

            return response.data?.data || [];
        } catch (error) {
            console.error(`[ModelConfigService] Error fetching config history:`, error);
            return [];
        }
    }

    /**
     * Validate model configuration
     */
    private validateModelConfig(config: ModelConfiguration): void {
        if (!config.id || !config.name || !config.provider) {
            throw new Error('Model must have id, name, and provider');
        }

        if (config.tokenLimit <= 0) {
            throw new Error('Token limit must be positive');
        }

        if (config.rolloutPercentage < 0 || config.rolloutPercentage > 100) {
            throw new Error('Rollout percentage must be between 0 and 100');
        }

        if (config.supportedConversationTypes.length === 0) {
            throw new Error('Model must support at least one conversation type');
        }

        if (!config.providerCredentials || !config.providerCredentials.credentialName) {
            throw new Error('Provider credentials must be configured');
        }
    }

    /**
     * Invalidate active models cache
     */
    private async invalidateActiveModelsCache(): Promise<void> {
        try {
            if (typeof (redisCache as any).delete === 'function') {
                await (redisCache as any).delete('models:active');
            }
        } catch (error) {
            console.error('[ModelConfigService] Error invalidating cache:', error);
        }
    }

    /**
     * Preload models from configuration (hydration) - now loads from seedData.json
     */
    async hydrate(): Promise<void> {
        try {
            console.log(`[ModelConfigService] Starting hydration from seedData.json`);

            // Load seed data from JSON file
            const seedData = await seedDataLoader.loadSeedData();
            
            // Check if models already exist
            const existing = await this.getActiveModels();
            if (existing.length > 0) {
                console.log(`[ModelConfigService] Models already exist (${existing.length} found), skipping hydration`);
                return;
            }

            // Store services first
            await this.hydrateServices(seedData.services);

            // Store interfaces second
            await this.hydrateInterfaces(seedData.interfaces);

            // Store models last
            const models = await seedDataLoader.getModels();
            for (const model of models) {
                try {
                    await this.createModel(model, 'system');
                } catch (error) {
                    console.error(`[ModelConfigService] Error hydrating model ${model.name}:`, error);
                }
            }

            console.log(`[ModelConfigService] Hydration complete: ${models.length} models, ` +
                `${seedData.services.length} services, ${seedData.interfaces.length} interfaces`);
        } catch (error) {
            console.error('[ModelConfigService] Error during hydration:', error);
            throw error;
        }
    }

    /**
     * Hydrate services from seed data
     * Note: Requires valid security token - call after bootstrapToken()
     */
    private async hydrateServices(services: ServiceConfig[]): Promise<void> {
        try {
            for (const service of services) {
                const storageId = `service-config-${service.id}`;
                await this.authenticatedApi.post(`http://librarian:5040/storeData`, {
                    id: storageId,
                    data: service,
                    storageType: 'mongo',
                    collection: 'service_configs'
                });
            }
            console.log(`[ModelConfigService] Hydrated ${services.length} services`);
        } catch (error) {
            console.error(`[ModelConfigService] Error hydrating services:`, error);
        }
    }

    /**
     * Hydrate interfaces from seed data
     * Note: Requires valid security token - call after bootstrapToken()
     */
    private async hydrateInterfaces(interfaces: InterfaceConfig[]): Promise<void> {
        try {
            for (const iface of interfaces) {
                const storageId = `interface-config-${iface.id}`;
                await this.authenticatedApi.post(`http://librarian:5040/storeData`, {
                    id: storageId,
                    data: iface,
                    storageType: 'mongo',
                    collection: 'interface_configs'
                });
            }
            console.log(`[ModelConfigService] Hydrated ${interfaces.length} interfaces`);
        } catch (error) {
            console.error(`[ModelConfigService] Error hydrating interfaces:`, error);
        }
    }

    /**
     * Get all services
     */
    async getServices(): Promise<ServiceConfig[]> {
        try {
            const cached = await redisCache.get<ServiceConfig[]>('services:all');
            if (cached && cached.length > 0) {
                return cached;
            }

            const response = await this.authenticatedApi.get(`http://librarian:5040/query`, {
                params: {
                    collection: 'service_configs',
                    storageType: 'mongo'
                }
            });

            const services: ServiceConfig[] = response.data?.data || [];
            if (services.length > 0) {
                await redisCache.set('services:all', services, this.CACHE_TTL);
            }

            return services;
        } catch (error) {
            console.error('[ModelConfigService] Error fetching services:', error);
            return [];
        }
    }

    /**
     * Get all interfaces
     */
    async getInterfaces(): Promise<InterfaceConfig[]> {
        try {
            const cached = await redisCache.get<InterfaceConfig[]>('interfaces:all');
            if (cached && cached.length > 0) {
                return cached;
            }

            const response = await this.authenticatedApi.get(`http://librarian:5040/query`, {
                params: {
                    collection: 'interface_configs',
                    storageType: 'mongo'
                }
            });

            const interfaces: InterfaceConfig[] = response.data?.data || [];
            if (interfaces.length > 0) {
                await redisCache.set('interfaces:all', interfaces, this.CACHE_TTL);
            }

            return interfaces;
        } catch (error) {
            console.error('[ModelConfigService] Error fetching interfaces:', error);
            return [];
        }
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
     * Get models by interface name
     */
    async getModelsByInterface(interfaceName: string): Promise<ModelConfiguration[]> {
        const models = await this.getActiveModels();
        return models.filter(m => {
            const metadata = m.metadata as any;
            return metadata?.interfaceName === interfaceName;
        });
    }
}

// Export singleton instance
export const modelConfigService = new ModelConfigService();
