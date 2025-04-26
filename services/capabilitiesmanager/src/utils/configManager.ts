import { ConfigItem, MetadataType, createAuthenticatedAxios } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import axios from 'axios';

interface SystemConfig {
    environment: Record<string, string>;
    pluginConfigurations: Record<string, ConfigItem[]>; // Plugin configurations for each plugin ID
    pluginMetadata: Record<string, MetadataType>; // Plugin metadata for each plugin ID
}

export class ConfigManager {
    private config: SystemConfig;
    private static instance: ConfigManager;
    private librarianUrl: string;
    private configId: string = 'capabilitiesmanager';
    private initialized: boolean = false;
    private authenticatedApi: any;

    private constructor(librarianUrl: string) {
        this.librarianUrl = librarianUrl;
        this.config = {
            environment: {},
            pluginConfigurations: {},
            pluginMetadata: {}
        };

        // Create authenticated API client
        this.authenticatedApi = createAuthenticatedAxios(
            'CapabilitiesManagerConfig',
            process.env.SECURITY_MANAGER_URL || 'securitymanager:5010',
            process.env.CLIENT_SECRET || 'stage7AuthSecret'
        );
    }

    static async initialize(librarianUrl: string): Promise<ConfigManager> {
        if (!ConfigManager.instance) {
            const instance = new ConfigManager(librarianUrl);
            ConfigManager.instance = instance;
        }
        return ConfigManager.instance;
    }

        // Plugin Configuration Management
        async getPluginConfig(pluginId: string): Promise<ConfigItem[]> {
            return this.config.pluginConfigurations[pluginId] || [];
        }

        async updatePluginConfig(pluginId: string, config: ConfigItem[]): Promise<void> {
            this.config.pluginConfigurations[pluginId] = config;
            await this.saveConfig();
        }

        // Plugin Metadata Management
        async getPluginMetadata(pluginId: string): Promise<MetadataType | undefined> {
            return this.config.pluginMetadata[pluginId];
        }

        async updatePluginMetadata(pluginId: string, metadata: Partial<MetadataType>): Promise<void> {
            this.config.pluginMetadata[pluginId] = {
                ...this.config.pluginMetadata[pluginId],
                ...metadata
            };
            await this.saveConfig();
        }

        // Usage Tracking
        async recordPluginUsage(pluginId: string): Promise<void> {
            const metadata = this.config.pluginMetadata[pluginId] || {};
            metadata.usageCount = (metadata.usageCount || 0) + 1;
            metadata.lastUsed = new Date();
            await this.updatePluginMetadata(pluginId, metadata);
        }

    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            throw new Error('ConfigManager not initialized. Call initialize() first.');
        }
        return ConfigManager.instance;
    }


    private async loadConfig() {
        try {
            const response = await this.authenticatedApi.get(`http://${this.librarianUrl}/loadData/${this.configId}`, {
                params: {
                    storageType: 'mongo',
                    collection: 'configurations'
                }
            });
            this.config.environment = response.data.data.environment ? response.data.data.environment || this.config.environment : {};
            this.config.pluginConfigurations = response.data.data.pluginConfigurations ? response.data.data.pluginConfigurations || this.config.pluginConfigurations : {};
            this.config.pluginMetadata = response.data.data.pluginMetadata ? response.data.data.pluginMetadata || this.config.pluginMetadata || {} : {};

        } catch (error) {
            if (error instanceof Error && error.message.includes('404')) {
                return;
            } else {
                analyzeError(error as Error);
                console.error('Error loading config from Librarian:', error instanceof Error ? error.message : error);
            }
        }
    }

    private async ensureInitialized() {
        if (!this.initialized) {
            await this.loadConfig();
            this.initialized = true;
        }
    }

    private async saveConfig() {
        try {
            await this.authenticatedApi.post(`http://${this.librarianUrl}/storeData`, {
                id: this.configId,
                data: this.config,
                storageType: 'mongo',
                collection: 'configurations'
            });
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error saving config to Librarian:', error instanceof Error ? error.message : error);
        }
    }

    async setEnvironmentVariable(key: string, value: string) {
        this.config.environment[key] = value;
        await this.saveConfig();
    }

    async getEnvironmentVariable(key: string): Promise<string | undefined> {
        await this.ensureInitialized();
        return this.config.environment[key];
    }

    async ensurePluginMetadata(pluginId: string): Promise<void> {
        if (!this.config.pluginMetadata[pluginId]) {
            this.config.pluginMetadata[pluginId] = {
                category: [],
                tags: [],
                complexity: 1,
                dependencies: [],
                version: '1.0.0',
                usageCount: 0
            };
            this.saveConfig();
        }
    }
}

export default ConfigManager;