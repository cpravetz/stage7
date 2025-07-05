import { PluginDefinition, signPlugin, verifyPluginSignature, PluginManifest, RepositoryConfig, PluginRepositoryType, PluginLocator } from '@cktmcs/shared'; // PluginRepository removed

import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import fs from 'fs/promises';
import path from 'path';
import { MongoRepository } from './repositories/MongoRepository';
import { GitRepository } from './repositories/GitRepository';
import { GitHubRepository } from './repositories/GitHubRepository';
//import { NpmRepository } from './repositories/NpmRepository';
import { LocalRepository } from './repositories/LocalRepository';
import { LibrarianDefinitionRepository, LibrarianDefinitionRepositoryConfig } from './repositories/LibrarianDefinitionRepository';
import { repositoryConfig } from './config/repositoryConfig';

// Temporary inlined interface for diagnosis
interface InlinedPluginRepository {
    type: PluginRepositoryType | string; // Allow string for flexibility if needed
    list(): Promise<PluginLocator[]>;
    fetch(id: string, version?: string): Promise<PluginManifest | undefined>;
    fetchByVerb(verb: string, version?: string): Promise<PluginManifest | undefined>;
    fetchAllVersionsOfPlugin?(pluginId: string): Promise<PluginManifest[] | undefined>;
    store(plugin: PluginManifest): Promise<void>;
    delete(pluginId: string, version?: string): Promise<void>; // Matched from MongoRepository (and should be in others)
}


export class PluginMarketplace {
    public defaultRepository: PluginRepositoryType;
    private localRepository: PluginRepositoryType = 'local';
    private repositories: Map<string, InlinedPluginRepository>; // Changed to InlinedPluginRepository
    private pluginsBaseDir: string;

    /**
     * Get all repositories
     * @returns Map of repositories
     */
    public getRepositories(): Map<string, InlinedPluginRepository> { // Changed to InlinedPluginRepository
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
    }

    /**
     * List all plugins from a specific repository
     * @param repository Repository type to list from
     * @param includeContainerPlugins Whether to include container plugins in results
     * @returns Array of plugin locators
     */
    async list(repository?: PluginRepositoryType, includeContainerPlugins: boolean = true): Promise<PluginLocator[]> {
        if (repository) {
            const repo = this.repositories.get(repository); // repo is InlinedPluginRepository | undefined
            if (!repo) {
                // Instead of throwing, return empty list for missing/misconfigured repository
                console.warn(`Repository ${repository} not found (list). Returning empty list.`);
                return [];
            }
            try {
                const plugins = await repo.list();
                if (!includeContainerPlugins) {
                    const filteredPlugins: PluginLocator[] = [];
                    for (const plugin of plugins) {
                        try {
                            const manifest = await repo.fetch(plugin.id, plugin.version);
                            if (manifest && manifest.language !== 'container') {
                                filteredPlugins.push(plugin);
                            }
                        } catch (error) {
                            console.warn(`Error fetching manifest for plugin ${plugin.id}: ${error}`);
                            filteredPlugins.push(plugin);
                        }
                    }
                    return filteredPlugins;
                }
                return plugins;
            } catch (err) {
                console.warn(`Error listing plugins from repository ${repository}:`, err);
                return [];
            }
        }
        // If no repository specified, use default
        const defaultRepo = this.repositories.get(this.defaultRepository); 
        if (!defaultRepo) {
            console.warn(`Default repository ${this.defaultRepository} not found (list). Returning empty list.`);
            return [];
        }
        try {
            const plugins = await defaultRepo.list();
            if (!includeContainerPlugins) {
                const filteredPlugins: PluginLocator[] = [];
                for (const plugin of plugins) {
                    try {
                        const manifest = await defaultRepo.fetch(plugin.id, plugin.version);
                        if (manifest && manifest.language !== 'container') {
                            filteredPlugins.push(plugin);
                        }
                    } catch (error) {
                        console.warn(`Error fetching manifest for plugin ${plugin.id}: ${error}`);
                        filteredPlugins.push(plugin);
                    }
                }
                return filteredPlugins;
            }
            return plugins;
        } catch (err) {
            console.warn(`Error listing plugins from default repository:`, err);
            return [];
        }
    }

