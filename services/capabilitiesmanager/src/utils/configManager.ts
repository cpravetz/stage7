import { ConfigItem, MetadataType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import axios from 'axios';

interface SystemConfig {
    environment: Record<string, string>;
    featureFlags: Record<string, boolean>;
    pluginConfigurations: Record<string, ConfigItem[]>; // Plugin configurations for each plugin ID
    pluginMetadatas: Record<string, MetadataType>; // Plugin metadata for each plugin ID
}

export class ConfigManager {
    private config: SystemConfig;
    private static instance: ConfigManager;
    private librarianUrl: string;
    private configId: string = 'capabilitiesmanager';
    private initialized: boolean = false;

    private constructor(librarianUrl: string) {
        this.librarianUrl = librarianUrl;
        this.config = {
            environment: {},
            featureFlags: {},
            pluginConfigurations: {},
            pluginMetadatas: {}
        };
    }

    static async initialize(librarianUrl: string): Promise<ConfigManager> {
        if (!ConfigManager.instance) {
            const instance = new ConfigManager(librarianUrl);
            ConfigManager.instance = instance;
        }
        return ConfigManager.instance;
    }
    
    static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            throw new Error('ConfigManager not initialized. Call initialize() first.');
        }
        return ConfigManager.instance;
    }


    private async loadConfig() {
        try {
            const response = await axios.get(`http://${this.librarianUrl}/loadData/${this.configId}`, {
                params: {
                    storageType: 'mongo',
                    collection: 'configurations'
                }
            });
            this.config.environment = response.data.data.environment ? response.data.data.environment || this.config.environment : {};
            this.config.featureFlags = response.data.data.featureFlags ? response.data.data.featureFlags || this.config.featureFlags : {};
            this.config.pluginConfigurations = response.data.data.pluginConfigurations ? response.data.data.pluginConfigurations || this.config.pluginConfigurations : {};
            this.config.pluginMetadatas = response.data.data.pluginMetadatas ? response.data.data.pluginMetadatas || this.config.pluginMetadatas || {} : {};

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
            await axios.post(`http://${this.librarianUrl}/storeData`, {
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

    public async updatePluginConfig(pluginId: string, configSet: ConfigItem[]) {
        await this.ensureInitialized();
        this.config.pluginConfigurations[pluginId] = configSet || [];
        await this.saveConfig();
    }

    async updatePluginMetadata(pluginId: string, metadata: Partial<MetadataType>) {
        await this.ensureInitialized();
        const existingMetadata = this.config.pluginMetadatas[pluginId] || {};
        this.config.pluginMetadatas[pluginId] = { ...existingMetadata, ...metadata };
        await this.saveConfig();
    }

    public async getPluginConfig(pluginId: string): Promise<ConfigItem[]> {
        await this.ensureInitialized();
        return this.config.pluginConfigurations[pluginId] || [];
    }

    async getPluginMetadata(pluginId: string): Promise<MetadataType | undefined> {
        await this.ensureInitialized();
        await this.ensurePluginMetadata(pluginId);
        return this.config.pluginMetadatas[pluginId] || undefined;
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
        if (!this.config.pluginMetadatas[pluginId]) {
            this.config.pluginMetadatas[pluginId] = {
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