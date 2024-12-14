import { PluginDefinition, PluginChangeEvent } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { PluginMarketplace } from '@cktmcs/marketplace';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const capabilitiesManagerUrl = 'capabilitiesmanager:5060';

export class PluginRegistry {
    private cache: Map<string, PluginDefinition>;
    private verbIndex: Map<string, string>;  // verb -> id mapping
    private categoryIndex: Map<string, Set<string>>;  // category -> ids mapping
    private tagIndex: Map<string, Set<string>>;  // tag -> ids mapping
    private pluginMarketplace: PluginMarketplace;    
    public currentDir = dirname(fileURLToPath(import.meta.url));

    constructor() {
        this.cache = new Map();
        this.verbIndex = new Map();
        this.categoryIndex = new Map();
        this.tagIndex = new Map();
        this.pluginMarketplace = new PluginMarketplace();
        InitializeExistingPlugins(this, 'librarian:5040');
    }

        // Plugin Query Methods
        async getPluginByVerb(verb: string): Promise<PluginDefinition | undefined> {
            const pluginId = this.verbIndex.get(verb);
            console.log('Registry: Seeking plugin for verb:', verb, 'in cache. Found:', pluginId);
            if (!pluginId) {
                const plugin = await this.pluginMarketplace.getPluginByVerb(verb);
                console.log('Registry: Seeking plugin for verb:', verb, 'in marketplace. Found:', plugin);
                if (plugin) {
                    this.updateCache(plugin);
                }
                return plugin;
            }
            return this.cache.get(pluginId);
        }
    
        async getPluginById(id: string): Promise<PluginDefinition | undefined> {
            if (!this.cache.has(id)) {
                const plugin = await this.pluginMarketplace.getPlugin(id);
                if (plugin) {
                    this.updateCache(plugin);
                }
                return plugin;
            }
            return this.cache.get(id);
        }

        async getPluginsByCategory(category: string): Promise<PluginDefinition[]> {
            const ids = this.categoryIndex.get(category) || new Set();
            return Array.from(ids)
                .map(id => this.cache.get(id))
                .filter((plugin): plugin is PluginDefinition => plugin !== undefined);
        }
    
        async getPluginsByTags(tags: string[]): Promise<PluginDefinition[]> {
            const pluginIds = new Set<string>();
            tags.forEach(tag => {
                const ids = this.tagIndex.get(tag) || new Set();
                ids.forEach(id => pluginIds.add(id));
            });
            return Array.from(pluginIds)
                .map(id => this.cache.get(id))
                .filter((plugin): plugin is PluginDefinition => plugin !== undefined);
        }

        async getAvailablePlugins(req: express.Request, res: express.Response) {
            try {
                const plugins = Array.from(this.cache.values());
                res.status(200).json(plugins.map(p => ({ 
                    id: p.id, 
                    verb: p.verb, 
                    description: p.description 
                })));
            } catch (error) {
                res.status(500).json({ error: 'Failed to get available plugins' });
            }
        }
    
        private updateCache(plugin: PluginDefinition): void {
            console.log('Registry: Updating cache with plugin:', plugin);
            // Update main cache
            this.cache.set(plugin.id, plugin);
            
            // Update verb index
            this.verbIndex.set(plugin.verb, plugin.id);
            
            // Update category index
            plugin.metadata?.category?.forEach(category => {
                if (!this.categoryIndex.has(category)) {
                    this.categoryIndex.set(category, new Set());
                }
                this.categoryIndex.get(category)?.add(plugin.id);
            });
            
            // Update tag index
            plugin.metadata?.tags?.forEach(tag => {
                if (!this.tagIndex.has(tag)) {
                    this.tagIndex.set(tag, new Set());
                }
                this.tagIndex.get(tag)?.add(plugin.id);
            });
        }

        // Subscribe to marketplace events for cache invalidation
        public handlePluginChange(event: PluginChangeEvent): void {
            console.log('Registry Received plugin change event:', event);
            switch (event.type) {
                case 'PUBLISHED':
                case 'UPDATED':
                    console.log('Registry: Heard notify, Updating cache with plugin:', event.plugin);
                    this.updateCache(event.plugin);
                    break;
                case 'DELETED':
                    this.removeFromCache(event.plugin.id);
                    break;
            }
        }

        private removeFromCache(pluginId: string): void {
            const plugin = this.cache.get(pluginId);
            if (!plugin) return;
    
            // Remove from main cache
            this.cache.delete(pluginId);
            
            // Remove from verb index
            this.verbIndex.delete(plugin.verb);
            
            // Remove from category index
            plugin.metadata?.category?.forEach(category => {
                this.categoryIndex.get(category)?.delete(pluginId);
            });
            
            // Remove from tag index
            plugin.metadata?.tags?.forEach(tag => {
                this.tagIndex.get(tag)?.delete(pluginId);
            });
        }        

        async getSummarizedCapabilities(): Promise<string> {
            // Get categories from categoryIndex
            const categories = Array.from(this.categoryIndex.entries()).map(([category, pluginIds]) => ({
                category,
                verbCount: pluginIds.size,
                examples: Array.from(pluginIds)
                    .slice(0, 3)
                    .map(id => this.cache.get(id)?.verb)
                    .filter(verb => verb !== undefined)
            }));
    
            // Get most used tags from tagIndex
            const mostUsedTags = Array.from(this.tagIndex.entries())
                .map(([tag, pluginIds]) => ({
                    tag,
                    count: pluginIds.size
                }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10);
    
            return JSON.stringify({
                totalPlugins: this.cache.size,
                categories: categories,
                mostUsedTags: mostUsedTags
            });
        }
    }

/**
 * Initializes existing plugins by loading them from the specified directory
 * and registering them with the provided plugin registry.
 *
 * @param pluginRegistry - The registry where plugins will be registered. It is expected to manage plugin lifecycle and interactions.
 * @param librarianUrl - The URL of the librarian service used to fetch additional plugin metadata or configurations.
 * @returns A promise that resolves when all plugins have been initialized and registered.
 */
export async function InitializeExistingPlugins(pluginRegistry: any, librarianUrl: string): Promise<void> {
    const pluginsDir = path.join(__dirname, '..', 'plugins');
    console.log('Initializing existing plugins...');
    try {
        // Read all directories in the plugins folder
        const pluginDirs = await fs.readdir(pluginsDir);
        
        for (const dir of pluginDirs) {
            const dirPath = path.join(pluginsDir, dir);
            const stats = await fs.stat(dirPath);
            if (stats.isDirectory() ) {
                try {
                    console.log(`Initializing plugin in directory ${dir}`);
                    // Read plugin.js file which contains the plugin definition
                    const pluginPath = path.join(dirPath, 'plugin.js');
                    const pluginModule = await import(pluginPath);
                    const plugin: PluginDefinition = pluginModule.default;

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
                    await axios.post(`http://${capabilitiesManagerUrl}/registerPlugin`, plugin);
                
                    console.log(`Built-in plugin ${plugin.verb} initialized successfully`);
                } catch (error) {
                    analyzeError(error as Error);
                    console.error(`Failed to initialize plugin in directory ${dir}:`, error instanceof Error ? error.message : error);
                }
            }
        }
    } catch (error) {
        analyzeError(error as Error);
        console.error('Failed to initialize existing plugins:', error instanceof Error ? error.message : error);
    }
}