    /**
     * Create a repository instance based on the provided configuration
     * @param config Repository configuration
     * @returns Repository instance or undefined if creation failed
     */
    private createRepository(config: RepositoryConfig | LibrarianDefinitionRepositoryConfig): InlinedPluginRepository | undefined { // Changed return type
        try {
            switch (config.type) {
                case 'mongo':
                    return new MongoRepository(config);
                case 'git':
                    return new GitRepository(config);
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
            const repo = this.repositories.get(repository); // repo is InlinedPluginRepository | undefined
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
        // If no repository specified, use default
        const defaultRepo = this.repositories.get(this.defaultRepository); // defaultRepo is InlinedPluginRepository | undefined
        if (!defaultRepo) {
            console.warn(`Default repository ${this.defaultRepository} not found (fetchOne). Returning undefined.`);
            return undefined;
        }
        try {
            return await defaultRepo.fetch(id, version);
        } catch (err) {
            console.warn(`Error fetching plugin ${id} from default repository:`, err);
            return undefined;
        }
    }

    public async fetchOneByVerb(verb: string, version?: string): Promise<PluginManifest | undefined> {
        for (const repository of this.repositories.values()) { // repository is InlinedPluginRepository
            try {
                const plugin = await repository.fetchByVerb(verb, version); // Removed (repository as PluginRepository) cast
                if (plugin) { //} && await this.verifySignature(plugin)) {
                    return plugin;
                }
            } catch (error) {
                console.warn(`Error fetching from repository: ${error}`);
                continue;
            }
        }
        return undefined;
    }

    public async fetchAllVersionsOfPlugin(pluginId: string, repositoryType?: PluginRepositoryType): Promise<PluginManifest[] | undefined> {
        const repoToUse = repositoryType ? this.repositories.get(repositoryType) : this.repositories.get(this.defaultRepository); // repoToUse is InlinedPluginRepository | undefined
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


    private async signPluginWithShared(plugin: PluginDefinition): Promise<string> {
        try {
            // Use the shared signPlugin function that supports RSA signing
            return signPlugin(plugin);
        } catch (error) {
            analyzeError(error as Error);
            throw new Error('Failed to sign plugin');
        }
    }

    private async verifySignature(plugin: PluginManifest): Promise<boolean> {
        // Use the shared verifyPluginSignature function that supports RSA verification
        return verifyPluginSignature(plugin);
    }

    public async store(plugin: PluginManifest): Promise<void> {
        try {
            // Validate container plugin manifest if it's a container plugin
            if (plugin.language === 'container') {
                this.validateContainerPlugin(plugin);
            }

            let repositoryType = plugin.repository.type || this.defaultRepository; // Changed variable name for clarity
            const existingPlugin = await this.fetchOneByVerb(plugin.verb); // This now correctly uses the InlinedPluginRepository type
            if (existingPlugin) {
                repositoryType = existingPlugin.repository.type;
            }

            const repo = this.repositories.get(repositoryType); // repo is InlinedPluginRepository | undefined
            if (repo) {
                await repo.store(plugin);
            } else {
                console.warn(`Repository ${repositoryType} not found (store). Plugin not stored.`);
            }
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to store plugin: ${error instanceof Error ? error.message : String(error)}`);
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
    private validateContainerPlugin(plugin: PluginManifest): void {
        const containerConfig = (plugin as any).container;
        const apiConfig = (plugin as any).api;

        if (!containerConfig) {
            throw new Error('Container plugin missing container configuration');
        }

        if (!apiConfig) {
            throw new Error('Container plugin missing API configuration');
        }

        // Validate required container fields
        const requiredContainerFields = ['dockerfile', 'buildContext', 'image', 'ports'];
        for (const field of requiredContainerFields) {
            if (!containerConfig[field]) {
                throw new Error(`Container configuration missing required field: ${field}`);
            }
        }

        // Validate API configuration
        if (!apiConfig.endpoint || !apiConfig.method) {
            throw new Error('Container API configuration missing endpoint or method');
        }

        // Validate ports configuration
        if (!Array.isArray(containerConfig.ports) || containerConfig.ports.length === 0) {
            throw new Error('Container configuration must specify at least one port mapping');
        }

        // Validate health check configuration if present
        if (containerConfig.healthCheck) {
            const healthCheck = containerConfig.healthCheck;
            if (!healthCheck.path) {
                throw new Error('Container health check configuration missing path');
            }
        }
    }

    /**
     * Returns a formatted string (or JSON) of all available plugins and their action verbs, descriptions, and input schemas.
     * Caches the result for efficiency and updates cache when plugins are added/removed/updated.
     * @returns Formatted string of available plugins for prompt injection
     */
    private _availablePluginsCache: string | null = null;
    private _availablePluginsCacheTime: number = 0;
    private static readonly PLUGIN_CACHE_TTL_MS = 60 * 1000; // 1 minute

    public async getAvailablePluginsStr(forceRefresh = false): Promise<string> {
        // If cache is valid, return it
        if (!forceRefresh && this._availablePluginsCache && (Date.now() - this._availablePluginsCacheTime < PluginMarketplace.PLUGIN_CACHE_TTL_MS)) {
            return this._availablePluginsCache;
        }
        // Gather all plugin manifests from all repositories
        const pluginManifests: PluginManifest[] = [];
        for (const repo of this.repositories.values()) {
            try {
                const locators = await repo.list();
                for (const locator of locators) {
                    const manifest = await repo.fetch(locator.id, locator.version);
                    if (manifest) pluginManifests.push(manifest);
                }
            } catch (err) {
                // Ignore errors from individual repos
                continue;
            }
        }
        // Format as a readable string for prompt injection
        const lines: string[] = [];
        for (const plugin of pluginManifests) {
            lines.push(`- ${plugin.verb}: ${plugin.description || 'No description.'}`);
            if (plugin.inputDefinitions && plugin.inputDefinitions.length > 0) {
                lines.push(`    Required Inputs:`);
                for (const input of plugin.inputDefinitions) {
                    lines.push(`      - ${input.name} (${input.type})${input.required ? ' [required]' : ''}: ${input.description || ''}`);
                }
            }
        }
        // Add internal verbs (hardcoded for now, could be made dynamic)
        lines.push('- DELEGATE: Create sub-agents with goals of their own.');
        lines.push('- THINK: - sends prompts to the chat function of the LLMs attached to the system in order to generate content from a conversation.(required input: prompt) (optional inputs: optimization (cost|accuracy|creativity|speed|continuity), ConversationType) accuracy is the default optimization');
        lines.push('- GENERATE: - uses LLM services to generate content from a prompt or other content. Services include image creation, audio transcription, image editing, etc. (required input: ConversationType) (optional inputs: modelName, optimization, prompt, file, audio, video, image...)');
        lines.push('- DECIDE: - Conditional branching based on a condition (required inputs: condition: {"inputName": "value"}, trueSteps[], falseSteps[])');
        lines.push('- WHILE: - Repeat steps while a condition is true (required inputs: condition: {"inputName": "value"}, steps[])');
        lines.push('- UNTIL: - Repeat steps until a condition becomes true (required inputs: condition: {"inputName": "value"}, steps[])');
        lines.push('- SEQUENCE: - Execute steps in strict sequential order / no concurrency (required inputs: steps[])');
        lines.push('- TIMEOUT: - Set a timeout for a group of steps (required inputs: timeout, steps[])');
        lines.push('- REPEAT: - Repeat steps a specific number of times (required inputs: count, steps[])');
        lines.push('- FOREACH: - Iterate over an array and execute steps for each item (required inputs: array, steps[plan])');

        // Add more internal verbs as needed
        const result = lines.join('\n');
        this._availablePluginsCache = result;
        this._availablePluginsCacheTime = Date.now();
        return result;
    }
}

export default PluginMarketplace;
