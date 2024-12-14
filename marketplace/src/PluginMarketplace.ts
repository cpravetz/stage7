import { PluginDefinition, PluginChangeEvent } from '@cktmcs/shared';
import { PluginRepositoryLink, PluginManifest, PluginRepository, RepositoryConfig } from '@cktmcs/shared';
import { createHash } from 'crypto';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import fs from 'fs/promises';
import path from 'path';
import { MongoRepository } from './repositories/MongoRepository';
import { GitRepository } from './repositories/GitRepository';
//import { NpmRepository } from './repositories/NpmRepository';
import { LocalRepository } from './repositories/LocalRepository';
import { repositoryConfig } from '../src/config/repository.config';


export class PluginMarketplace {
    private librarianUrl: string;
    private capabilitiesManagerUrl: string;
    private trustedPublishers: Set<string>;
    private defaultRepository: PluginRepository | undefined;
    private repositories: Map<string, PluginRepository>;
    private pluginsBaseDir: string;

    constructor(
        librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040',
        capabilitiesManagerUrl: string = process.env.CAPABILITIESMANAGER_URL || 'capabilitiesmanager:5060'
    ) {
        this.librarianUrl = librarianUrl;
        this.capabilitiesManagerUrl = capabilitiesManagerUrl;
        this.trustedPublishers = new Set(['system-generated', 'trusted-publisher']);
        this.defaultRepository = this.createRepository({
            ...repositoryConfig.defaultRepository,
            type: repositoryConfig.defaultRepository.type as 'git' | 'npm' | 'local' | 'mongo'
        });
        if (!this.defaultRepository) {
            throw new Error(`Failed to create default repository of type ${repositoryConfig.defaultRepository.type}`);
        }

        this.repositories = new Map();
        this.repositories.set(this.defaultRepository.type, this.defaultRepository);
        
        if (repositoryConfig.additionalRepositories) {
            for (const repoConfig of repositoryConfig.additionalRepositories) {
                const repository = this.createRepository({
                    ...repoConfig,
                    type: repoConfig.type as 'git' | 'npm' | 'local' | 'mongo'
                });
                if (repository) {
                    this.repositories.set(repoConfig.type, repository);
                } else {
                    console.warn(`Failed to create repository of type ${repoConfig.type}`);
                }
            }
        }
        this.pluginsBaseDir = path.join(process.cwd(), 'plugins');
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

    async publishPlugin(plugin: PluginDefinition, repositoryDef: PluginRepositoryLink): Promise<void> {

        const existingPlugin = await this.getPluginByVerb(plugin.verb);
        if (existingPlugin) {
            console.log(`Plugin with verb ${plugin.verb} already exists. Skipping publication.`);
            return;
        }

        // Verify plugin before publishing
        const verified = await this.verifyPlugin(plugin);
        
        if (!verified) {
            console.log('Marketplace: Verification failed, skipping publication');
            return;
        }
        // Sign the plugin
        const signature = await this.signPlugin(plugin);
        
        // Create manifest with security info
        const manifest = await this.createPluginManifest(plugin, repositoryDef, signature);
        
        // Store in specified repository
        const repository = this.repositories.get(repositoryDef.type);
        if (!repository) {
            console.log(`Repository type ${repositoryDef.type} not configured`);
            return;
        }

        await repository.publish(manifest);
        await this.ensureLocalPluginFiles(manifest);
        
        // Notify about new plugin with signature
        await this.notifyPluginChange({ 
            type: 'PUBLISHED', 
            plugin: manifest,
            signature 
        });
    }

    private async notifyPluginChange(event: PluginChangeEvent): Promise<void> {
        try {
            axios.post(`http://${this.capabilitiesManagerUrl}/notify`, {
                plugin: event.plugin,
                type: event.type,
                timestamp: new Date().toISOString(),
                signature: event.signature
            });
        } catch (error) {
            analyzeError(error as Error);
            console.warn(`Failed to notify CapabilitiesManager of new plugin: ${error instanceof Error ? error.message : String(error)}`);
            // Don't throw error as this is a non-critical operation
        }
    }

    async getPlugin(id: string): Promise<PluginDefinition | undefined> {
        try {
            for (const repository of this.repositories.values()) {
                try {
                    const plugin = await repository.fetch(id);
                    if (plugin) {
                        // Ensure plugin files are available locally
                        await this.ensureLocalPluginFiles(plugin);
                        return plugin;
                    }
                } catch (error) {
                    console.warn(`Error fetching from repository: ${error}`);
                    continue;
                }
            }

            return undefined;
    
/*            const response = await axios.get(`http://${this.librarianUrl}/getData`, {
                params: {
                    id: id,
                    collection: 'plugins',
                    storageType: 'mongo'
                }
            });

            if (!response.data) {
                return undefined;
            }

            const plugin = response.data as PluginDefinition;
        
            // Verify signature before returning
            const expectedSignature = await this.signPlugin(plugin);
            if (plugin.security.trust.signature !== expectedSignature) {
                throw new Error('Plugin signature verification failed');
            }
            return plugin;*/
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to fetch plugin: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async getPluginByVerb(verb: string): Promise<PluginDefinition | undefined> {
        try {
            for (const repository of this.repositories.values()) {
                try {
                    const plugin = await repository.fetchByVerb(verb);
                    if (plugin) {
                        console.log(`Marketplace: Found plugin ${plugin.id} for verb ${verb}`);
                        // Verify signature before returning
                        const expectedSignature = await this.signPlugin(plugin);
                        if (plugin.security.trust.signature !== expectedSignature) {
                            console.log('Plugin signature verification failed');
                            return undefined;
                        }
                        // Ensure plugin files are available locally
                        await this.ensureLocalPluginFiles(plugin);
                        return plugin;
                    }
                } catch (error) {
                    console.warn(`Error fetching from repository: ${error}`);
                    continue;
                }
            }

            return undefined;
        } catch (error) {
            return undefined;
        }
    }

    public async getAllPlugins(): Promise<PluginDefinition[]> {
        try {
            const response = await axios.get(`http://${this.librarianUrl}/getData`, {
                params: {
                    collection: 'plugins',
                    storageType: 'mongo'
                }
            });

            if (!response.data) {
                return [];
            }

            const plugins = response.data as PluginDefinition[];
            
            // Verify signatures
            for (const plugin of plugins) {
                const expectedSignature = await this.signPlugin(plugin);
                if (plugin.security.trust.signature !== expectedSignature) {
                    throw new Error(`Plugin signature verification failed for plugin ${plugin.id}`);
                }
            }

            return plugins;
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to get all plugins: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async verifyPlugin(plugin: PluginDefinition): Promise<boolean> {
        // Verify plugin structure
        if (!plugin.id || !plugin.verb || !plugin.entryPoint) {
            console.log('Invalid plugin structure');
            return false;
        }

        // Verify security settings
        if (!plugin.security || !plugin.security.permissions || !plugin.security.sandboxOptions) {
            console.log('Invalid security configuration');
            return false;
        }

        // Verify plugin code
        if (!await this.verifyPluginCode(plugin)) {
            console.log('Plugin code verification failed');
            return false;
        }
        return true;        
    }

    private async verifyPluginCode(plugin: PluginDefinition): Promise<boolean> {
        try {
            // Check for malicious patterns
            const code = JSON.stringify(plugin.entryPoint?.files);
            const maliciousPatterns = [
                'process.exit',
                'require("child_process")',
                'require("fs")',
                'eval(',
                'Function(',
            ];

            if (maliciousPatterns.some(pattern => code.includes(pattern))) {
                console.log('Malicious pattern detected in plugin code');
                return false;
            }

            // Verify file structure
            if (!plugin.entryPoint?.main || !plugin.entryPoint.files) {
                console.log('Invalid plugin file structure', plugin.entryPoint);
                return false;
            }

            return true;
        } catch (error) {
            //analyzeError(error as Error);
            return false;
        }
    }

    private async signPlugin(plugin: PluginDefinition): Promise<string> {
        try {
            const content = JSON.stringify({
                id: plugin.id,
                verb: plugin.verb,
                entryPoint: plugin.entryPoint,
                security: plugin.security
            });

            // In production, use proper signing mechanism
            const hash = createHash('sha256').update(content).digest('hex');
            return hash;
        } catch (error) {
            analyzeError(error as Error);
            throw new Error('Failed to sign plugin');
        }
    }

    private async createPluginManifest(
        plugin: PluginDefinition,
        repository: PluginRepositoryLink,
        signature: string
    ): Promise<PluginManifest> {
        return {
            ...plugin,
            repository: repository,
            security: {
                ...plugin.security,
                trust: {
                    signature: signature,
                    publisher: plugin.security.trust.publisher || 'system-generated',
                    certificateHash: await this.generateCertificateHash(plugin)
                }
            },
            distribution: {
                downloads: 0,
                rating: 0
            },
            version: '1.0.0'

        };
    }

    private async ensureLocalPluginFiles(plugin: PluginDefinition): Promise<void> {
        const pluginDir = path.join(this.pluginsBaseDir, plugin.verb);

        // Check if files already exist and are up to date
        if (await this.isPluginUpToDate(plugin, pluginDir)) {
            return;
        }

        // Create plugin directory
        await fs.mkdir(pluginDir, { recursive: true });

        // Write plugin files
        if (plugin.entryPoint?.files) {
            for (const [filename, content] of Object.entries(plugin.entryPoint.files)) {
                const filePath = path.join(pluginDir, filename);
                await fs.mkdir(path.dirname(filePath), { recursive: true });
                await fs.writeFile(filePath, content);
            }
        }

        // Write manifest for version tracking
        await fs.writeFile(
            path.join(pluginDir, 'plugin-manifest.json'),
            JSON.stringify(plugin, null, 2)
        );
    }

    private async isPluginUpToDate(plugin: PluginDefinition, pluginDir: string): Promise<boolean> {
        try {
            const manifestPath = path.join(pluginDir, 'plugin-manifest.json');
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const existingManifest = JSON.parse(manifestContent);
            
            return existingManifest.version === plugin.version;
        } catch {
            return false;
        }
    }

    private async pushToRepository(
        manifest: PluginManifest,
        repository: PluginRepositoryLink
    ): Promise<void> {
        try {
            const targetRepo = this.repositories.get(repository.type);
            
            if (!targetRepo) {
                throw new Error(`Repository type ${repository.type} not found`);
            }

            await targetRepo.publish(manifest);
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to push to repository: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async fetchPluginManifest(pluginId: string, version: string): Promise<PluginManifest> {
        try {
            // Try each repository until we find the plugin
            for (const repository of this.repositories.values()) {
                try {
                    const manifest = await repository.fetch(pluginId);
                    if (manifest) {
                        // If version is specified, check it matches
                        if (version && manifest.version !== version) {
                            continue;
                        }
                        return manifest;
                    }
                } catch (error) {
                    console.warn(`Error fetching from repository: ${error}`);
                    continue;
                }
            }
            
            throw new Error(`Plugin ${pluginId} not found`);
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to fetch plugin manifest: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async generateCertificateHash(plugin: PluginDefinition): Promise<string> {
        // In production, implement proper certificate hash generation
        const content = JSON.stringify(plugin);
        return createHash('sha256').update(content).digest('hex');
    }

    private async verifyCertificateHash(manifest: PluginManifest): Promise<boolean> {
        // In production, implement proper certificate verification
        const expectedHash = await this.generateCertificateHash(manifest);
        return manifest.security.trust.certificateHash === expectedHash;
    }
}

export default PluginMarketplace;