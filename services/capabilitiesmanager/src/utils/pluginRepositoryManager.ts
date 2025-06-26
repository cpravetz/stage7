import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PluginPackage, PluginPackager, PackageMetadata } from './pluginPackager';
import { PluginManifest } from '@cktmcs/shared';

export interface RepositoryConfig {
    owner: string;
    repo: string;
    token: string;
    branch: string;
}

export interface PluginRegistryEntry {
    id: string;
    name: string;
    version: string;
    description: string;
    author: string;
    category: string;
    tags: string[];
    downloadUrl: string;
    packageHash: string;
    createdAt: string;
    updatedAt: string;
    compatibility: string[];
    verified: boolean;
}

export class PluginRepositoryManager {
    private readonly config: RepositoryConfig;
    private readonly packager: PluginPackager;
    private readonly baseUrl: string;

    constructor(config: RepositoryConfig, packager: PluginPackager) {
        this.config = config;
        this.packager = packager;
        this.baseUrl = `https://api.github.com/repos/${config.owner}/${config.repo}`;
    }

    /**
     * Publish a plugin to the repository
     */
    async publishPlugin(
        pluginPath: string, 
        manifest: PluginManifest, 
        metadata: PackageMetadata
    ): Promise<PluginRegistryEntry> {
        console.log(`Publishing plugin ${manifest.id} v${manifest.version} to repository...`);

        try {
            // Package the plugin
            const pluginPackage = await this.packager.packagePlugin(pluginPath, manifest, metadata);

            // Upload package to GitHub releases
            const downloadUrl = await this.uploadPackageToGitHub(pluginPackage);

            // Create registry entry
            const registryEntry: PluginRegistryEntry = {
                id: manifest.id,
                name: manifest.id,
                version: manifest.version,
                description: manifest.description,
                author: manifest.metadata?.author || 'Unknown',
                category: metadata.category,
                tags: metadata.tags,
                downloadUrl,
                packageHash: pluginPackage.packageHash,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                compatibility: metadata.compatibility,
                verified: false // Will be verified by maintainers
            };

            // Update registry
            await this.updatePluginRegistry(registryEntry);

            console.log(`Plugin published successfully: ${manifest.id} v${manifest.version}`);
            return registryEntry;

        } catch (error) {
            console.error(`Failed to publish plugin ${manifest.id}:`, error);
            throw error;
        }
    }

    /**
     * Download and install a plugin from the repository
     */
    async installPlugin(pluginId: string, version?: string, targetDir?: string): Promise<PluginManifest> {
        console.log(`Installing plugin ${pluginId}${version ? ` v${version}` : ''}...`);

        try {
            // Get plugin registry
            const registry = await this.getPluginRegistry();
            
            // Find plugin entry
            const entries = registry.filter(entry => entry.id === pluginId);
            if (entries.length === 0) {
                throw new Error(`Plugin not found: ${pluginId}`);
            }

            // Select version
            let selectedEntry: PluginRegistryEntry;
            if (version) {
                const foundEntry = entries.find(entry => entry.version === version);
                if (!foundEntry) {
                    throw new Error(`Plugin version not found: ${pluginId} v${version}`);
                }
                selectedEntry = foundEntry;
            } else {
                // Get latest version
                selectedEntry = entries.sort((a, b) =>
                    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                )[0];
            }

            // Download package
            const packagePath = await this.downloadPackage(selectedEntry);

            // Unpack plugin
            const installDir = targetDir || path.join('./plugins', pluginId);
            const manifest = await this.packager.unpackPlugin(packagePath, installDir);

            // Install dependencies
            await this.packager.installDependencies(installDir);

            // Cleanup downloaded package
            fs.unlinkSync(packagePath);

            console.log(`Plugin installed successfully: ${pluginId} v${manifest.version}`);
            return manifest;

        } catch (error) {
            console.error(`Failed to install plugin ${pluginId}:`, error);
            throw error;
        }
    }

    /**
     * List available plugins in the repository
     */
    async listPlugins(category?: string, tags?: string[]): Promise<PluginRegistryEntry[]> {
        const registry = await this.getPluginRegistry();
        
        let filtered = registry;
        
        if (category) {
            filtered = filtered.filter(entry => entry.category === category);
        }
        
        if (tags && tags.length > 0) {
            filtered = filtered.filter(entry => 
                tags.some(tag => entry.tags.includes(tag))
            );
        }

        return filtered;
    }

