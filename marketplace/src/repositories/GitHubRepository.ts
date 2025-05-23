import { PluginManifest, PluginRepository, RepositoryConfig, PluginLocator } from '@cktmcs/shared';
import axios from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';
import fs from 'fs/promises';
import path from 'path';

/**
 * GitHub Repository implementation for plugin storage and retrieval
 * Uses GitHub API directly instead of git commands
 */
export class GitHubRepository implements PluginRepository {
    type: 'github' = 'github';
    private token: string;
    private username: string;
    private repoOwner: string;
    private repoName: string;
    private defaultBranch: string;
    private baseApiUrl: string;
    private baseContentUrl: string;
    private pluginsDir: string;

    constructor(config: RepositoryConfig) {
        // Check if GitHub access is enabled
        const enableGithub = process.env.ENABLE_GITHUB === 'true';

        if (!enableGithub) {
            console.log('GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.');
        }

        // Extract credentials with better error handling
        this.token = config.credentials?.token || process.env.GITHUB_TOKEN || '';
        this.username = config.credentials?.username || process.env.GITHUB_USERNAME || '';

        if (enableGithub && (!this.token || !this.username)) {
            throw new Error('GitHub repository requires GITHUB_TOKEN and GITHUB_USERNAME environment variables');
        }

        // Parse repository URL
        const repoUrl = config.url || process.env.GIT_REPOSITORY_URL || '';
        const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)(\.git)?$/);

        if (repoMatch) {
            this.repoOwner = repoMatch[1];
            this.repoName = repoMatch[2];
        } else {
            if (enableGithub && !repoUrl) {
                throw new Error('GitHub repository requires a valid GIT_REPOSITORY_URL environment variable');
            }
            this.repoOwner = this.username;
            this.repoName = 'plugins';
            console.warn(`Invalid GitHub repository URL: ${repoUrl}. Using default: ${this.repoOwner}/${this.repoName}`);
        }

        this.defaultBranch = config.options?.defaultBranch || process.env.GIT_DEFAULT_BRANCH || 'main';
        this.baseApiUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}`;
        this.baseContentUrl = `${this.baseApiUrl}/contents`;
        this.pluginsDir = 'plugins';

        if (enableGithub) {
            console.log(`Initialized GitHub repository: ${this.repoOwner}/${this.repoName} (branch: ${this.defaultBranch})`);
        }
    }

    /**
     * Store a plugin manifest in the GitHub repository
     * @param manifest Plugin manifest
     */
    async store(manifest: PluginManifest): Promise<void> {
        try {
            // Check if GitHub access is enabled
            if (process.env.ENABLE_GITHUB !== 'true') {
                throw new Error('GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.');
            }

            if (!this.token || !this.username) {
                throw new Error('GitHub credentials not found in environment variables or configuration');
            }

            // Create plugin directory path
            const pluginPath = `${this.pluginsDir}/${manifest.id}`;

            // Check if plugin directory already exists
            let sha: string | undefined;
            try {
                const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${pluginPath}`);
                if (response.status === 200) {
                    // Get the SHA of the directory for updating
                    sha = response.data.sha;
                }
            } catch (error) {
                // Directory doesn't exist, which is fine for new plugins
                console.log(`Creating new plugin directory: ${pluginPath}`);
            }

            // Create or update manifest file
            await this.createOrUpdateFile(
                `${pluginPath}/plugin-manifest.json`,
                JSON.stringify(manifest, null, 2),
                `Publishing plugin ${manifest.id} - ${manifest.verb}`
            );

            // For git-sourced plugins, we only store the manifest. The code is in the git repo.
            // For inline plugins, we store the files if provided.
            if (!(manifest.packageSource && manifest.packageSource.type === 'git')) {
                if (manifest.entryPoint?.files) {
                    for (const [filename, content] of Object.entries(manifest.entryPoint.files)) {
                        await this.createOrUpdateFile(
                            `${pluginPath}/${filename}`,
                            content,
                            `Adding file ${filename} for plugin ${manifest.id}`
                        );
                    }
                }
            }

            console.log(`Successfully published plugin ${manifest.id} to GitHub repository: ${this.repoOwner}/${this.repoName}`);
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to publish plugin to GitHub: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Fetch a plugin manifest by ID
     * @param id Plugin ID
     * @returns Plugin manifest or undefined if not found
     */
    async fetch(id: string): Promise<PluginManifest | undefined> {
        try {
            // Check if GitHub access is enabled
            if (process.env.ENABLE_GITHUB !== 'true') {
                console.log('GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.');
                return undefined;
            }

            if (!id) {
                console.log('ID must be provided');
                return undefined;
            }

            // Get manifest file content
            const manifestPath = `${this.pluginsDir}/${id}/plugin-manifest.json`;
            const manifestContent = await this.getFileContent(manifestPath);

            if (!manifestContent) {
                return undefined;
            }

            // Parse manifest
            const manifest = JSON.parse(manifestContent) as PluginManifest;

            // If the plugin is git-sourced, do not attempt to fetch entryPoint files from the marketplace repo.
            // The PluginRegistry will handle fetching code from the specified git repository.
            if (manifest.packageSource && manifest.packageSource.type === 'git') {
                // Optional: Clear entryPoint.files if it somehow got populated,
                // as it might be misleading for a git-sourced plugin.
                // if (manifest.entryPoint) {
                //     manifest.entryPoint.files = undefined;
                // }
                console.log(`Fetched manifest for git-sourced plugin ${id}. Code will be handled by PluginRegistry.`);
            } else {
                // For non-git-sourced plugins (inline), fetch files if entryPoint.files is not already populated.
                if (manifest.entryPoint && !manifest.entryPoint.files) {
                    manifest.entryPoint.files = {};
                    try {
                        const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${this.pluginsDir}/${id}`);
                        if (response.status === 200 && Array.isArray(response.data)) {
                            const filesToFetch = response.data.filter((item: { type: string; name: string }) =>
                                item.type === 'file' && item.name !== 'plugin-manifest.json'
                            );
                            for (const file of filesToFetch) {
                                const fileContent = await this.getFileContent(`${this.pluginsDir}/${id}/${file.name}`);
                                if (fileContent) {
                                    manifest.entryPoint.files[file.name] = fileContent;
                                }
                            }
                        }
                    } catch (error) {
                        console.warn(`Failed to fetch entry point files for inline plugin ${id}: ${error instanceof Error ? error.message : String(error)}`);
                    }
                }
            }

            return manifest;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to fetch plugin from GitHub: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Fetch a plugin manifest by verb
     * @param verb Plugin verb
     * @returns Plugin manifest or undefined if not found
     */
    async fetchByVerb(verb: string): Promise<PluginManifest | undefined> {
        try {
            // Check if GitHub access is enabled
            if (process.env.ENABLE_GITHUB !== 'true') {
                console.log('GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.');
                return undefined;
            }

            if (!verb) {
                console.log('Verb must be provided');
                return undefined;
            }

            // List all plugins
            const plugins = await this.list();

            // Find plugin with matching verb
            for (const plugin of plugins) {
                if (plugin.verb === verb) {
                    return this.fetch(plugin.id);
                }
            }

            return undefined;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to fetch plugin by verb from GitHub: ${error instanceof Error ? error.message : String(error)}`);
            return undefined;
        }
    }

    /**
     * Delete a plugin from the repository
     * @param id Plugin ID
     */
    async delete(id: string): Promise<void> {
        try {
            if (!id) {
                console.log('ID must be provided');
                return;
            }

            if (!this.token || !this.username) {
                throw new Error('GitHub credentials not found in environment variables or configuration');
            }

            // Get the plugin directory contents
            const pluginPath = `${this.pluginsDir}/${id}`;
            const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${pluginPath}`);

            if (response.status !== 200 || !Array.isArray(response.data)) {
                console.log(`Plugin with ID ${id} not found`);
                return;
            }

            // Delete each file in the directory
            for (const file of response.data) {
                await this.deleteFile(
                    `${pluginPath}/${file.name}`,
                    file.sha,
                    `Deleting file ${file.name} for plugin ${id}`
                );
            }

            // Try to delete the directory itself (may not be possible directly with GitHub API)
            try {
                await this.makeGitHubRequest('DELETE', `${this.baseContentUrl}/${pluginPath}`, {
                    message: `Deleted plugin ${id}`,
                    branch: this.defaultBranch
                });
            } catch (error) {
                // Directory deletion might fail, which is expected with GitHub API
                console.log(`Note: Plugin directory might remain empty in the repository`);
            }

            console.log(`Successfully deleted plugin ${id} from GitHub repository`);
        } catch (error) {
            analyzeError(error as Error);
            throw new Error(`Failed to delete plugin from GitHub: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * List all plugins in the repository
     * @returns Array of plugin locators
     */
    async list(): Promise<PluginLocator[]> {
        try {
            // Check if GitHub access is enabled
            if (process.env.ENABLE_GITHUB !== 'true') {
                console.log('GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.');
                return [];
            }
            // Get plugins directory contents
            let response;
            try {
                response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${this.pluginsDir}`);
            } catch (error) {
                // If plugins directory doesn't exist, create it
                if (axios.isAxiosError(error) && error.response?.status === 404) {
                    await this.createOrUpdateFile(
                        `${this.pluginsDir}/README.md`,
                        '# Plugins Directory\n\nThis directory contains all the plugins for the system.',
                        'Creating plugins directory'
                    );
                    return [];
                }
                throw error;
            }

            if (!Array.isArray(response.data)) {
                return [];
            }

            // Filter directories (each directory is a plugin)
            const pluginDirs = response.data.filter((item: { type: string; name: string }) => item.type === 'dir');
            const locators: PluginLocator[] = [];

            // Process each plugin directory
            for (const dir of pluginDirs) {
                try {
                    // Get manifest file
                    const manifestContent = await this.getFileContent(`${this.pluginsDir}/${dir.name}/plugin-manifest.json`);

                    if (manifestContent) {
                        const manifest = JSON.parse(manifestContent) as PluginManifest;
                        locators.push({
                            id: manifest.id,
                            verb: manifest.verb,
                            repository: {
                                type: 'github',
                                url: `https://github.com/${this.repoOwner}/${this.repoName}/tree/${this.defaultBranch}/${this.pluginsDir}/${dir.name}`
                            }
                        });
                    }
                } catch (error) {
                    console.warn(`Failed to process plugin directory ${dir.name}: ${error instanceof Error ? error.message : String(error)}`);
                }
            }

            return locators;
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Failed to list plugins from GitHub: ${error instanceof Error ? error.message : String(error)}`);
            return [];
        }
    }

    /**
     * Make a request to the GitHub API with proper authentication
     * @param method HTTP method
     * @param url API URL
     * @param data Request data
     * @returns Axios response
     */
    private async makeGitHubRequest(method: string, url: string, data?: any): Promise<any> {
        try {
            // Check if GitHub access is enabled
            if (process.env.ENABLE_GITHUB !== 'true') {
                throw new Error('GitHub access is disabled by configuration. Set ENABLE_GITHUB=true to enable.');
            }

            if (!this.token) {
                throw new Error('GitHub token not found. Set GITHUB_TOKEN environment variable.');
            }

            const response = await axios({
                method,
                url,
                data,
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'CktmcsPluginMarketplace'
                }
            });

            return response;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response) {
                console.error(`GitHub API error (${error.response.status}): ${JSON.stringify(error.response.data)}`);
                throw new Error(`GitHub API error: ${error.response.status} - ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }

    /**
     * Get the content of a file from GitHub
     * @param path File path relative to repository root
     * @returns File content as string or undefined if not found
     */
    private async getFileContent(path: string): Promise<string | undefined> {
        try {
            const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${path}`);

            if (response.status === 200 && response.data.content) {
                // GitHub API returns content as base64 encoded
                return Buffer.from(response.data.content, 'base64').toString('utf-8');
            }

            return undefined;
        } catch (error) {
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                return undefined;
            }
            throw error;
        }
    }

    /**
     * Create or update a file in the GitHub repository
     * @param path File path relative to repository root
     * @param content File content
     * @param message Commit message
     */
    private async createOrUpdateFile(path: string, content: string, message: string): Promise<void> {
        try {
            // Check if file exists to get its SHA
            let sha: string | undefined;
            try {
                const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${path}`);
                if (response.status === 200) {
                    sha = response.data.sha;
                }
            } catch (error) {
                // File doesn't exist, which is fine for new files
            }

            // Create or update file
            await this.makeGitHubRequest('PUT', `${this.baseContentUrl}/${path}`, {
                message,
                content: Buffer.from(content).toString('base64'),
                sha,
                branch: this.defaultBranch
            });
        } catch (error) {
            throw new Error(`Failed to create or update file ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Delete a file from the GitHub repository
     * @param path File path relative to repository root
     * @param sha File SHA
     * @param message Commit message
     */
    private async deleteFile(path: string, sha: string, message: string): Promise<void> {
        try {
            await this.makeGitHubRequest('DELETE', `${this.baseContentUrl}/${path}`, {
                message,
                sha,
                branch: this.defaultBranch
            });
        } catch (error) {
            throw new Error(`Failed to delete file ${path}: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}



