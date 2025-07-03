import { PluginDefinition, PluginManifest, PluginRepositoryType, PluginLocator, compareVersions } from '@cktmcs/shared'; // Added compareVersions
// import express from 'express'; // Removed unused import
import path from 'path';
import os from 'os';
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
// import { fileURLToPath } from 'url'; // Removed unused import
// import { dirname } from 'path'; // Removed unused import
import { PluginMarketplace } from '@cktmcs/marketplace';

const execAsync = promisify(exec);

// Assuming __dirname is services/capabilitiesmanager/src/utils/
// For inline plugins typically in services/capabilitiesmanager/src/plugins/
// const INLINE_PLUGIN_BASE_DIR_FROM_UTILS = path.resolve(__dirname, '..', 'plugins'); // Removed unused constant


export class PluginRegistry {
    private cache: Map<string, PluginRepositoryType>;
    private verbIndex: Map<string, string>;  // verb -> id mapping
    private pluginMarketplace: PluginMarketplace;
    public currentDir: string; // Base directory for inline plugins, e.g., services/capabilitiesmanager/src

    /**
     * Get the plugin marketplace instance
     * @returns PluginMarketplace instance
     */
    public getPluginMarketplace(): PluginMarketplace {
        return this.pluginMarketplace;
    }

    /**
     * Update the plugin marketplace instance
     * This is used when configuration changes and we need to reinitialize repositories
     * @param marketplace New PluginMarketplace instance
     */
    public updatePluginMarketplace(marketplace: PluginMarketplace): void {
        this.pluginMarketplace = marketplace;
        console.log('Plugin marketplace updated with new configuration');
        
        // Refresh the cache with the new marketplace
        this.refreshCache().catch(error => {
            console.error('Failed to refresh plugin cache after marketplace update:', error);
        });
    }

    constructor() {
        this.cache = new Map();
        this.verbIndex = new Map();
        this.pluginMarketplace = new PluginMarketplace();
        // Set currentDir to be 'services/capabilitiesmanager/src'
        // so inline plugins are resolved from 'services/capabilitiesmanager/src/plugins/{verb}'
        this.currentDir = path.resolve(__dirname, '..');
        this.initialize();
    }

