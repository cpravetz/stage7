import { PluginDefinition, signPlugin, verifyPluginSignature, PluginManifest, RepositoryConfig, PluginRepositoryType, PluginLocator, PluginRepository } from '@cktmcs/shared'; // PluginRepository restored

import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import fs from 'fs/promises';
import path from 'path';
import { MongoRepository } from './repositories/MongoRepository';
import { GitHubRepository } from './repositories/GitHubRepository';
//import { NpmRepository } from './repositories/NpmRepository';
import { LocalRepository } from './repositories/LocalRepository';
import { LibrarianDefinitionRepository, LibrarianDefinitionRepositoryConfig } from './repositories/LibrarianDefinitionRepository';
import { repositoryConfig } from './config/repositoryConfig';


export class PluginMarketplace {
    public defaultRepository: PluginRepositoryType;
    private localRepository: PluginRepositoryType = 'local';
    private repositories: Map<string, PluginRepository>; // Changed to PluginRepository
    private pluginsBaseDir: string;
    private _cachedPlugins: PluginLocator[] = [];

    /**
     * Get all repositories
     * @returns Map of repositories
     */
    public getRepositories(): Map<string, PluginRepository> { // Changed to PluginRepository
        return this.repositories;
    }

    constructor() {
        this.pluginsBaseDir = path.join(process.cwd(), 'plugins');

        // Use environment variable for default repository if available, otherwise use config
        this.defaultRepository = (process.env.DEFAULT_PLUGIN_REPOSITORY as PluginRepositoryType) ||
                               repositoryConfig.defaultRepository as PluginRepositoryType;

        this.repositories = new Map();
        for (const repoConfig of repositoryConfig.Repositories) {
            try {
                // Skip GitHub repository if GitHub access is disabled
                if (repoConfig.type === 'github' && process.env.ENABLE_GITHUB !== 'true') {
                    console.log('Skipping GitHub repository initialization as ENABLE_GITHUB is not set to true');
                    continue;
                }

                // For GitHub repository, verify required credentials are present
                if (repoConfig.type === 'github' && process.env.ENABLE_GITHUB === 'true') {
                    if (!process.env.GITHUB_TOKEN ) {
                        console.warn('GitHub TOKEN is missing.');
                        continue;
                    }
                    if (!process.env.GITHUB_USERNAME ) {
                        console.warn('GitHub USERNAME is missing.');
                        continue;
                    }
                    if (!process.env.GIT_REPOSITORY_URL) {
                        console.warn('GitHub REPOSITORY_URL is missing.');
                        continue;
                    }
                    console.log('Initializing GitHub repository with provided credentials');
                }

                const repository = this.createRepository({ // createRepository will now return InlinedPluginRepository | undefined
                    ...repoConfig,
                    type: repoConfig.type as PluginRepositoryType
                });

                if (repository) {
                    this.repositories.set(repoConfig.type, repository);
                    console.log(`Successfully initialized repository of type: ${repoConfig.type}`);
                } else {
                    console.warn(`Failed to create repository of type ${repoConfig.type}`);
                }
            } catch (error) {
                console.error(`Error initializing repository of type ${repoConfig.type}:`, error);
            }
        }
        this.loadAllPlugins();
    }

    private async loadAllPlugins() {
        const allPlugins: PluginLocator[] = [];
        for (const repo of this.repositories.values()) {
            try {
                const plugins = await repo.list();
                allPlugins.push(...plugins);
            } catch (err) {
                console.warn(`Error listing plugins from repository ${repo.type}:`, err);
            }
        }

        const uniquePlugins = new Map<string, PluginLocator>();
        for (const plugin of allPlugins) {
            const key = `${plugin.id}@${plugin.version}`;
            if (!uniquePlugins.has(key)) {
                uniquePlugins.set(key, plugin);
            }
        }
        this._cachedPlugins = Array.from(uniquePlugins.values());
        console.log(`PluginMarketplace: Cached ${this._cachedPlugins.length} plugins from all repositories.`);
    }

