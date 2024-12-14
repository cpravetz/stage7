import { PluginManifest, PluginRepository, RepositoryConfig } from '@cktmcs/shared';
import simpleGit, { SimpleGit } from 'simple-git';
import fs from 'fs/promises';
import path from 'path';


/* The gitRepository stores plugins as folders within the project repository. */

export class GitRepository implements PluginRepository {
    type: 'git' = 'git';
    config: RepositoryConfig;
    authenticatedUrl: string;
    githubToken: string = process.env.GITHUB_TOKEN || '';
    githubUsername: string = process.env.GITHUB_USERNAME || '';
    private baseDir: string;

    constructor(config: RepositoryConfig) {
        this.config = config;
        this.config.url = this.config.url || 'https://github.com/your-repo.git';
        this.authenticatedUrl = this.config.url.replace(
            'https://github.com',
            `https://${this.githubUsername}:${this.githubToken}@github.com`
        );
        this.baseDir = path.join(process.cwd(), 'git-plugins');
    }
    
    async publish(manifest: PluginManifest): Promise<void> {
        if (!this.githubToken || !this.githubUsername) {
            console.log('GitHub credentials not found in environment variables');
            return;
        }
    
        const git: SimpleGit = simpleGit();
        const tempDir = path.join(process.cwd(), 'temp', `plugin-${manifest.id}`);
        
        try {
            // Create temp directory
            await fs.mkdir(tempDir, { recursive: true });
            
            // Initialize git repo
            await git.cwd(tempDir);
            await git.init();
            await git.addRemote('origin', this.authenticatedUrl);
            
            // Create plugin files
            const manifestPath = path.join(tempDir, 'plugin-manifest.json');
            await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
            
            // If plugin has entry point files, write them
            if (manifest.entryPoint?.files) {
                for (const [filename, content] of Object.entries(manifest.entryPoint.files)) {
                    const filePath = path.join(tempDir, filename);
                    await fs.mkdir(path.dirname(filePath), { recursive: true });
                    await fs.writeFile(filePath, content);
                }
            }
            
            // Commit and push
            await git.add('./*');
            await git.commit(`Publishing plugin ${manifest.id} - ${manifest.verb}`);
            await git.push('origin', this.config.options?.defaultBranch || 'master', ['--force']);
            
            console.log(`Successfully pushed plugin ${manifest.id} to Git repository: ${this.authenticatedUrl}`);
        } catch (error) {
            throw new Error(`Failed to push to Git repository: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            // Cleanup: Remove temp directory
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.warn('Failed to cleanup temporary directory:', cleanupError);
            }
        }
    }
    
    async fetch(id: string): Promise<PluginManifest | undefined> {
        if (!id) {
            console.log('ID must be provided');
            return undefined;
        }

        const git: SimpleGit = simpleGit();
        const tempDir = path.join(process.cwd(), 'temp', `fetch-${id}`);

        try {
            // Clone repository
            await fs.mkdir(tempDir, { recursive: true });
            await git.clone(this.authenticatedUrl, tempDir);
            await git.cwd(tempDir);

            // Search for plugin manifest
            const files = await fs.readdir(tempDir, { recursive: true });
            let manifestPath: string | undefined;

            for (const file of files) {
                if (typeof file === 'string' && file.endsWith('plugin-manifest.json')) {
                    const fullPath = path.join(tempDir, file);
                    const content = await fs.readFile(fullPath, 'utf-8');
                    const manifest = JSON.parse(content);
                    if (manifest.id === id) {
                        manifestPath = fullPath;
                        break;
                    }
                }
            }

            if (!manifestPath) {
                return undefined;
            }

            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            return JSON.parse(manifestContent);
        } catch (error) {
            console.error(`Failed to fetch plugin from Git repository: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        } finally {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.warn('Failed to cleanup temporary directory:', cleanupError);
            }
        }
    }

