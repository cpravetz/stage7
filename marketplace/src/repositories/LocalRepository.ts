import { PluginLocator, PluginManifest, PluginRepository, RepositoryConfig } from '@cktmcs/shared';
import fs from 'fs/promises';
import path from 'path';

export class LocalRepository implements PluginRepository {
    type: 'local' = 'local';
    private loadingCache: boolean = false; // Flag to prevent multiple concurrent cache loads
    private baseDir: string;
    // Manifest path cache: id -> manifestPath, verb -> manifestPath
    private manifestPathCache: Map<string, string> = new Map();
    // Plugin list cache to avoid repeated folder scans
    private pluginListCache: PluginLocator[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 60000; // 1 minute cache TTL
    private loadingPromise: Promise<PluginLocator[]> | null = null;

    constructor(config: RepositoryConfig) {
        this.baseDir = config.options?.localPath || path.join(process.cwd(), '/plugins');
    }

    private invalidateCache(): void {
        this.pluginListCache = null;
        this.cacheTimestamp = 0;
        this.loadingPromise = null; // Also clear the promise on cache invalidation
    }

    async store(manifest: PluginManifest): Promise<void> {
        const pluginDir = path.join(this.baseDir, manifest.verb);
        try {
            // Create plugin directory
            await fs.mkdir(pluginDir, { recursive: true });
            // Write manifest as stringified JSON
            await fs.writeFile(
                path.join(pluginDir, 'manifest.json'),
                JSON.stringify(manifest, null, 2)
            );
            // Write plugin files if they exist
            if (manifest.entryPoint?.files) {
                for (const [filename, content] of Object.entries(manifest.entryPoint.files)) {
                    const filePath = path.join(pluginDir, filename);
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    // Ensure content is string before writing
                    const fileContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
                    await fs.writeFile(filePath, fileContent);
                }
            }
            // Update cache after storing
            const manifestPath = path.join(pluginDir, 'manifest.json');
            if (manifest.id) this.manifestPathCache.set(manifest.id, manifestPath);
            if (manifest.verb) this.manifestPathCache.set(manifest.verb, manifestPath);
            // Invalidate plugin list cache since we added a new plugin
            this.invalidateCache();
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to publish plugin to local repository: ${errorMessage}`);
        }
    }

    async fetch(id: string, version?: string): Promise<PluginManifest | undefined> {
        if (!id) {
            console.log('LocalRepository.fetch: ID must be provided.');
            return undefined;
        }
        // Check cache first
        if (this.manifestPathCache.has(id)) {
            const cachedPath = this.manifestPathCache.get(id)!;
            try {
                const manifestContent = await fs.readFile(cachedPath, 'utf-8');
                const manifest = JSON.parse(manifestContent) as PluginManifest;
                // Defensive: check id matches
                if (manifest.id === id) {
                    return manifest;
                }
            } catch (e) {
                console.warn(`LocalRepository.fetch: Cache path for id '${id}' is invalid, will fall back.`, e);
                this.manifestPathCache.delete(id);
            }
        }
        try {
            let manifestPath: string;
            if (version) {
                // Path assuming ID is the directory name, and version is a subdirectory
                manifestPath = path.join(this.baseDir, id, version, 'manifest.json');
            } else {
                // Path assuming ID is the directory name, manifest directly under it (for latest/default)
                // This part might need more sophisticated logic if multiple non-versioned plugins share an ID-based dir
                // or if the verb-based storage is still primary for non-versioned.
                // For now, let's assume plugins are stored in {baseDir}/{id}/{manifest.json} or {baseDir}/{id}/{version}/manifest.json
                manifestPath = path.join(this.baseDir, id, 'manifest.json');
                // Fallback: Try to find by iterating if direct path fails (legacy or verb-based storage)
                try {
                    await fs.access(manifestPath);
                } catch (e) {
                    console.warn(`LocalRepository.fetch: Manifest not found at direct path ${manifestPath}. Falling back to iterating directories for ID '${id}'.`);
                    const dirs = await fs.readdir(this.baseDir);
                    let foundPath: string | undefined;
                    for (const dir of dirs) {
                        const currentPath = path.join(this.baseDir, dir, 'manifest.json');
                        try {
                            const manifestData = JSON.parse(await fs.readFile(currentPath, 'utf-8'));
                            if (manifestData.id === id) {
                                // This logic might fetch a manifest that doesn't match a 'version' if one was specified
                                // and the versioned path didn't exist. This is a simplification.
                                foundPath = currentPath;
                                break;
                            }
                        } catch { continue; }
                    }
                    if (!foundPath) return undefined;
                    manifestPath = foundPath;
                }
            }
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent) as PluginManifest;
            // Cache for future
            if (manifest.id) this.manifestPathCache.set(manifest.id, manifestPath);
            if (manifest.verb) this.manifestPathCache.set(manifest.verb, manifestPath);
            return manifest;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
            console.error(`LocalRepository.fetch: Error fetching plugin ID '${id}'${version ? ` version '${version}'` : ''}:`, error);
            throw error;
        }
    }

    async fetchByVerb(verb: string, version?: string): Promise<PluginManifest | undefined> {
        if (!verb) {
            console.log('LocalRepository.fetchByVerb: Verb must be provided.');
            return undefined;
        }

        // 1. Check manifestPathCache directly for the verb
        if (this.manifestPathCache.has(verb)) {
            const cachedPath = this.manifestPathCache.get(verb)!;
            try {
                const manifestContent = await fs.readFile(cachedPath, 'utf-8');
                const manifest = JSON.parse(manifestContent) as PluginManifest;
                if (manifest.verb === verb && (!version || manifest.version === version)) {
                    console.log(`LocalRepository.fetchByVerb: Cache hit for verb '${verb}' at ${cachedPath}`);
                    return manifest;
                }
            } catch (e) {
                console.warn(`LocalRepository.fetchByVerb: Cache path for verb '${verb}' is invalid or manifest read failed, will re-index.`, e);
                this.manifestPathCache.delete(verb);
                // Invalidate plugin list cache to force a re-scan and re-population of manifestPathCache
                this.invalidateCache();
            }
        }

        // 2. If not in manifestPathCache or cache entry was invalid, ensure pluginListCache is loaded
        //    and then try to find the plugin there. This will also re-populate manifestPathCache.
        try {
            const pluginList = await this.list(); // This will load/refresh cache if needed
            const targetPlugin = pluginList.find(plugin => plugin.verb === verb && (!version || plugin.version === version));

            if (targetPlugin) {
                // If found in the list, fetch the full manifest using its ID
                // This will use the manifestPathCache if already populated by list()
                return await this.fetch(targetPlugin.id, version);
            }
        } catch (listError) {
            console.error(`LocalRepository.fetchByVerb: Error while trying to use plugin list cache for verb '${verb}':`, listError);
            // Fall through to direct file system scan as a last resort if list() itself failed
        }

        // 3. Fallback: Direct file system scan (should be rare after above changes)
        //    This part is largely redundant if list() correctly populates manifestPathCache
        //    and fetch() uses it. But keeping it as a final safeguard.
        try {
            const dirs = await fs.readdir(this.baseDir);
            for (const dir of dirs) {
                const manifestPath = path.join(this.baseDir, dir, 'manifest.json');
                try {
                    const manifestData = JSON.parse(await fs.readFile(manifestPath, 'utf-8')) as PluginManifest;
                    if (manifestData.verb === verb && (!version || manifestData.version === version)) {
                        // Cache for future
                        if (manifestData.id) this.manifestPathCache.set(manifestData.id, manifestPath);
                        if (manifestData.verb) this.manifestPathCache.set(manifestData.verb, manifestPath);
                        return manifestData;
                    }
                } catch { continue; }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                console.error(`LocalRepository.fetchByVerb: Error during final file system scan for verb '${verb}':`, error);
            }
        }

        return undefined;
    }

    async delete(id: string): Promise<void> {
        const dirs = await fs.readdir(this.baseDir);
        for (const dir of dirs) {
            const manifestPath = path.join(this.baseDir, dir, 'manifest.json');
            try {
                const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
                if (manifest.id === id) {
                    await fs.rm(path.join(this.baseDir, dir), { recursive: true, force: true });
                    // Remove from cache
                    this.manifestPathCache.delete(id);
                    if (manifest.verb) this.manifestPathCache.delete(manifest.verb);
                    // Invalidate plugin list cache since we removed a plugin
                    this.invalidateCache();
                    return;
                }
            } catch {
                continue;
            }
        }
    }

    private isCacheValid(): boolean {
        return this.pluginListCache !== null &&
               (Date.now() - this.cacheTimestamp) < this.CACHE_TTL;
    }

    private async loadPluginList(): Promise<PluginLocator[]> {
        const locators: PluginLocator[] = [];
        try {
            const dirs = await fs.readdir(this.baseDir);
            for (const dir of dirs) {
                try {
                    const manifestPath = path.join(this.baseDir, dir, 'manifest.json');
                    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
                    let manifest: any;
                    try {
                        manifest = JSON.parse(manifestContent);
                    } catch (e) {
                        console.log('Error loading from ', dir, 'Malformed manifest:', e);
                        continue;
                    }
                    // Defensive: check required fields
                    if (!manifest.id || !manifest.verb || !manifest.description ) {
                        console.log('Error loading from ', dir, 'Manifest missing required fields');
                        continue;
                    }
                    // Cache manifest path for both id and verb
                    this.manifestPathCache.set(manifest.id, manifestPath);
                    this.manifestPathCache.set(manifest.verb, manifestPath);
                    locators.push({
                        id: manifest.id,
                        verb: manifest.verb,
                        description: manifest.description,
                        repository: {
                            type: this.type,
                        }
                    });
                } catch (error) {
                   console.log('Error loading from ', dir, error instanceof Error ? error.message : error);
                    continue;
                }
            }
        } catch (error) {
            console.log('LocalRepo: Error loading from ', error);
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }
        console.log('LocalRepo: Locators count',locators.length);
        return locators;
    }

    async list(): Promise<PluginLocator[]> {
        // Return cached list if valid
        if (this.isCacheValid()) {
            console.log('LocalRepo: Using cached plugin list');
            return this.pluginListCache!;
        }

        // If a loading operation is already in progress, wait for it
        if (this.loadingPromise) {
            console.log('LocalRepo: Waiting for ongoing plugin list load...');
            return this.loadingPromise;
        }

        this.loadingCache = true;
        // Load fresh list and cache it
        console.log('LocalRepo: Loading fresh plugin list');
        
        // Start loading and store the promise
        this.loadingPromise = this.loadPluginList();
        this.pluginListCache = await this.loadingPromise; // Wait for it to complete and assign to cache
        
        this.cacheTimestamp = Date.now();
        this.loadingCache = false;
        this.loadingPromise = null; // Clear the promise once loading is complete

        return this.pluginListCache;
    }
}