    /**
     * List all plugins from a specific repository
     * @param repository Repository type to list from
     * @param includeContainerPlugins Whether to include container plugins in results
     * @returns Array of plugin locators
     */
    async list(repository?: PluginRepositoryType, includeContainerPlugins: boolean = true): Promise<PluginLocator[]> {
        let pluginsToList = this._cachedPlugins;

        if (repository) {
            pluginsToList = pluginsToList.filter(p => p.repository.type === repository);
        }

        if (!includeContainerPlugins) {
            const filteredPlugins: PluginLocator[] = [];
            for (const plugin of pluginsToList) {
                try {
                    const manifest = await this.fetchOne(plugin.id, plugin.version, plugin.repository.type);
                    if (manifest && manifest.language !== 'container') {
                        filteredPlugins.push(plugin);
                    }
                } catch (error) {
                    console.warn(`Error fetching manifest for plugin ${plugin.id}: ${error}`);
                }
            }
            return filteredPlugins;
        }

        return pluginsToList;
    }

    /**
     * Create a repository instance based on the provided configuration
     * @param config Repository configuration
     * @returns Repository instance or undefined if creation failed
     */
    private createRepository(config: RepositoryConfig | LibrarianDefinitionRepositoryConfig): PluginRepository | undefined { // Changed return type
        try {
            switch (config.type) {
                case 'mongo':
                    return new MongoRepository(config);
                case 'github':
                    return new GitHubRepository(config);
                case 'local':
                    return new LocalRepository(config);
                case 'librarian-definition':
                    return new LibrarianDefinitionRepository(config);
                default:
                    console.warn(`Unknown repository type: ${config.type}`);
                    return undefined;
            }
        } catch (error) {
            console.error(`Failed to create repository of type ${config.type}:`, error);
            return undefined;
        }
    }

    /**
     * Fetch a plugin by ID from a specific repository
     * @param id Plugin ID
     * @param repository Repository type to fetch from
     * @returns Plugin manifest or undefined if not found
     */
    async fetchOne(id: string, version?: string, repository?: PluginRepositoryType): Promise<PluginManifest | undefined> {
        if (repository) {
            const repo = this.repositories.get(repository);
            if (!repo) {
                console.warn(`Repository ${repository} not found (fetchOne). Returning undefined.`);
                return undefined;
            }
            try {
                return await repo.fetch(id, version);
            } catch (err) {
                console.warn(`Error fetching plugin ${id} from repository ${repository}:`, err);
                return undefined;
            }
        }
        // If no repository is specified, search all repositories
        for (const repo of this.repositories.values()) {
            try {
                const manifest = await repo.fetch(id, version);
                if (manifest) {
                    return manifest;
                }
            } catch (err) {
                // Log and continue to the next repository
                console.warn(`Error fetching plugin ${id} from repository ${repo.type}:`, err);
            }
        }

        return undefined; // Return undefined if not found in any repository
    }

    public async fetchOneByVerb(verb: string, version?: string): Promise<PluginManifest | undefined> {
        // First, try to find the plugin in the cached locators
        const locator = this._cachedPlugins.find(p => p.verb === verb && (!version || p.version === version));

        if (locator) {
            // If found in cache, fetch the full manifest using fetchOne
            return this.fetchOne(locator.id, locator.version, locator.repository.type);
        }

        // If not found in cache, then iterate through repositories (fallback for newly added plugins or if cache is not fully up-to-date)
        for (const repository of this.repositories.values()) {
            try {
                const plugin = await repository.fetchByVerb(verb, version);
                if (plugin) { // && await this.verifySignature(plugin)) {
                    return plugin;
                }
            } catch (error) {
                console.warn(`Error fetching from repository ${repository.type} for verb ${verb}:`, error);
                // Continue to the next repository
            }
        }
        return undefined;
    }

