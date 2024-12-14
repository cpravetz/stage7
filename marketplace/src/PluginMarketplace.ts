import { PluginDefinition, PluginChangeEvent } from '@cktmcs/shared';
import { PluginRepositoryLink, PluginManifest } from '@cktmcs/shared';
import { createHash } from 'crypto';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';

export class PluginMarketplace {
    private librarianUrl: string;
    private capabilitiesManagerUrl: string;
    private trustedPublishers: Set<string>;

    constructor(
        librarianUrl: string = process.env.LIBRARIAN_URL || 'librarian:5040',
        capabilitiesManagerUrl: string = process.env.CAPABILITIES_MANAGER_URL || 'capabilitiesmanager:5060'
    ) {
        this.librarianUrl = librarianUrl;
        this.capabilitiesManagerUrl = capabilitiesManagerUrl;
        this.trustedPublishers = new Set(['system-generated', 'trusted-publisher']);
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
        
        // Store signed plugin
        await this.pushToRepository(manifest, repositoryDef);
        
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
            const response = await axios.get(`http://${this.librarianUrl}/getData`, {
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
            return plugin;
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to fetch plugin: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async getPluginByVerb(verb: string): Promise<PluginDefinition | undefined> {
        try {
            console.log(`Marketplace seeking plugin for verb ${verb}`);
            const response = await axios.get(`http://${this.librarianUrl}/getData`, {
                params: {
                    query: { verb: verb },
                    collection: 'plugins',
                    storageType: 'mongo',
                    limit: 1
                }
            });

            if (!response.data || !response.data.length) {
                console.log(`Marketplace: No plugin found for verb ${verb}`);
                return undefined;
            }
            console.log(`Marketplace: getData Response data:`, response.data);
            const plugin = response.data[0] as PluginDefinition;
            console.log(`Marketplace: Found plugin ${plugin.id} for verb ${verb}`);
            // Verify signature before returning
            const expectedSignature = await this.signPlugin(plugin);
            if (plugin.security.trust.signature !== expectedSignature) {
                throw new Error('Plugin signature verification failed');
            }

            return plugin;
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
            }
        };
    }

    private async pushToRepository(
        manifest: PluginManifest,
        repository: PluginRepositoryLink
    ): Promise<void> {
        try {
            switch (repository.type) {
                case 'mongo':
                    await axios.post(`http://${this.librarianUrl}/storeData`, {
                        id: manifest.id,
                        data: manifest,
                        collection: 'plugins',
                        storageType: 'mongo'
                    });
                    break;
                case 'git':
                    // Implement Git repository publishing
                    throw new Error('Git repository publishing not implemented');
                case 'npm':
                    // Implement NPM repository publishing
                    throw new Error('NPM repository publishing not implemented');
                default:
                    throw new Error(`Unsupported repository type: ${repository.type}`);
            }
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to push to repository: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async fetchPluginManifest(pluginId: string, version: string): Promise<PluginManifest> {
        try {
            const response = await axios.get(`http://${this.librarianUrl}/getData`, {
                params: {
                    id: pluginId,
                    collection: 'plugins',
                    storageType: 'mongo'
                }
            });

            if (!response.data) {
                throw new Error(`Plugin ${pluginId} not found`);
            }

            return response.data as PluginManifest;
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to fetch plugin manifest: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private async verifyManifest(manifest: PluginManifest): Promise<boolean> {
        try {
            // Verify publisher
            if (!this.trustedPublishers.has(manifest.security.trust.publisher || '')) {
                return false;
            }

            // Verify signature
            const expectedSignature = await this.signPlugin(manifest);
            if (manifest.security.trust.signature !== expectedSignature) {
                return false;
            }

            // Verify certificate hash
            if (!await this.verifyCertificateHash(manifest)) {
                return false;
            }

            return true;
        } catch (error) {
            analyzeError(error as Error);
            return false;
        }
    }

    private async installDependencies(manifest: PluginManifest): Promise<void> {
        if (!manifest.repository.dependencies) {
            return;
        }

        try {
            for (const [dep, version] of Object.entries(manifest.repository.dependencies)) {
                // In production, implement proper dependency installation
                console.log(`Installing dependency ${dep}@${version}`);
            }
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private convertManifestToPlugin(manifest: PluginManifest): PluginDefinition {
        const { repository, distribution, ...plugin } = manifest;
        return plugin as PluginDefinition;
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