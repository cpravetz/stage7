import { PluginConfigurationItem, PluginMetadata, createAuthenticatedAxios } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/shared';
import axios from 'axios';

interface SystemConfig {
    environment: Record<string, string>;
    pluginConfigurations: Record<string, PluginConfigurationItem[]>; // Plugin configurations for each plugin ID
    pluginMetadata: Record<string, PluginMetadata>; // Plugin metadata for each plugin ID
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
            process.env.SECURITYMANAGER_URL || 'securitymanager:5010',
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
        async getPluginConfig(pluginId: string): Promise<PluginConfigurationItem[]> {
            return this.config.pluginConfigurations[pluginId] || [];
        }

        async updatePluginConfig(pluginId: string, config: PluginConfigurationItem[]): Promise<void> {
            this.config.pluginConfigurations[pluginId] = config;
            await this.saveConfig();
        }

        // Plugin Metadata Management
        async getPluginMetadata(pluginId: string): Promise<PluginMetadata | undefined> {
            return this.config.pluginMetadata[pluginId];
        }

        async updatePluginMetadata(pluginId: string, metadata: Partial<PluginMetadata>): Promise<void> {
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
        const MAX_AUTH_RETRIES = 5;
        let response: any; // Declare response outside the loop
        for (let i = 0; i < MAX_AUTH_RETRIES; i++) {
            try {
                response = await this.authenticatedApi.get(`${this.librarianUrl}/loadData/${this.configId}`, {
                    params: {
                        storageType: 'mongo',
                        collection: 'configurations'
                    }
                });
                // If successful, break the retry loop
                break;
            } catch (error: any) {
                if (axios.isAxiosError(error) && error.response?.status === 429) {
                    console.warn(`ConfigManager: Authentication failed (429 Too Many Requests) on attempt ${i + 1}/${MAX_AUTH_RETRIES}. Retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
                } else {
                    // Re-throw for other errors
                    throw error;
                }
            }
        }
        // If response is still undefined after retries, it means all retries failed
        if (!response) {
            throw new Error(`ConfigManager: Failed to load config after ${MAX_AUTH_RETRIES} retries due to persistent authentication issues.`);
        }

        try {
            const responseData = response.data?.data; // Optional chaining for safety

            // Handle environment
            const loadedEnv = responseData?.environment;
            if (loadedEnv && typeof loadedEnv === 'object' && !Array.isArray(loadedEnv)) {
                this.config.environment = loadedEnv;
            } else {
                // If loadedEnv is not a valid object, ensure environment is at least an empty object
                // or retains its previous valid state if that state was already an object.
                if (typeof this.config.environment !== 'object' || Array.isArray(this.config.environment)) {
                    this.config.environment = {};
                }
                if (loadedEnv !== undefined && (typeof loadedEnv !== 'object' || Array.isArray(loadedEnv))) {
                    console.warn(`ConfigManager: Received type '${typeof loadedEnv}' for 'environment' from Librarian. Expected 'object'. Maintaining current or resetting to {}.`);
                }
            }

            // Handle pluginConfigurations
            const loadedPluginConfigs = responseData?.pluginConfigurations;
            if (loadedPluginConfigs && typeof loadedPluginConfigs === 'object' && !Array.isArray(loadedPluginConfigs)) {
                this.config.pluginConfigurations = loadedPluginConfigs;
            } else {
                if (typeof this.config.pluginConfigurations !== 'object' || Array.isArray(this.config.pluginConfigurations)) {
                    this.config.pluginConfigurations = {};
                }
                if (loadedPluginConfigs !== undefined && (typeof loadedPluginConfigs !== 'object' || Array.isArray(loadedPluginConfigs))) {
                    console.warn(`ConfigManager: Received type '${typeof loadedPluginConfigs}' for 'pluginConfigurations' from Librarian. Expected 'object'. Maintaining current or resetting to {}.`);
                }
            }

            // Handle pluginMetadata
            const loadedPluginMetadata = responseData?.pluginMetadata;
            if (loadedPluginMetadata && typeof loadedPluginMetadata === 'object' && !Array.isArray(loadedPluginMetadata)) {
                this.config.pluginMetadata = loadedPluginMetadata;
            } else {
                if (typeof this.config.pluginMetadata !== 'object' || Array.isArray(this.config.pluginMetadata)) {
                    this.config.pluginMetadata = {};
                }
                if (loadedPluginMetadata !== undefined && (typeof loadedPluginMetadata !== 'object' || Array.isArray(loadedPluginMetadata))) {
                    console.warn(`ConfigManager: Received type '${typeof loadedPluginMetadata}' for 'pluginMetadata' from Librarian. Expected 'object'. Maintaining current or resetting to {}.`);
                }
            }

        } catch (error: any) { // Added ': any' for error typing consistency with access to message/includes
            // It's common for 404 to be a valid case for "no config found, use defaults"
            if (error.isAxiosError && error.response?.status === 404) {
                console.log(`ConfigManager: No existing configuration found for '${this.configId}' (404). Using default/empty config.`);
                // Ensure config is initialized to defaults if not already
                this.config.environment = this.config.environment && typeof this.config.environment === 'object' && !Array.isArray(this.config.environment) ? this.config.environment : {};
                this.config.pluginConfigurations = this.config.pluginConfigurations && typeof this.config.pluginConfigurations === 'object' && !Array.isArray(this.config.pluginConfigurations) ? this.config.pluginConfigurations : {};
                this.config.pluginMetadata = this.config.pluginMetadata && typeof this.config.pluginMetadata === 'object' && !Array.isArray(this.config.pluginMetadata) ? this.config.pluginMetadata : {};
                return; // Successfully handled "no config" by using defaults
            } else if (error instanceof Error) { // Keep existing analyzeError for other errors
                analyzeError(error as Error); // Cast to Error if using a more general catch
                console.error('Error loading config from Librarian:', error.message);
            } else {
                analyzeError(new Error(String(error))); // Ensure it's an Error object
                console.error('Unknown error loading config from Librarian:', error);
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
        const MAX_AUTH_RETRIES = 5;
        for (let i = 0; i < MAX_AUTH_RETRIES; i++) {
            try {
                await this.authenticatedApi.post(`${this.librarianUrl}/storeData`, {
                    id: this.configId,
                    data: this.config,
                    storageType: 'mongo',
                    collection: 'configurations'
                });
                // If successful, break the retry loop
                return;
            } catch (error: any) {
                if (axios.isAxiosError(error) && error.response?.status === 429) {
                    console.warn(`ConfigManager: Authentication failed (429 Too Many Requests) on attempt ${i + 1}/${MAX_AUTH_RETRIES}. Retrying...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1))); // Exponential backoff
                } else {
                    // Re-throw for other errors
                    throw error;
                }
            }
        }
        // If all retries fail, log an error but don't re-throw to avoid crashing the ConfigManager
        console.error(`ConfigManager: Failed to save config after ${MAX_AUTH_RETRIES} retries due to persistent authentication issues.`);
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
                dependencies: {},
                version: '1.0.0',
                usageCount: 0
            };
            this.saveConfig();
        }
    }
}

export default ConfigManager;