    /**
     * Search plugins by name or description
     */
    async searchPlugins(query: string): Promise<PluginRegistryEntry[]> {
        const registry = await this.getPluginRegistry();
        const lowerQuery = query.toLowerCase();
        
        return registry.filter(entry => 
            entry.name.toLowerCase().includes(lowerQuery) ||
            entry.description.toLowerCase().includes(lowerQuery) ||
            entry.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Get plugin information
     */
    async getPluginInfo(pluginId: string, version?: string): Promise<PluginRegistryEntry | null> {
        const registry = await this.getPluginRegistry();
        const entries = registry.filter(entry => entry.id === pluginId);
        
        if (entries.length === 0) {
            return null;
        }

        if (version) {
            return entries.find(entry => entry.version === version) || null;
        }

        // Return latest version
        return entries.sort((a, b) => 
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )[0];
    }

    /**
     * Check for plugin updates
     */
    async checkForUpdates(installedPlugins: { id: string; version: string }[]): Promise<{
        id: string;
        currentVersion: string;
        latestVersion: string;
        updateAvailable: boolean;
    }[]> {
        const registry = await this.getPluginRegistry();
        const results = [];

        for (const installed of installedPlugins) {
            const entries = registry.filter(entry => entry.id === installed.id);
            if (entries.length === 0) continue;

            const latest = entries.sort((a, b) => 
                new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
            )[0];

            results.push({
                id: installed.id,
                currentVersion: installed.version,
                latestVersion: latest.version,
                updateAvailable: this.isNewerVersion(latest.version, installed.version)
            });
        }

        return results;
    }

    private async uploadPackageToGitHub(pluginPackage: PluginPackage): Promise<string> {
        const packageName = `${pluginPackage.name}-${pluginPackage.version}.s7pkg`;
        const packagePath = path.join('./packages', packageName);

        // Create a release
        const releaseResponse = await axios.post(
            `${this.baseUrl}/releases`,
            {
                tag_name: `${pluginPackage.name}-v${pluginPackage.version}`,
                name: `${pluginPackage.name} v${pluginPackage.version}`,
                body: pluginPackage.description,
                draft: false,
                prerelease: false
            },
            {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );

        const releaseId = releaseResponse.data.id;

        // Upload package as release asset
        const packageData = fs.readFileSync(packagePath);
        const uploadResponse = await axios.post(
            `https://uploads.github.com/repos/${this.config.owner}/${this.config.repo}/releases/${releaseId}/assets?name=${packageName}`,
            packageData,
            {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Content-Type': 'application/octet-stream'
                }
            }
        );

        return uploadResponse.data.browser_download_url;
    }

    private async updatePluginRegistry(entry: PluginRegistryEntry): Promise<void> {
        // Get current registry
        const registry = await this.getPluginRegistry();
        
        // Update or add entry
        const existingIndex = registry.findIndex(
            item => item.id === entry.id && item.version === entry.version
        );
        
        if (existingIndex >= 0) {
            registry[existingIndex] = entry;
        } else {
            registry.push(entry);
        }

        // Upload updated registry
        const registryContent = JSON.stringify(registry, null, 2);
        await this.uploadFileToGitHub('registry.json', registryContent);
    }

    private async getPluginRegistry(): Promise<PluginRegistryEntry[]> {
        try {
            const response = await axios.get(
                `${this.baseUrl}/contents/registry.json?ref=${this.config.branch}`,
                {
                    headers: {
                        'Authorization': `token ${this.config.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            const content = Buffer.from(response.data.content, 'base64').toString('utf8');
            return JSON.parse(content);
        } catch (error: any) {
            if (error.response?.status === 404) {
                // Registry doesn't exist yet, return empty array
                return [];
            }
            throw error;
        }
    }

    private async uploadFileToGitHub(filename: string, content: string): Promise<void> {
        const encodedContent = Buffer.from(content).toString('base64');
        
        // Check if file exists to get SHA
        let sha: string | undefined;
        try {
            const existingResponse = await axios.get(
                `${this.baseUrl}/contents/${filename}?ref=${this.config.branch}`,
                {
                    headers: {
                        'Authorization': `token ${this.config.token}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );
            sha = existingResponse.data.sha;
        } catch (error: any) {
            // File doesn't exist, that's fine
        }

        // Upload file
        await axios.put(
            `${this.baseUrl}/contents/${filename}`,
            {
                message: `Update ${filename}`,
                content: encodedContent,
                branch: this.config.branch,
                ...(sha && { sha })
            },
            {
                headers: {
                    'Authorization': `token ${this.config.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            }
        );
    }

    private async downloadPackage(entry: PluginRegistryEntry): Promise<string> {
        const packageName = `${entry.name}-${entry.version}.s7pkg`;
        const packagePath = path.join('./temp', packageName);

        const response = await axios.get(entry.downloadUrl, {
            responseType: 'stream'
        });

        const writer = fs.createWriteStream(packagePath);
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => resolve(packagePath));
            writer.on('error', reject);
        });
    }

    private isNewerVersion(version1: string, version2: string): boolean {
        // Simple version comparison - in production, use a proper semver library
        const v1Parts = version1.split('.').map(Number);
        const v2Parts = version2.split('.').map(Number);

        for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
            const v1Part = v1Parts[i] || 0;
            const v2Part = v2Parts[i] || 0;

            if (v1Part > v2Part) return true;
            if (v1Part < v2Part) return false;
        }

        return false;
    }
}