    private async _prepareGitPlugin(manifest: PluginManifest, targetDir: string): Promise<void> {
        if (!manifest.packageSource || manifest.packageSource.type !== 'git' || !manifest.packageSource.url) {
            throw new Error('Invalid manifest: packageSource must be of type git and include a URL.');
        }
        const { url, branch, commitHash } = manifest.packageSource;
        const branchToClone = branch || 'main'; // Default to 'main' if no branch specified

        try {
            console.log(`Cloning plugin ${manifest.id} from ${url} (branch: ${branchToClone}) into ${targetDir}`);
            await execAsync(`git clone --depth 1 --branch ${branchToClone} ${url} ${targetDir}`);

            if (commitHash) {
                console.log(`Checking out commit ${commitHash} for plugin ${manifest.id} in ${targetDir}`);
                await execAsync(`git -C ${targetDir} checkout ${commitHash}`);
            }
            console.log(`Plugin ${manifest.id} prepared successfully in ${targetDir}`);
        } catch (error) {
            console.error(`Error preparing git plugin ${manifest.id} from ${url}:`, error);
            // Attempt to clean up partially cloned directory
            try {
                await fs.rm(targetDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.error(`Error cleaning up failed git clone for ${manifest.id} at ${targetDir}:`, cleanupError);
            }
            throw new Error(`Failed to prepare git plugin: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public async preparePluginForExecution(manifest: PluginManifest): Promise<{ pluginRootPath: string; effectiveManifest: PluginManifest }> {
        if (manifest.packageSource && manifest.packageSource.type === 'git') {
            const cacheDirBase = path.join(os.homedir(), '.cktmcs', 'plugin_cache', manifest.id);
            // Use commitHash for definitive versioning, fallback to branch, then 'latest_main'
            const versionSpecificComponent = manifest.packageSource.commitHash || manifest.packageSource.branch || 'latest_main';
            // Sanitize versionSpecificComponent to be directory-friendly (e.g., replace slashes in branch names)
            const sanitizedVersionComponent = versionSpecificComponent.replace(/[/\\]/g, '_');
            const cacheDir = path.join(cacheDirBase, sanitizedVersionComponent);

            console.log(`Preparing git plugin ${manifest.id}. Target cache directory: ${cacheDir}`);

            const dirExists = await fs.stat(cacheDir).then(() => true).catch(() => false);

            if (!dirExists) {
                console.log(`Cache directory ${cacheDir} not found. Creating and cloning...`);
                await fs.mkdir(cacheDir, { recursive: true });
                await this._prepareGitPlugin(manifest, cacheDir);
            } else {
                console.log(`Cache directory ${cacheDir} found. Using existing clone.`);
                // Optional: Add logic here to update the repo if it's not pinned to a commitHash (e.g., git pull)
                // For now, if dir exists and it's not a commitHash based one, we assume it's up-to-date or managed externally.
                if (!manifest.packageSource.commitHash && manifest.packageSource.branch) {
                    // Potentially pull latest changes for a branch if not commit-pinned
                    // console.log(`Plugin ${manifest.id} is branch-based. Consider adding 'git pull' logic here for ${cacheDir}.`);
                }
            }

            const pluginRootPath = path.join(cacheDir, manifest.packageSource.subPath || '');
            console.log(`Plugin root path for ${manifest.id}: ${pluginRootPath}`);
            return { pluginRootPath, effectiveManifest: manifest };
        } else {
            // Handle 'inline' plugins or plugins without packageSource (legacy)
            // Inline plugins are expected to be in `services/capabilitiesmanager/src/plugins/{verb}`
            const pluginRootPath = path.join(this.currentDir, 'plugins', manifest.verb);
            console.log(`Using inline plugin path for ${manifest.id} (${manifest.verb}): ${pluginRootPath}`);
            return { pluginRootPath, effectiveManifest: manifest };
        }
    }

    public async initialize(): Promise<void> {
        // Initialize existing plugins by refreshing the cache
        try {
            await this.refreshCache();
            console.log("PluginRegistry initialized and cache populated.");
        } catch (error) {
            console.error("PluginRegistry.initialize: Failed to refresh plugin cache during initialization", error);
            // Decide if we should throw or continue with an empty/partially initialized registry
            // For now, log the error and continue; the registry might be partially functional or recover.
        }
    }

    async fetchOne(id: string, version?: string, repository?: PluginRepositoryType): Promise<PluginManifest | undefined> { // Added version parameter
        try {
            const plugin = await this.pluginMarketplace.fetchOne(id, version, repository);
            if (plugin && !this.cache.has(plugin.id)) {
                // Removed all updateCache calls
            }
            return plugin;
        } catch (err) {
            console.warn(`pluginRegistry: fetchOne failed for id=${id}, repository=${repository}:`, err);
            return undefined;
        }
    }

    async fetchOneByVerb(verb: string, version?: string): Promise<PluginManifest | undefined> { // Added version parameter
        try {
            if (this.verbIndex.has(verb)) {
                const id = this.verbIndex.get(verb);
                if (!id) {
                    return undefined;
                }
                const repository = this.cache.get(id);
                return this.pluginMarketplace.fetchOne(id, version, repository as PluginRepositoryType);
            }
            const plugin = await this.pluginMarketplace.fetchOneByVerb(verb);
            if (plugin && !this.cache.has(plugin.id)) {
                // Removed all updateCache calls
            }
            return plugin;
        } catch (err) {
            console.warn(`pluginRegistry: fetchOneByVerb failed for verb=${verb}:`, err);
            return undefined;
        }
    }

    /**
     * Fetches all available versions of a plugin by its ID.
     * Assumes the PluginMarketplace will have a method like `fetchAllVersionsOfPlugin`.
     */
    async fetchAllVersionsOfPlugin(pluginId: string, repositoryType?: PluginRepositoryType): Promise<PluginManifest[] | undefined> {
        console.log(`PluginRegistry: Fetching all versions for plugin ID ${pluginId} from repository ${repositoryType || 'default'}`);
        try {
            const versions = await this.pluginMarketplace.fetchAllVersionsOfPlugin(pluginId, repositoryType as PluginRepositoryType);
            if (versions && versions.length > 0) {
                versions.sort((a: PluginManifest, b: PluginManifest) => compareVersions(b.version, a.version));
                return versions;
            }
            return undefined;
        } catch (error) {
            console.warn(`PluginRegistry: Error fetching all versions for plugin ID ${pluginId}:`, error);
            return undefined;
        }
    }

    /**
     * Fetches all available versions of a plugin by its verb.
     * This first resolves the verb to a plugin ID.
     */
    async fetchAllVersionsByVerb(verb: string, repositoryType?: PluginRepositoryType): Promise<PluginManifest[] | undefined> {
        console.log(`PluginRegistry: Fetching all versions for verb ${verb} from repository ${repositoryType || 'default'}`);
        try {
            const anyVersionPlugin = await this.fetchOneByVerb(verb);
            if (!anyVersionPlugin) {
                console.warn(`PluginRegistry: No plugin found for verb ${verb} to determine plugin ID.`);
                return undefined;
            }
            const pluginId = anyVersionPlugin.id;
            return this.fetchAllVersionsOfPlugin(pluginId, repositoryType);
        } catch (err) {
            console.warn(`PluginRegistry: fetchAllVersionsByVerb failed for verb=${verb}:`, err);
            return undefined;
        }
    }

    async findOne(id: string, version?: string): Promise<PluginManifest | undefined> { // Added version
        try {
            if (this.cache.has(id)) {
                const repository = this.cache.get(id);
                return this.pluginMarketplace.fetchOne(id, version, repository as PluginRepositoryType);
            }
            const plugin = await this.pluginMarketplace.fetchOne(id, version);
            if (plugin && !this.cache.has(plugin.id)) {
                // Removed all updateCache calls
            }
            return plugin;
        } catch (err) {
            console.warn(`pluginRegistry: findOne failed for id=${id}:`, err);
            return undefined;
        }
    }

    public async store(plugin: PluginManifest): Promise<void> {
        try {
            await this.pluginMarketplace.store(plugin);
        } catch (err) {
            console.warn(`pluginRegistry: store failed for plugin id=${plugin.id}:`, err);
        }
    }

    /**
     * Delete a plugin by ID (and optionally version) from a specific repository
     */
    public async delete(pluginId: string, version?: string, repository?: PluginRepositoryType): Promise<void> {
        try {
            if (typeof (this.pluginMarketplace as any).delete === 'function') {
                await (this.pluginMarketplace as any).delete(pluginId, version, repository);
            }
        } catch (err) {
            console.warn(`pluginRegistry: delete failed for plugin id=${pluginId}:`, err);
        }
    }

    private getLocatorFromManifest(manifest: PluginManifest): PluginLocator {
        return {
            id: manifest.id,
            verb: manifest.verb,
            repository: {
                type: manifest.repository.type,
                url: manifest.repository.url,
                dependencies: manifest.repository.dependencies
            }
        };
    }

    /**
     * Refresh the plugin cache from all repositories
     */
    private async refreshCache(): Promise<void> {
        try {
            console.log('Refreshing plugin cache...');
            this.cache.clear();
            this.verbIndex.clear();
            
            const repositories = this.pluginMarketplace.getRepositories();
            
            for (const [repoType, repository] of repositories.entries()) {
                try {
                    console.log(`Loading plugins from ${repoType} repository...`);
                    const plugins = await repository.list(); // Lists PluginLocators

                    for (const locator of plugins) {
                        try {
                            // Fetch the default/latest manifest for caching basic info
                            // More sophisticated caching might cache all versions or have a separate version index
                            const manifest = await repository.fetch(locator.id); // Fetches a single manifest
                            if (manifest) {
                                // This basic cache does not store version specific manifests,
                                // it just maps ID to repo and verb to ID for initial discovery.
                                // Version resolution happens in fetchAllVersions or when fetchOne is called with a version.
                                this.cache.set(manifest.id, repoType as PluginRepositoryType);
                                this.verbIndex.set(manifest.verb, manifest.id);
                            }
                        } catch (pluginError) {
                            console.error(`Failed to fetch manifest for plugin ${locator.id} from ${repoType} repository during cache refresh:`, pluginError);
                        }
                    }

                    console.log(`Loaded ${plugins.length} plugins from ${repoType} repository`);
                } catch (repoError) {
                    console.error(`Failed to list plugins from ${repoType} repository:`, repoError);
                }
            }
            
            console.log(`Plugin cache refreshed. Total plugins: ${this.cache.size}`);
        } catch (error) {
            console.error('Failed to refresh plugin cache:', error);
            throw error;
        }
    }

    public async getAvailablePluginsStr(): Promise<string> {
        // Use the pluginMarketplace instance to get the formatted/cached string
        // @ts-ignore: getAvailablePluginsStr may not be in the type definition if not yet published
        if (typeof (this.pluginMarketplace as any).getAvailablePluginsStr === 'function') {
            return await (this.pluginMarketplace as any).getAvailablePluginsStr();
        }
        // Fallback: list verbs only if method is missing
        const locators = await this.pluginMarketplace.list();
        const lines: string[] = [];
        for (const locator of locators) {
            lines.push(`- ${locator.verb}`);
        }
        return lines.join('\n');
    }

    /**
     * Returns a list of active/configured repository types (for frontend repo picker)
     */
    public getActiveRepositories(): { type: string; label: string }[] {
        // Use the pluginMarketplace instance to get the configured repositories
        const repoMap = this.pluginMarketplace.getRepositories();
        // Map to label for UI
        const labelMap: Record<string, string> = {
            local: 'Local',
            mongo: 'MongoDB',
            github: 'GitHub',
            git: 'Git',
            openapi: 'OpenAPI Tools',
            mcp: 'MCP Tools',
            'librarian-definition': 'Librarian',
        };
        return Array.from(repoMap.keys()).map(type => ({
            type,
            label: labelMap[type] || type
        }));
    }

    public async list(repositoryType?: PluginRepositoryType): Promise<PluginLocator[]> {
        try {
            console.log(`Listing plugins from repository type: ${repositoryType || 'all'}`);
            const all = await this.pluginMarketplace.list(repositoryType);
            console.log(`Found ${all.length} plugins in total from repository type: ${repositoryType || 'all'}`);
            if (!repositoryType) return all;
            // Filter by repository type if requested
            const result = all.filter(p => p.repository && p.repository.type === repositoryType);
            console.log(`Found ${result.length} plugins in repository type: ${repositoryType}`);
            return result;
        } catch (err) {
            console.warn('pluginRegistry: list failed:', err);
            return [];
        }
    }
}
