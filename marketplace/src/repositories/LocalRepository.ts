import { PluginLocator, PluginManifest, PluginRepository, RepositoryConfig } from '@cktmcs/shared';
import fs from 'fs/promises';
import path from 'path';

export class LocalRepository implements PluginRepository {
    type: 'local' = 'local';
    private baseDir: string;
    // Manifest path cache: id -> manifestPath, verb -> manifestPath
    private manifestPathCache: Map<string, string> = new Map();
    // Plugin list cache to avoid repeated folder scans
    private pluginListCache: PluginLocator[] | null = null;
    private cacheTimestamp: number = 0;
    private readonly CACHE_TTL = 60000; // 1 minute cache TTL

    constructor(config: RepositoryConfig) {
        this.baseDir = config.options?.localPath || path.join(process.cwd(), '/plugins');
    }

    private invalidateCache(): void {
        this.pluginListCache = null;
        this.cacheTimestamp = 0;
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
                    console.log(`LocalRepository.fetch: Cache hit for id '${id}' at ${cachedPath}`);
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
        // Check cache first
        if (this.manifestPathCache.has(verb)) {
            const cachedPath = this.manifestPathCache.get(verb)!;
            try {
                const manifestContent = await fs.readFile(cachedPath, 'utf-8');
                const manifest = JSON.parse(manifestContent) as PluginManifest;
                if (manifest.verb === verb) {
                    console.log(`LocalRepository.fetchByVerb: Cache hit for verb '${verb}' at ${cachedPath}`);
                    return manifest;
                }
            } catch (e) {
                console.warn(`LocalRepository.fetchByVerb: Cache path for verb '${verb}' is invalid, will fall back.`, e);
                this.manifestPathCache.delete(verb);
                // Also invalidate the plugin list cache since there might be stale data
                this.invalidateCache();
            }
        }
        try {
            let manifestPath: string;
            const pluginDir = path.join(this.baseDir, verb);
            if (version) {
                manifestPath = path.join(pluginDir, version, 'manifest.json');
            } else {
                manifestPath = path.join(pluginDir, 'manifest.json');
            }
            try {
                const manifestContent = await fs.readFile(manifestPath, 'utf-8');
                const manifest = JSON.parse(manifestContent) as PluginManifest;
                if (manifest.verb !== verb) {
                    console.warn(`LocalRepository.fetchByVerb: Manifest verb '${manifest.verb}' does not match directory verb '${verb}'.`);
                }
                // Cache for future
                if (manifest.id) this.manifestPathCache.set(manifest.id, manifestPath);
                if (manifest.verb) this.manifestPathCache.set(manifest.verb, manifestPath);
                return manifest;
            } catch (e) {
                // Fallback for broader search if direct verb/version path fails
                if (!version) {
                    console.warn(`LocalRepository.fetchByVerb: Manifest not found at direct path for verb '${verb}'. Falling back to iterating directories.`);
                    const dirs = await fs.readdir(this.baseDir);
                    for (const dir of dirs) {
                        const currentPath = path.join(this.baseDir, dir, 'manifest.json');
                        try {
                            const manifestData = JSON.parse(await fs.readFile(currentPath, 'utf-8')) as PluginManifest;
                            if (manifestData.verb === verb) {
                                // Cache for future
                                if (manifestData.id) this.manifestPathCache.set(manifestData.id, currentPath);
                                if (manifestData.verb) this.manifestPathCache.set(manifestData.verb, currentPath);
                                return manifestData;
                            }
                        } catch { continue; }
                    }
                }
                return undefined;
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
            console.error(`LocalRepository.fetchByVerb: Error fetching plugin verb '${verb}'${version ? ` version '${version}'` : ''}:`, error);
            throw error;
        }
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
        console.log('LocalRepo: Loading from ', this.baseDir);
        try {
            const dirs = await fs.readdir(this.baseDir);
            console.log('LocalRepo: Loading from ', dirs)
            for (const dir of dirs) {
                try {
                    const manifestPath = path.join(this.baseDir, dir, 'manifest.json');
                    console.log('LocalRepo: Loading from ', manifestPath)
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

        // Load fresh list and cache it
        console.log('LocalRepo: Loading fresh plugin list');
        this.pluginListCache = await this.loadPluginList();
        this.cacheTimestamp = Date.now();
        return this.pluginListCache;
    }
}