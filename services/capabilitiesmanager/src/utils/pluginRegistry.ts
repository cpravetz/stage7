import { Plugin, PluginParameterType, PluginInput, PluginOutput, MetadataType, MapSerializer } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ConfigManager } from './configManager';
import { PluginMarketplace } from '@cktmcs/marketplace';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Initializes existing plugins by loading them from the specified directory
 * and registering them with the provided plugin registry.
 *
 * @param pluginRegistry - The registry where plugins will be registered. It is expected to manage plugin lifecycle and interactions.
 * @param librarianUrl - The URL of the librarian service used to fetch additional plugin metadata or configurations.
 * @returns A promise that resolves when all plugins have been initialized and registered.
 */
export async function initializeExistingPlugins(pluginRegistry: any, librarianUrl: string): Promise<void> {
    const pluginsDir = path.join(__dirname, '..', 'plugins');
    
    try {
        // Read all directories in the plugins folder
        const pluginDirs = await fs.readdir(pluginsDir);
        
        for (const dir of pluginDirs) {
            try {
                // Read plugin.js file which contains the plugin definition
                const pluginPath = path.join(pluginsDir, dir, 'plugin.js');
                const pluginModule = await import(pluginPath);
                const plugin: Plugin = pluginModule.default;

                // Add default security settings if not present
                if (!plugin.security) {
                    plugin.security = {
                        permissions: [],
                        sandboxOptions: {
                            allowEval: false,
                            timeout: 5000,
                            memory: 128 * 1024 * 1024,
                            allowedModules: ['fs', 'path', 'http', 'https'],
                            allowedAPIs: ['fetch', 'console']
                        },
                        trust: {
                            publisher: 'system',
                            signature: 'built-in-plugin'
                        }
                    };
                }

                // Store in Librarian
                await axios.post(`http://${librarianUrl}/storeData`, {
                    id: plugin.id,
                    data: plugin,
                    collection: 'plugins',
                    storageType: 'mongo'
                });
                
                // Register with PluginRegistry
                await pluginRegistry.registerPlugin(plugin);
                
                console.log(`Built-in plugin ${plugin.verb} initialized successfully`);
            } catch (error) {
                analyzeError(error as Error);
                console.error(`Failed to initialize plugin in directory ${dir}:`, error instanceof Error ? error.message : error);
            }
        }
    } catch (error) {
        analyzeError(error as Error);
        console.error('Failed to initialize existing plugins:', error instanceof Error ? error.message : error);
    }
}

export class PluginRegistry {
    private plugins: Map<string, Plugin>;
    private categories: Map<string, Set<string>>;
    private tags: Map<string, Set<string>>;
    private configManager: ConfigManager;
    private pluginMarketplace: PluginMarketplace;    public actionVerbs: Map<string, Plugin> = new Map();
    private pluginsLoaded: boolean = false;
    public currentDir = dirname(fileURLToPath(import.meta.url));

    constructor(configManager: ConfigManager) {
        this.plugins = new Map();
        this.categories = new Map();
        this.tags = new Map();
        this.configManager = configManager;
        this.pluginMarketplace = new PluginMarketplace();
    }

    static async initialize(configManager: ConfigManager): Promise<PluginRegistry> {
        const instance = new PluginRegistry(configManager);
        await instance.loadActionVerbs();
        return instance;
    }

        // Plugin Query Methods
        async getPluginByVerb(verb: string): Promise<Plugin | undefined> {
            return this.plugins.get(verb);
        }
    
        async getPluginsByCategory(category: string): Promise<Plugin[]> {
            const pluginIds = this.categories.get(category) || new Set();
            return Array.from(pluginIds).map(id => this.plugins.get(id)).filter(Boolean) as Plugin[];
        }
    
        // Plugin Usage Tracking
        async recordPluginUsage(pluginId: string): Promise<void> {
            await this.configManager.recordPluginUsage(pluginId);
        }
    
    protected async loadActionVerbs() {
        if (!this.pluginsLoaded) {
            try {
                await this.loadLocalPlugins();
                // Load plugins from marketplace
                const plugins = await this.pluginMarketplace.getAllPlugins();
                for (const plugin of plugins) {
                    this.actionVerbs.set(plugin.verb, plugin);
                    console.log(`Loaded plugin ${plugin.verb} from marketplace`);
                }
                
                this.pluginsLoaded = true;
            } catch (error) {
                analyzeError(error as Error);
                console.error('Failed to load plugins:', error instanceof Error ? error.message : error);
            }
        }
    }
    
    private async loadLocalPlugins(): Promise<void> {
        const pluginsDir = path.join(this.currentDir, '..', 'plugins');
        const entries = await fs.readdir(pluginsDir, { withFileTypes: true });
        
        for (const entry of entries) {
            if (entry.isDirectory()) {
                const plugin = await this.loadLocalPlugin(entry.name);
                if (plugin) {
                    await this.pluginMarketplace.publishPlugin(plugin, {
                        type: 'local',
                        url: pluginsDir
                    });
                }
            }
        }
    }

