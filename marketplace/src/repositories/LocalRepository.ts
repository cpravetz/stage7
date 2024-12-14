import { PluginManifest, PluginRepository, RepositoryConfig } from '@cktmcs/shared';
import fs from 'fs/promises';
import path from 'path';

export class LocalRepository implements PluginRepository {
    type: 'local' = 'local';
    private baseDir: string;

    constructor(config: RepositoryConfig) {
        this.baseDir = config.options?.localPath || path.join(process.cwd(), 'local-plugins');
    }

    async publish(manifest: PluginManifest): Promise<void> {
        const pluginDir = path.join(this.baseDir, manifest.verb);
        
        try {
            // Create plugin directory
            await fs.mkdir(pluginDir, { recursive: true });

            // Write manifest
            await fs.writeFile(
                path.join(pluginDir, 'manifest.json'),
                JSON.stringify(manifest, null, 2)
            );

            // Write plugin files
            if (manifest.entryPoint?.files) {
                for (const [filename, content] of Object.entries(manifest.entryPoint.files)) {
                    const filePath = path.join(pluginDir, filename);
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    await fs.writeFile(filePath, content);
                }
            }
        } catch (error) {
            throw new Error(`Failed to publish plugin to local repository: ${error instanceof Error ? error.message : String(error)}`);
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

    async list(): Promise<PluginManifest[]> {
        const plugins: PluginManifest[] = [];
        
        try {
            const dirs = await fs.readdir(this.baseDir);
            
            for (const dir of dirs) {
                try {
                    const manifestPath = path.join(this.baseDir, dir, 'manifest.json');
                    const manifestContent = await fs.readFile(manifestPath, 'utf-8');
                    plugins.push(JSON.parse(manifestContent));
                } catch {
                    continue;
                }
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                throw error;
            }
        }

        return plugins;
    }
}