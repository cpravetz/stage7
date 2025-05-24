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

    async fetch(id: string): Promise<PluginManifest | undefined> {
        try {
            let manifestPath: string | undefined;
            if (id) {
                // Search through all plugin directories for matching ID
                const dirs = await fs.readdir(this.baseDir);
                for (const dir of dirs) {
                    const currentPath = path.join(this.baseDir, dir, 'manifest.json');
                    try {
                        const manifest = JSON.parse(await fs.readFile(currentPath, 'utf-8'));
                        if (manifest.id === id) {
                            manifestPath = currentPath;
                            break;
                        }
                    } catch {
                        continue;
                    }
                }
                if (!manifestPath) {
                    return undefined;
                }
            } else {
                console.log('Id must be provided');
                return undefined;
            }

            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            return JSON.parse(manifestContent);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
            throw error;
        }
    }

    async fetchByVerb(verb: string): Promise<PluginManifest | undefined> {
        try {
            const pluginDir = path.join(this.baseDir, verb);
            const manifestPath = path.join(pluginDir, 'manifest.json');
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            return JSON.parse(manifestContent);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return undefined;
            }
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