    private async loadLocalPlugin(pluginDirName: string): Promise<Plugin | undefined> {
        try {
            const pluginDir = path.join(this.currentDir, '..', 'plugins', pluginDirName);
            const pluginFilePath = path.join(pluginDir, 'plugin.js');
    
            // Check if plugin.js exists
            try {
                await fs.access(pluginFilePath);
            } catch {
                console.warn(`No plugin.js found in ${pluginDir}`);
                return undefined;
            }
    
            // Load and validate plugin
            let plugin: Plugin;
            try {
                const module = await import(pluginFilePath);
                plugin = module.default;
            } catch (error) {
                console.error(`Error importing plugin from ${pluginFilePath}:`, error instanceof Error ? error.message : error);
                return undefined;
            }
    
            // Validate required plugin fields
            if (!this.validatePlugin(plugin)) {
                console.error(`Invalid plugin format in ${pluginFilePath}`);
                return undefined;
            }
    
            // Add default security settings if not present
            if (!plugin.security) {
                plugin.security = {
                    permissions: [],
                    sandboxOptions: {
                        allowEval: false,
                        timeout: 5000,
                        memory: 128 * 1024 * 1024, // 128MB
                        allowedModules: ['fs', 'path', 'http', 'https'],
                        allowedAPIs: ['fetch', 'console']
                    },
                    trust: {
                        publisher: 'local',
                        signature: 'local-plugin'
                    }
                };
            }
    
            // Register plugin in memory
            await this.registerPlugin(plugin);
            console.log(`Successfully loaded local plugin: ${plugin.verb}`);
            
            return plugin;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to load local plugin ${pluginDirName}:`, error instanceof Error ? error.message : error);
            return undefined;
        }
    }
    
    private validatePlugin(plugin: any): plugin is Plugin {
        const requiredFields = ['id', 'verb', 'name', 'description', 'version'];
        const hasRequiredFields = requiredFields.every(field => plugin && plugin[field]);
        
        if (!hasRequiredFields) {
            console.error('Plugin missing required fields:', 
                requiredFields.filter(field => !plugin[field]).join(', '));
            return false;
        }
    
        // Validate plugin structure
        if (!Array.isArray(plugin.inputs) || !Array.isArray(plugin.outputs)) {
            console.error('Plugin inputs/outputs must be arrays');
            return false;
        }
    
        // Validate inputs and outputs have required fields
        const validateIO = (io: any) => io.every((item: any) => 
            item.name && 
            item.description && 
            item.parameterType !== undefined
        );
    
        if (!validateIO(plugin.inputs) || !validateIO(plugin.outputs)) {
            console.error('Plugin inputs/outputs missing required fields');
            return false;
        }
    
        return true;
    }    

    public async getPlugin(verb: string): Promise<Plugin | undefined> {
        return this.plugins.get(verb);
    }

    public async getPluginMetadata(verb: string): Promise<MetadataType | undefined> {
        const plugin = this.plugins.get(verb);
        if (!plugin) { return undefined; }
        return await this.configManager.getPluginMetadata(plugin.id);
    }

    public async getAvailablePlugins(req: express.Request, res: express.Response) {
        try {
            await this.loadActionVerbs();
            const availablePlugins = Array.from(this.actionVerbs.keys());
            res.status(200).send(availablePlugins);
        } catch (error) { analyzeError(error as Error);
            console.error('Error getting available plugins:', error instanceof Error ? error.message : error);
            res.status(500).send({ error: 'Failed to get available plugins' });
        }
    }

    async registerPlugin(plugin: Plugin, metadata?: MetadataType) {
        const defaultMetadata: MetadataType = {
            category: [],
            tags: [],
            complexity: 1,
            dependencies: [],
            usageCount: 0,
            version: '1.0.0'
        };

        const safeMetadata = { ...defaultMetadata, ...metadata };

        this.plugins.set(plugin.id, { ...plugin, metadata: safeMetadata });

        // Safely handle categories
        safeMetadata.category.forEach(category => {
            if (!this.categories.has(category)) {
                this.categories.set(category, new Set());
            }
            this.categories.get(category)?.add(plugin.id);
        });

        // Safely handle tags
        safeMetadata.tags.forEach(tag => {
            if (!this.tags.has(tag)) {
                this.tags.set(tag, new Set());
            }
            this.tags.get(tag)?.add(plugin.id);
        });

        this.actionVerbs.set(plugin.verb, plugin);
    }

    async getPluginsByTags(tags: string[]): Promise<(Plugin & { metadata: MetadataType })[]> {
        const pluginVerbs = new Set<string>();
        tags.forEach(tag => {
            const verbs = this.tags.get(tag);
            if (verbs) {
                verbs.forEach(verb => pluginVerbs.add(verb));
            }
        });
        return Array.from(pluginVerbs)
            .map(verb => this.plugins.get(verb))
            .filter((plugin): plugin is Plugin & { metadata: MetadataType } => plugin !== undefined);
    }

    async getSummarizedCapabilities(): Promise<string> {
        // Create a concise summary for LLM consumption
        const categories = Array.from(this.categories.entries()).map(([category, verbs]) => ({
            category,
            verbCount: verbs.size,
            examples: Array.from(verbs).slice(0, 3) // Just show first 3 examples
        }));

        return JSON.stringify({
            totalPlugins: this.plugins.size,
            categories: categories,
            mostUsedTags: Array.from(this.tags.entries())
                .sort((a, b) => b[1].size - a[1].size)
                .slice(0, 10)
        });
    }

   
    private async recursivelyLoadPlugins(dir: string) {
        const entries = await fs.readdir(dir, { withFileTypes: true });
    
        for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
    
            if (entry.isDirectory()) {
                await this.recursivelyLoadPlugins(fullPath);
            } else if (entry.isFile() && entry.name === 'plugin.js') {
                await this.loadPluginFromFile(fullPath);
            }
        }
    }
    
    private async loadPluginFromFile(filePath: string) {
        try {
            let plugin;
            if (filePath.endsWith('.js')) {
                // For .js files, try both require and import
                try {
                    plugin = require(filePath);
                } catch (requireError) {
                    const module = await import(filePath);
                    plugin = module.default;
                }
            } else {
                // For other files (e.g., .ts), use import
                const module = await import(filePath);
                plugin = module.default;
            }
    
            if (plugin && plugin.id && plugin.verb) {
                this.actionVerbs.set(plugin.verb, plugin);
                console.log(`Loaded plugin ${plugin.verb} from ${filePath}`);
            } else {
                console.warn(`Invalid plugin format in ${filePath}`);
            }
        } catch (error) { analyzeError(error as Error);
            console.error(`Error loading plugin from ${filePath}:`, error instanceof Error ? error.message : error);
        }
    }

    public async createNewPlugin(verb: string, context: Map<string, PluginInput>): Promise<PluginOutput | undefined> {
        const newPlugin = await this.requestEngineerForPlugin(verb, context);
        if (!newPlugin) {
            console.error('Failed to create new plugin');
            return {
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                mimeType: 'text/plain',
                resultDescription: `Unable to create plugin for ${verb}`,
                result: `Unable to create plugin for ${verb}. Please try breaking down the task into smaller steps.`
            };
        }
        await this.createPluginFiles(newPlugin);
        this.actionVerbs.set(verb, newPlugin);
        return {
            success: true,
            name: 'newPlugin',
            resultType: PluginParameterType.PLUGIN,
            resultDescription: `Created new plugin for ${verb}`,
            result: `Created new plugin for ${verb}`
        };
    }

    private async createPluginFiles(plugin: Plugin): Promise<void> {
        const pluginDir = path.join(this.currentDir, '..','plugins', plugin.verb);
    
        try {
            // Create plugin directory
            await fs.mkdir(pluginDir, { recursive: true });

            // Write entryPoint files
            if (plugin.entryPoint && plugin.entryPoint.files) {
                for (const fileObj of plugin.entryPoint.files) {
                    const [filename, content] = Object.entries(fileObj)[0];
                    await fs.writeFile(path.join(pluginDir, filename), content);
                }
            }

            // Create plugin.js file
            const pluginJsContent = this.generatePluginJsContent(plugin);
            await fs.writeFile(path.join(pluginDir, 'plugin.js'), pluginJsContent);

            console.log(`Created plugin files for ${plugin.verb}`);
        } catch (error) { 
            analyzeError(error as Error);
            console.error(`Error creating plugin files for ${plugin.verb}:`, error instanceof Error ? error.message : error);
        }
    }

    private generatePluginJsContent(plugin: Plugin): string {
        return `
        import { Plugin, PluginParameterType } from '@cktmcs/shared';

        const ${plugin.verb.toLowerCase()}Plugin = {
        id: '${plugin.id}',
        verb: '${plugin.verb}',
        description: ${JSON.stringify(plugin.description)},
        explanation: ${JSON.stringify(plugin.explanation)},
        inputDefinitions: ${JSON.stringify(plugin.inputDefinitions, null, 2)},
        outputDefinitions: ${JSON.stringify(plugin.outputDefinitions, null, 2)},
        language: '${plugin.language}',
        entryPoint: ${JSON.stringify(plugin.entryPoint, null, 2)}
        };

        export default ${plugin.verb.toLowerCase()}Plugin;
        `;
    }

    private async requestEngineerForPlugin(verb: string, context: Map<string, PluginInput>): Promise<Plugin | undefined> {
        console.log(`Requesting Engineer to create plugin for ${verb}`);
        try {
            const engineerUrl = process.env.ENGINEER_URL || 'engineer:5050';
            const response = await axios.post(`http://${engineerUrl}/createPlugin`, MapSerializer.transformForSerialization({ verb, context }));
            const newPlugin = response.data;
            
            if (!newPlugin || !newPlugin.entryPoint) {
                console.error('Engineer returned invalid plugin data');
                return undefined;
            }
            console.log(`Successfully created new plugin for ${verb}`);
            return newPlugin;
        } catch (error) { 
            analyzeError(error as Error);
            console.error(`Engineer plugin creation failed for ${verb}:`, error instanceof Error ? error.message : error);
            return undefined;
        }
    }    
}
