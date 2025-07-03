import { PluginLocator, PluginManifest, PluginRepository, RepositoryConfig } from '@cktmcs/shared';
import fs from 'fs/promises';
import path from 'path';

export class LocalRepository implements PluginRepository {
    type: 'local' = 'local';
    private baseDir: string;

    constructor(config: RepositoryConfig) {
        this.baseDir = config.options?.localPath || path.join(process.cwd(), '/plugins');
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
            return JSON.parse(manifestContent) as PluginManifest;
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
        try {
            // Assuming plugins are primarily identified by a directory matching their verb,
            // and versions are subdirectories within that verb directory.
            // e.g., {baseDir}/{verb}/{version}/manifest.json or {baseDir}/{verb}/manifest.json
            let manifestPath: string;
            const pluginDir = path.join(this.baseDir, verb);

            if (version) {
                manifestPath = path.join(pluginDir, version, 'manifest.json');
            } else {
                manifestPath = path.join(pluginDir, 'manifest.json');
            }
            
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent) as PluginManifest;

            // Additional check if the manifest's verb actually matches, as directory name might not be canonical.
            if (manifest.verb !== verb) {
                console.warn(`LocalRepository.fetchByVerb: Manifest verb '${manifest.verb}' does not match directory verb '${verb}'.`);
                // Depending on strictness, could return undefined here. For now, returning the found manifest.
            }
            return manifest;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                // Fallback for broader search if direct verb/version path fails
                // This is simplistic and assumes any manifest with the verb is fine if no version specified.
                if (!version) {
                    console.warn(`LocalRepository.fetchByVerb: Manifest not found at direct path for verb '${verb}'. Falling back to iterating directories.`);
                    const dirs = await fs.readdir(this.baseDir);
                    for (const dir of dirs) {
                        const currentPath = path.join(this.baseDir, dir, 'manifest.json');
                        try {
                            const manifestData = JSON.parse(await fs.readFile(currentPath, 'utf-8')) as PluginManifest;
                            if (manifestData.verb === verb) {
                                return manifestData; // Returns the first one found
                            }
                        } catch { continue; }
                    }
                }
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
                    return;
                }
            } catch {
                continue;
            }
        }
    }

    async list(): Promise<PluginLocator[]> {
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
                    const manifest = JSON.parse(manifestContent);
                    locators.push({
                        id: manifest.id,
                        verb: manifest.verb,
                        description: manifest.description,
                        repository: {
                            type: this.type,
                            dependencies: manifest.repository.dependencies
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
}