import { PluginDefinition, signPlugin, verifyPluginSignature } from '@cktmcs/shared';
import { PluginManifest, PluginRepository, RepositoryConfig, PluginRepositoryType, PluginLocator } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import fs from 'fs/promises';
import path from 'path';
import { MongoRepository } from './repositories/MongoRepository';
import { GitRepository } from './repositories/GitRepository';
import { GitHubRepository } from './repositories/GitHubRepository';
//import { NpmRepository } from './repositories/NpmRepository';
import { LocalRepository } from './repositories/LocalRepository';
import { repositoryConfig } from './config/repositoryConfig';


export class PluginMarketplace {
    public defaultRepository: PluginRepositoryType;
    private localRepository: PluginRepositoryType = 'local';
    private repositories: Map<string, PluginRepository>;
    private pluginsBaseDir: string;

    /**
     * Get all repositories
     * @returns Map of repositories
     */
    public getRepositories(): Map<string, PluginRepository> {
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
                    if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_USERNAME || !process.env.GIT_REPOSITORY_URL) {
                        console.warn('GitHub repository is enabled but missing required credentials. Set GITHUB_TOKEN, GITHUB_USERNAME, and GIT_REPOSITORY_URL environment variables.');
                        continue;
                    }
                    console.log('Initializing GitHub repository with provided credentials');
                }

                const repository = this.createRepository({
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
     * @returns Array of plugin locators
     */
    async list(repository?: PluginRepositoryType): Promise<PluginLocator[]> {
        if (repository) {
            const repo = this.repositories.get(repository);
            if (!repo) {
                throw new Error(`Repository ${repository} not found`);
            }
            return await repo.list();
        }
        
        // If no repository specified, use default
        const defaultRepo = this.repositories.get(this.defaultRepository);
        if (!defaultRepo) {
            throw new Error(`Default repository ${this.defaultRepository} not found`);
        }
        return await defaultRepo.list();
    }

    /**
     * Create a repository instance based on the provided configuration
     * @param config Repository configuration
     * @returns Repository instance or undefined if creation failed
     */
    private createRepository(config: RepositoryConfig): PluginRepository | undefined {
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
                throw new Error(`Repository ${repository} not found`);
            }
            return await repo.fetch(id, version);
        }
        
        // If no repository specified, use default
        const defaultRepo = this.repositories.get(this.defaultRepository);
        if (!defaultRepo) {
            throw new Error(`Default repository ${this.defaultRepository} not found`);
        }
        return await defaultRepo.fetch(id, version);
    }

    public async fetchOneByVerb(verb: string, version?: string): Promise<PluginManifest | undefined> {
        for (const repository of this.repositories.values()) {
            try {
                const plugin = await repository.fetchByVerb(verb, version);
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
        const repoToUse = repositoryType ? this.repositories.get(repositoryType) : this.repositories.get(this.defaultRepository);

        if (!repoToUse) {
            const repoName = repositoryType || this.defaultRepository;
            // Consider throwing a specific error or logging
            console.error(`Repository ${repoName} not found when trying to fetch all versions for plugin ${pluginId}.`);
            return undefined;
        }
        // Type assertion needed because the generic 'PluginRepository' from the map 
        // might not yet be recognized by TSC as having 'fetchAllVersions'
        // if the interface change isn't fully picked up by the LSP/TSC context immediately.
        // However, we know it *should* have it based on the previous step.
        return await (repoToUse as any).fetchAllVersions(pluginId);
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
            let repository = plugin.repository.type || this.defaultRepository;
            const existingPlugin = await this.fetchOneByVerb(plugin.verb);
            if (existingPlugin) {
                repository = existingPlugin.repository.type;
            }
            // Signing is now expected to be done by the Engineer service before storing.
            // The manifest should arrive with a signature if it's a new plugin.
            // const signature = await this.signPluginWithShared(plugin); // REMOVE THIS
            // plugin.security.trust.signature = signature; // REMOVE THIS
            const repo = this.repositories.get(repository);
            if (repo) {
                await repo.store(plugin);
            }
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to store plugin: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}

export default PluginMarketplace;