    public async fetchAllVersionsOfPlugin(pluginId: string, repositoryType?: PluginRepositoryType): Promise<PluginManifest[] | undefined> {
        const repoToUse = repositoryType ? this.repositories.get(repositoryType) : this.repositories.get(this.defaultRepository); // repoToUse is PluginRepository | undefined
        if (!repoToUse) {
            const repoName = repositoryType || this.defaultRepository;
            console.warn(`Repository ${repoName} not found (fetchAllVersionsOfPlugin). Returning undefined.`);
            return undefined;
        }
        if (repoToUse.fetchAllVersionsOfPlugin) {
            try {
                return await repoToUse.fetchAllVersionsOfPlugin(pluginId);
            } catch (err) {
                console.warn(`Error fetching all versions for plugin ${pluginId} from repository ${repoToUse.type}:`, err);
                return undefined;
            }
        } else {
            console.warn(`Repository type ${repoToUse.type} does not support fetchAllVersionsOfPlugin.`);
            return undefined; 
        }
    }

    public async store(plugin: PluginManifest): Promise<void> {
        try {
            // Validate container plugin manifest if it's a container plugin
            if (plugin.language === 'container') {
                if (!this.validateContainerPlugin(plugin)) { return };
            }

            let repositoryType = plugin.repository.type || this.defaultRepository; // Changed variable name for clarity
            const existingPlugin = await this.fetchOneByVerb(plugin.verb); // This now correctly uses the PluginRepository type
            if (existingPlugin) {
                repositoryType = existingPlugin.repository.type;
            }

            const repo = this.repositories.get(repositoryType); // repo is PluginRepository | undefined
            if (repo) {
                await repo.store(plugin);
            } else {
                console.warn(`Repository ${repositoryType} not found (store). Plugin not stored.`);
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to store plugin: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Delete a plugin by ID (and optionally version) from a specific repository
     */
    public async delete(pluginId: string, version?: string, repository?: PluginRepositoryType): Promise<void> {
        if (repository) {
            const repo = this.repositories.get(repository);
            if (!repo) {
                console.warn(`Repository ${repository} not found (delete). Nothing to delete.`);
                return;
            }
            try {
                await repo.delete(pluginId, version);
            } catch (err) {
                console.warn(`Error deleting plugin ${pluginId} from repository ${repository}:`, err);
            }
            return;
        }
        // If no repository specified, use default
        const defaultRepo = this.repositories.get(this.defaultRepository);
        if (!defaultRepo) {
            console.warn(`Default repository ${this.defaultRepository} not found (delete). Nothing to delete.`);
            return;
        }
        try {
            await defaultRepo.delete(pluginId, version);
        } catch (err) {
            console.warn(`Error deleting plugin ${pluginId} from default repository:`, err);
        }
    }

    /**
     * Validate container plugin manifest
     * @param plugin Plugin manifest to validate
     */
    private validateContainerPlugin(plugin: PluginManifest): boolean {
        const containerConfig = (plugin as any).container;
        const apiConfig = (plugin as any).api;

        if (!containerConfig) {
            console.error('Container plugin missing container configuration');
            return false;
        }

        if (!apiConfig) {
            console.error('Container plugin missing API configuration');
            return false;
        }

        // Validate required container fields
        const requiredContainerFields = ['dockerfile', 'buildContext', 'image', 'ports'];
        for (const field of requiredContainerFields) {
            if (!containerConfig[field]) {
                console.error(`Container configuration missing required field: ${field}`);
                return false;
            }
        }

        // Validate API configuration
        if (!apiConfig.endpoint || !apiConfig.method) {
            console.error('Container API configuration missing endpoint or method');
            return false;
        }

        // Validate ports configuration
        if (!Array.isArray(containerConfig.ports) || containerConfig.ports.length === 0) {
            console.error('Container configuration must specify at least one port mapping');
            return false;
        }

        // Validate health check configuration if present
        if (containerConfig.healthCheck) {
            const healthCheck = containerConfig.healthCheck;
            if (!healthCheck.path) {
                console.error('Container health check configuration missing path');
                return false;
            }
        }
        return true;
    }

    /**
     * Returns a formatted string (or JSON) of all available plugins and their action verbs, descriptions, and input schemas.
     * Caches the result for efficiency and updates cache when plugins are added/removed/updated.
     * @returns Formatted string of available plugins for prompt injection
     */
    private _availablePluginsCache: string | null = null;
    private _availablePluginsCacheTime: number = 0;
    private static readonly PLUGIN_CACHE_TTL_MS = 60 * 1000; // 1 minute

}

export default PluginMarketplace;
