import { PluginDefinition, signPlugin, verifyPluginSignature } from '@cktmcs/shared';
import { PluginManifest, PluginRepository, RepositoryConfig, PluginRepositoryType, PluginLocator } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import fs from 'fs/promises';
import path from 'path';
import { MongoRepository } from './repositories/MongoRepository';
import { GitRepository } from './repositories/GitRepository';
//import { NpmRepository } from './repositories/NpmRepository';
import { LocalRepository } from './repositories/LocalRepository';
import { repositoryConfig } from './config/repositoryConfig';


export class PluginMarketplace {
    public defaultRepository: PluginRepositoryType;
    private localRepository: PluginRepositoryType = 'local';
    private repositories: Map<string, PluginRepository>;
    private pluginsBaseDir: string;

    constructor() {
        this.pluginsBaseDir = path.join(process.cwd(), 'plugins');
        this.defaultRepository = repositoryConfig.defaultRepository as PluginRepositoryType;
        this.repositories = new Map();
        for (const repoConfig of repositoryConfig.Repositories) {
            const repository = this.createRepository({
                ...repoConfig,
                type: repoConfig.type as PluginRepositoryType
            });
        if (repository) {
                this.repositories.set(repoConfig.type, repository);
            } else {
                console.warn(`Failed to create repository of type ${repoConfig.type}`);
            }
        }
    }

    async list(): Promise<PluginLocator[]> {
        const locators: PluginLocator[] = [];
        for (const repository of this.repositories.values()) {
            try {
                const repoPlugins = await repository.list();
                console.log('Marketplace: Adding ',repoPlugins.length,' Locators from ',repository.type);
                locators.push(...repoPlugins);
            } catch (error) {
                console.warn(`Error listing from repository: ${error}`);
                continue;
            }
        }
        console.log('Marketplace: Locators ',locators);
        return locators;
    }

    private createRepository(config: RepositoryConfig): PluginRepository | undefined {
        switch (config.type) {
            case 'git':
                return new GitRepository(config);
            case 'mongo':
                return new MongoRepository(config);
            //case 'npm':
            //    return new NpmPluginRepository(config);
            case 'local':
                return new LocalRepository(config);
            default:
                console.log(`Unsupported repository type: ${config.type}`);
                return undefined;
        }
    }

    async findOne(id: string): Promise<PluginManifest | undefined> {
        try {
            const localRepo = this.repositories.get('local');
            if (localRepo) {
                const plugin = await localRepo.fetch(id);
                if (plugin) {
                    return plugin;
                }
            }
            for (const repository of this.repositories.values()) {
                try {
                    const plugin = await repository.fetch(id);
                    if (plugin) {
                        return plugin;
                    }
                } catch (error) {
                    console.warn(`Error fetching from repository: ${error}`);
                    continue;
                }
            }
            return undefined;
        } catch {
            return undefined;
        }
    }

    async fetchOne(id: string, repository?: PluginRepositoryType): Promise<PluginManifest | undefined> {
        if (!repository) {
            repository = this.defaultRepository;
        }
        const repo = this.repositories.get(repository);
        if (!repo) {
            throw new Error(`Repository ${repository} not found`);
        }
        return await repo.fetch(id);
    }

    public async fetchOneByVerb(verb: string): Promise<PluginManifest | undefined> {
        for (const repository of this.repositories.values()) {
            try {
                const plugin = await repository.fetchByVerb(verb);
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
            const signature = await this.signPluginWithShared(plugin);
            plugin.security.trust.signature = signature;
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