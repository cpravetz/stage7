import { Plugin, PluginParameterType, PluginInput, PluginOutput, MetadataType } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ConfigManager } from './configManager';
import { MapSerializer } from '@cktmcs/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);



export class PluginRegistry {
    private plugins: Map<string, Plugin & { metadata: MetadataType }> = new Map();
    private categories: Map<string, Set<string>> = new Map();
    private tags: Map<string, Set<string>> = new Map();
    public actionVerbs: Map<string, Plugin> = new Map();
    private pluginsLoaded: boolean = false;
    private librarianUrl: string;
    private configManager: ConfigManager;
    public currentDir = dirname(fileURLToPath(import.meta.url));
    private engineerUrl: string;

    constructor(configManager: ConfigManager) {
        this.actionVerbs = new Map();
        this.configManager = configManager;
        this.librarianUrl = process.env.LIBRARIAN_URL || 'librarian:5040';
        this.engineerUrl = process.env.ENGINEER_URL || 'engineer:5050';
    }

    static async initialize(configManager: ConfigManager): Promise<PluginRegistry> {
        const instance = new PluginRegistry(configManager);
        await instance.loadActionVerbs();
        return instance;
    }

    protected async loadActionVerbs() {
        if (!this.pluginsLoaded) {
            try {
                await this.loadLocalPlugins();
                await this.loadLibrarianPlugins();
                console.log('Action verbs loaded:', Array.from(this.actionVerbs.keys()));
            } catch (error) {
                analyzeError(error as Error);
                console.error('Error loading action verbs:', error instanceof Error ? error.message : error);
                this.actionVerbs = new Map();
                console.log('Initialized with empty action verbs map');
            }
            this.pluginsLoaded = true;

            for (const [verb, plugin] of this.actionVerbs.entries()) {
                const metadata = await this.configManager.getPluginMetadata(plugin.id);
                await this.registerPlugin(plugin, metadata);
            }
        }
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

    async getPluginsByCategory(category: string): Promise<(Plugin & { metadata: MetadataType })[]> {
        const pluginVerbs = this.categories.get(category) || new Set();
        return Array.from(pluginVerbs)
            .map(verb => this.plugins.get(verb))
            .filter((plugin): plugin is Plugin & { metadata: MetadataType } => plugin !== undefined);
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

    async recordPluginUsage(verb: string) {
        const plugin = this.plugins.get(verb);
        if (!plugin) { return;}
        const pluginMetadata = await this.configManager.getPluginMetadata(plugin.id);
        if (!pluginMetadata) { return;}
        pluginMetadata.lastUsed = new Date();
        pluginMetadata.usageCount? pluginMetadata.usageCount++ : pluginMetadata.usageCount = 1;
        this.configManager.updatePluginMetadata(plugin.id, pluginMetadata);
    }

    private async loadLocalPlugins() {
        const projectRoot = path.resolve(__dirname, '..');
        const pluginsDir = path.join(projectRoot, 'plugins');
        await this.recursivelyLoadPlugins(pluginsDir);
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

    private async loadLibrarianPlugins() {
        try {
            console.log(`Attempting to fetch plugins from Librarian at ${this.librarianUrl}`);
            const response = await axios.post(`http://${this.librarianUrl}/searchData`, {
                    collection: 'plugins', 
                    query: {}, 
                    options: { id: 1, name: 1, description: 1, version: 1, type: 1, verb: 1 
                },
                timeout: 5000 // Set a 5-second timeout
            });
            if (response.data) {
                const pluginList = response.data.data || response.data;
                if (pluginList && Array.isArray(pluginList)) {
                    for (const plugin of pluginList) {
                        if (plugin.verb && !this.actionVerbs.has(plugin.verb)) {
                            this.actionVerbs.set(plugin.verb, plugin);
                            console.log(`Loaded plugin ${plugin.verb} from Librarian`);
                        }
                    }
                    console.log(`Successfully loaded ${pluginList.length} plugins from Librarian`);
                } else {
                    console.warn('Unexpected response format from Librarian:', pluginList);
                }
            }
        } catch (error) { analyzeError(error as Error);
            // Continue execution even if Librarian plugins couldn't be loaded
            console.warn('Continuing without Librarian plugins');
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
            const response = await axios.post(`http://${this.engineerUrl}/createPlugin`, MapSerializer.transformForSerialization({ verb, context }));
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