    async fetchByVerb(verb: string): Promise<PluginManifest | undefined> {
        if (!verb) {
            console.log('Verb must be provided');
            return undefined;
        }

        const git: SimpleGit = simpleGit();
        const tempDir = path.join(process.cwd(), 'temp', `fetch-${verb}`);

        try {
            // Clone repository
            await fs.mkdir(tempDir, { recursive: true });
            await git.clone(this.authenticatedUrl, tempDir);
            await git.cwd(tempDir);

            // Search for plugin manifest
            const files = await fs.readdir(tempDir, { recursive: true });
            let manifestPath: string | undefined;

            for (const file of files) {
                if (typeof file === 'string' && file.endsWith('plugin-manifest.json')) {
                    const fullPath = path.join(tempDir, file);
                    const content = await fs.readFile(fullPath, 'utf-8');
                    const manifest = JSON.parse(content);
                    if (manifest.verb === verb) {
                        manifestPath = fullPath;
                        break;
                    }
                }
            }

            if (!manifestPath) {
                return undefined;
            }

            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            return JSON.parse(manifestContent);
        } catch (error) {
            console.error(`Failed to fetch plugin from Git repository: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        } finally {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.warn('Failed to cleanup temporary directory:', cleanupError);
            }
        }
    }
 
    async delete(id: string): Promise<void> {
        if (!id) {
            console.log('ID must be provided');
            return;
        }

        const git: SimpleGit = simpleGit();
        const tempDir = path.join(process.cwd(), 'temp', `delete-${id}`);

        try {
            // Clone repository
            await fs.mkdir(tempDir, { recursive: true });
            await git.clone(this.authenticatedUrl, tempDir);
            await git.cwd(tempDir);

            // Find and remove plugin directory
            const files = await fs.readdir(tempDir, { recursive: true });
            let pluginDir: string | undefined;

            for (const file of files) {
                if (typeof file === 'string' && file.endsWith('plugin-manifest.json')) {
                    const fullPath = path.join(tempDir, file);
                    const content = await fs.readFile(fullPath, 'utf-8');
                    const manifest = JSON.parse(content);
                    if (manifest.id === id) {
                        pluginDir = path.dirname(fullPath);
                        break;
                    }
                }
            }

            if (!pluginDir) {
                console.log(`Plugin with ID ${id} not found`);
                return;
            }

            // Remove plugin directory
            await fs.rm(pluginDir, { recursive: true });

            // Commit and push changes
            await git.add('./*');
            await git.commit(`Deleted plugin ${id}`);
            await git.push('origin', this.config.options?.defaultBranch || 'master');
        } catch (error) {
            throw new Error(`Failed to delete plugin from Git repository: ${error instanceof Error ? error.message : String(error)}`);
        } finally {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.warn('Failed to cleanup temporary directory:', cleanupError);
            }
        }
    }

    async list(): Promise<PluginManifest[]> {
        const git: SimpleGit = simpleGit();
        const tempDir = path.join(process.cwd(), 'temp', 'list-plugins');
        const plugins: PluginManifest[] = [];

        try {
            // Clone repository
            await fs.mkdir(tempDir, { recursive: true });
            await git.clone(this.authenticatedUrl, tempDir);
            await git.cwd(tempDir);

            // Find all plugin manifests
            const files = await fs.readdir(tempDir, { recursive: true });

            for (const file of files) {
                if (typeof file === 'string' && file.endsWith('plugin-manifest.json')) {
                    try {
                        const fullPath = path.join(tempDir, file);
                        const content = await fs.readFile(fullPath, 'utf-8');
                        const manifest = JSON.parse(content);
                        plugins.push(manifest);
                    } catch (error) {
                        console.warn(`Failed to parse manifest file ${file}:`, error);
                        continue;
                    }
                }
            }

            return plugins;
        } catch (error) {
            console.error(`Failed to list plugins from Git repository: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        } finally {
            try {
                await fs.rm(tempDir, { recursive: true, force: true });
            } catch (cleanupError) {
                console.warn('Failed to cleanup temporary directory:', cleanupError);
            }
        }
    }
}