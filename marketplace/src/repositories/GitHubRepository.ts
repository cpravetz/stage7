import { PluginManifest, PluginRepository, RepositoryConfig, PluginLocator } from '@cktmcs/shared';
import axios, { AxiosError, AxiosResponse } from 'axios'; // Import AxiosError and AxiosResponse
import { analyzeError } from '@cktmcs/errorhandler'; // Restored analyzeError for error handling

// Utility for retry logic
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * GitHub Repository implementation for plugin storage and retrieval.
 * Uses GitHub API directly.
 *
 * --- Assumed GitHub Repository Structure ---
 * Base plugin directory: `this.pluginsDir` (e.g., "plugins/")
 * Plugin ID directory: `plugins/{pluginId}/`
 *  - Default/Latest Manifest (optional): `plugins/{pluginId}/plugin-manifest.json` (used if no version specified in fetch)
 * Versioned plugin directory: `plugins/{pluginId}/{versionString}/` (e.g., "plugins/my-plugin/1.0.0/")
 *  - Versioned Manifest: `plugins/{pluginId}/{versionString}/plugin-manifest.json`
 *  - Other plugin files (for inline plugins) are relative to this versioned directory.
 */
export class GitHubRepository implements PluginRepository {
    type: 'github' = 'github';
    private token: string;
    private username: string; // Retained for default repo owner if URL parsing fails
    private repoOwner: string;
    private repoName: string;
    private defaultBranch: string | undefined; // Can be undefined initially
    private baseApiUrl: string;
    private baseContentUrl: string;
    private pluginsDir: string; // Path within the repo where plugins are stored, e.g., "plugins"
    private isEnabled: boolean;

    constructor(config: RepositoryConfig) {
        this.isEnabled = process.env.ENABLE_GITHUB === 'true';

        if (!this.isEnabled) {
            console.log('GitHubRepository: GitHub access is disabled by configuration. Operations will be skipped.');
            // Initialize required string fields to empty strings to satisfy TypeScript
            this.token = '';
            this.username = '';
            this.repoOwner = '';
            this.repoName = '';
            this.baseApiUrl = '';
            this.baseContentUrl = '';
            this.pluginsDir = 'plugins'; // Default even if disabled
            return;
        }

        this.token = process.env.GITHUB_TOKEN || config.credentials?.token || '';
        this.username = process.env.GITHUB_USERNAME || config.credentials?.username || ''; // Used as default owner

        if (!this.token || !this.username) {
            console.log(`GitHubRepository: GITHUB_TOKEN or GITHUB_USERNAME is missing. GitHub access disabled.`);
            this.isEnabled = false;
            this.token = '';
            this.username = '';
            this.repoOwner = '';
            this.repoName = '';
            this.baseApiUrl = '';
            this.baseContentUrl = '';
            this.pluginsDir = 'plugins';
            return;
        }

        const repoUrl = config.url || process.env.GIT_REPOSITORY_URL || '';
        const repoMatch = repoUrl.match(/github\.com\/([^\/]+)\/([^\/\.]+)(\.git)?$/);

        if (repoMatch) {
            this.repoOwner = repoMatch[1];
            this.repoName = repoMatch[2];
        } else {
            if (!repoUrl) { // only error if it was expected to be there
                 console.warn(`GitHubRepository: GIT_REPOSITORY_URL not provided or invalid. Defaulting to ${this.username}/plugins.`);
            } else {
                 console.warn(`GitHubRepository: Invalid GitHub repository URL format: ${repoUrl}. Defaulting to ${this.username}/plugins.`);
            }
            this.repoOwner = this.username || 'default-owner'; // Fallback if username also missing
            this.repoName = 's7plugins';
            if (!this.username) {
                console.warn('GitHubRepository: GITHUB_USERNAME not set, using default-owner as repository owner.');
            }
        }
        
        this.defaultBranch = config.options?.defaultBranch || process.env.GIT_DEFAULT_BRANCH; // No hardcoded 'main'

        this.baseApiUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}`;
        this.baseContentUrl = `${this.baseApiUrl}/contents`;
        this.pluginsDir = (config.options as any)?.pluginsPath || 'plugins'; // Use config or default to 'plugins'

        console.log(`GitHubRepository: Initialized for ${this.repoOwner}/${this.repoName}. Plugins dir: '${this.pluginsDir}'. Default branch from config/env: ${this.defaultBranch || "not set, will fetch"}`);
        
        // Eagerly fetch default branch if not provided, to fail fast or warm up
        if (!this.defaultBranch) {
            this._fetchDefaultBranchFromServer().then(branch => {
                this.defaultBranch = branch;
                console.log(`GitHubRepository: Successfully fetched and set default branch to '${this.defaultBranch}' for ${this.repoOwner}/${this.repoName}`);
            }).catch(error => {
                console.error(`GitHubRepository: CRITICAL - Failed to initialize default branch for ${this.repoOwner}/${this.repoName}. Operations requiring it may fail. Error: ${error.message}`);
                // Keep this.defaultBranch as undefined, _getEffectiveBranch will handle retries or defaults.
            });
        }
    }

    private async _fetchDefaultBranchFromServer(): Promise<string> {
        if (!this.isEnabled) throw analyzeError(new Error("GitHub access disabled."));
        console.log(`GitHubRepository: Fetching default branch for ${this.repoOwner}/${this.repoName}...`);
        try {
            const response = await this.makeGitHubRequest('GET', this.baseApiUrl); // Get repo metadata
            if (response.data && response.data.default_branch) {
                return response.data.default_branch;
            } else {
                throw analyzeError(new Error(`Could not determine default branch from GitHub API response for ${this.repoOwner}/${this.repoName}. Response missing default_branch field.`));
            }
        } catch (error) {
            console.warn(`GitHubRepository: Failed to fetch default branch from server for ${this.repoOwner}/${this.repoName}. Defaulting to 'main' for this operation.`);
            // Fallback to 'main' as a common default, but issue warning.
            // This prevents total failure if repo exists but initial metadata call fails for transient reason.
            return 'main'; 
        }
    }

    private async _getEffectiveBranch(branch?: string): Promise<string> {
        if (branch) return branch;
        if (this.defaultBranch) return this.defaultBranch;
        
        // If still here, means initial fetch in constructor might have failed or is pending
        // and no specific branch was provided for the current operation. Try fetching again.
        this.defaultBranch = await this._fetchDefaultBranchFromServer();
        return this.defaultBranch; // Will be 'main' if fetch failed, with a warning already logged.
    }


    private async makeGitHubRequest(method: string, url: string, data?: any, params?: any, attempt: number = 1): Promise<AxiosResponse> {
        if (!this.isEnabled) {
            const errorMsg = 'GitHub access is disabled by configuration.';
            console.warn(`GitHubRepository: ${errorMsg}`);
            // Simulate a "service unavailable" or "forbidden" type of error locally
            const err = new Error(errorMsg) as AxiosError;
            (err as any).response = { status: 403, data: { message: errorMsg }};
            (err as any).isAxiosError = true;
            return Promise.reject(err);
        }
        if (!this.token) {
             console.error(new Error('GitHub token not configured or missing.'));
             return Promise.reject(new Error('GitHub token not configured or missing.'));
        }

        try {
            const response = await axios({
                method,
                url,
                data,
                params,
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'CktmcsPluginMarketplace'
                }
            });
            return response;
        } catch (error: unknown) {
            if (axios.isAxiosError(error) && error.response) {
                const { status, data: responseData } = error.response;
                const retryableStatuses = [429, 500, 502, 503, 504];

                if (retryableStatuses.includes(status) && attempt <= 3) {
                    const delayMs = Math.pow(2, attempt -1 ) * 1000; // 1s, 2s, 4s
                    console.warn(`GitHubRepository: Received status ${status} for ${method} ${url}. Retrying attempt ${attempt +1}/3 in ${delayMs}ms...`);
                    await delay(delayMs);
                    return this.makeGitHubRequest(method, url, data, params, attempt + 1);
                }

                const messageDetails = responseData ? ( (typeof responseData === 'string' ? responseData : JSON.stringify(responseData)) || "No additional details from API.") : (error.message || "Unknown Axios error");

                console.error(new Error(`GitHub API Error for ${method} ${url}. Status: ${status}. Details: ${messageDetails}`));
                return Promise.reject(error);
            }
            // Non-Axios error or Axios error without response
            if (error instanceof Error) {
                console.error(new Error(`Unexpected error during GitHub request to ${url}: ${error.message}`));
            } else {
                console.error(new Error(`Unexpected error during GitHub request to ${url}: Unknown error`));
            }
            return Promise.reject(error);
        }
    }

    async store(manifest: PluginManifest): Promise<void> {
        if (!this.isEnabled) return;
        const branch = await this._getEffectiveBranch();

        // Path includes version: plugins/{pluginId}/{version}/plugin-manifest.json
        const manifestPath = `${this.pluginsDir}/${manifest.id}/${manifest.version}/plugin-manifest.json`;
        
        await this.createOrUpdateFile(
            manifestPath,
            JSON.stringify(manifest, null, 2),
            `Publishing plugin ${manifest.id} v${manifest.version} - ${manifest.verb}`,
            branch
        );

        if (!(manifest.packageSource && manifest.packageSource.type === 'git')) {
            if (manifest.entryPoint?.files) {
                const basePluginVersionPath = `${this.pluginsDir}/${manifest.id}/${manifest.version}`;
                for (const [filename, content] of Object.entries(manifest.entryPoint.files)) {
                    await this.createOrUpdateFile(
                        `${basePluginVersionPath}/${filename}`,
                        content,
                        `Adding file ${filename} for plugin ${manifest.id} v${manifest.version}`,
                        branch
                    );
                }
            }
        }
        console.log(`GitHubRepository: Successfully published plugin ${manifest.id} v${manifest.version} to ${this.repoOwner}/${this.repoName} on branch ${branch} at path ${manifestPath}`);
    }

    async fetch(pluginId: string, version?: string): Promise<PluginManifest | undefined> {
        if (!this.isEnabled) return undefined;
        if (!pluginId) { console.warn('GitHubRepository.fetch: pluginId must be provided'); return undefined; }

        const effectiveBranch = await this._getEffectiveBranch();
        let manifestPath: string;
        let baseContentFetchingPath: string;

        if (version) {
            manifestPath = `${this.pluginsDir}/${pluginId}/${version}/plugin-manifest.json`;
            baseContentFetchingPath = `${this.pluginsDir}/${pluginId}/${version}`;
        } else {
            // Fallback to default/latest manifest directly under pluginId directory
            manifestPath = `${this.pluginsDir}/${pluginId}/plugin-manifest.json`;
            baseContentFetchingPath = `${this.pluginsDir}/${pluginId}`;
            console.log(`GitHubRepository.fetch: No version specified for pluginId '${pluginId}'. Attempting to fetch from default path: ${manifestPath}`);
        }
        
        const manifestContent = await this.getFileContent(manifestPath, effectiveBranch);
        if (!manifestContent) {
            console.log(`GitHubRepository.fetch: Manifest not found for pluginId '${pluginId}' ${version ? `version '${version}'` : '(default/latest)'} at path '${manifestPath}' on branch '${effectiveBranch}'.`);
            return undefined;
        }

        const manifest = JSON.parse(manifestContent) as PluginManifest;

        // For non-git-sourced plugins (inline), fetch files if entryPoint.files is not already populated.
        if (!(manifest.packageSource && manifest.packageSource.type === 'git')) {
            if (manifest.entryPoint && (!manifest.entryPoint.files || Object.keys(manifest.entryPoint.files).length === 0) ) {
                manifest.entryPoint.files = {}; // Initialize if null/undefined
                try {
                    // List files in the baseContentFetchingPath (versioned or default path)
                    const filesInDirResponse = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${baseContentFetchingPath}`, undefined, { ref: effectiveBranch });
                    if (filesInDirResponse.status === 200 && Array.isArray(filesInDirResponse.data)) {
                        const filesToFetch = filesInDirResponse.data.filter((item: { type: string; name: string }) =>
                            item.type === 'file' && item.name !== 'plugin-manifest.json'
                        );
                        for (const file of filesToFetch) {
                            const fileContent = await this.getFileContent(`${baseContentFetchingPath}/${file.name}`, effectiveBranch);
                            if (fileContent) {
                                manifest.entryPoint.files[file.name] = fileContent;
                            }
                        }
                    }
                } catch (error) {
                    if (typeof error === 'object' && error !== null && 'code' in error && 'message' in error && (error as any).code !== 'RESOURCE_NOT_FOUND') {
                         console.warn(`GitHubRepository: Failed to fetch entry point files for inline plugin ${pluginId} ${version ? `v${version}` : '(default)'} on branch ${effectiveBranch}: ${error.message}`);
                    } else {
                         console.log(`GitHubRepository: No additional entry point files found for inline plugin ${pluginId} ${version ? `v${version}` : '(default)'} on branch ${effectiveBranch}.`)
                    }
                }
            }
        }
        return manifest;
    }

    async fetchAllVersionsOfPlugin(pluginId: string): Promise<PluginManifest[] | undefined> {
        if (!this.isEnabled) return undefined;
        if (!pluginId) { console.warn('GitHubRepository.fetchAllVersionsOfPlugin: pluginId must be provided'); return undefined; }

        const effectiveBranch = await this._getEffectiveBranch();
        const pluginBaseDir = `${this.pluginsDir}/${pluginId}`;
        let versionDirs: any[];

        try {
            const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${pluginBaseDir}`, undefined, { ref: effectiveBranch });
            if (response.status !== 200 || !Array.isArray(response.data)) {
                console.warn(`GitHubRepository: No versions found or error listing versions for plugin ${pluginId} at ${pluginBaseDir}`);
                return undefined; // Or empty array
            }
            versionDirs = response.data.filter((item: { type: string }) => item.type === 'dir');
        } catch (error) {
            if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code !== 'RESOURCE_NOT_FOUND') {
                console.log(`GitHubRepository: Plugin directory not found for pluginId '${pluginId}' at ${pluginBaseDir}`);
                return undefined; // Or empty array
            }
            throw error; // Re-throw other errors
        }

        const manifests: PluginManifest[] = [];
        for (const versionDir of versionDirs) {
            const version = versionDir.name;
            try {
                const manifest = await this.fetch(pluginId, version); // Use existing fetch with specific version
                if (manifest) {
                    manifests.push(manifest);
                }
            } catch (error) {
                if (typeof error === 'object' && error !== null && 'message' in error ) {
                    console.warn(`GitHubRepository: Failed to fetch manifest for ${pluginId} version ${version}: ${error.message}`);
                }
            }
        }
        return manifests.length > 0 ? manifests : undefined;
    }
    
    async fetchByVerb(verb: string, version?: string): Promise<PluginManifest | undefined> {
        if (!this.isEnabled) return undefined;
        // This remains inefficient and needs an index for optimal performance.
        // For now, it lists all plugins and versions, then filters.
        const allLocators = await this.list(); 
        
        for (const locator of allLocators) {
            if (locator.verb === verb) {
                if (version) { // If a specific version is requested for the verb
                    if (locator.version === version) {
                        return this.fetch(locator.id, locator.version); // locator.id is base pluginId
                    }
                } else {
                    // No specific version requested for the verb, return the first one found (likely latest if list is sorted, or arbitrary)
                    // To get the "latest" reliably, list() needs to sort versions or fetchAllVersions + sort here.
                    // For simplicity now, just fetching the located one.
                    return this.fetch(locator.id, locator.version); 
                }
            }
        }
        return undefined;
    }

    async delete(pluginId: string, version?: string): Promise<void> {
        if (!this.isEnabled) return;
        if (!pluginId) { console.warn('GitHubRepository.delete: pluginId must be provided'); return; }

        const effectiveBranch = await this._getEffectiveBranch();
        let pathToDelete: string;

        if (version) {
            pathToDelete = `${this.pluginsDir}/${pluginId}/${version}`;
        } else {
            pathToDelete = `${this.pluginsDir}/${pluginId}`; // Delete entire plugin directory if no version
        }

        try {
            // List all files/dirs under pathToDelete to get their SHAs for deletion
            const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${pathToDelete}`, undefined, { ref: effectiveBranch });
            if (response.status === 200 && Array.isArray(response.data)) {
                for (const item of response.data) { // item can be file or dir
                    // Note: GitHub API doesn't directly delete folders. Must delete all files within.
                    // This simplified delete assumes we are deleting a version folder or a plugin folder that contains files.
                    // For recursive delete of a folder, one would list contents recursively and delete files.
                    // For now, if it's a file, delete it. If it's a folder (e.g. deleting a pluginId with version subfolders), this won't recurse.
                     if (item.type === 'file') {
                        await this.deleteFile(
                            item.path, // Full path from item.path
                            item.sha,
                            `Deleting file ${item.name} for ${pluginId}${version ? ` v${version}` : ''}`,
                            effectiveBranch
                        );
                    } else if (item.type === 'dir' && version) { // If deleting a specific version, we might have files in that version dir
                        // This means pathToDelete was plugins/{pluginId}/{version}
                        // We need to list files inside this item.path (which is plugins/{pluginId}/{version}/{fileName})
                        // This part is complex for a simple delete. The current logic will only delete files directly under pathToDelete.
                        // A true recursive delete is needed if we expect nested structures beyond manifest + files.
                         console.warn(`GitHubRepository.delete: item ${item.path} is a directory. Recursive delete for directories not fully implemented here. Only direct files under ${pathToDelete} will be attempted for deletion.`);
                    }
                }
                 console.log(`GitHubRepository: Attempted to delete files for ${pathToDelete} from branch ${effectiveBranch}.`);
            } else {
                console.log(`GitHubRepository: No files found to delete for ${pathToDelete} on branch ${effectiveBranch}.`);
            }
        } catch (error: unknown) {
            if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'RESOURCE_NOT_FOUND') {
                console.log(`GitHubRepository: Path ${pathToDelete} not found for deletion on branch ${effectiveBranch}. Nothing to delete.`);
                return;
            }
            throw error; // Re-throw other errors
        }
    }

    async list(): Promise<PluginLocator[]> {
        if (!this.isEnabled) return [];
        const effectiveBranch = await this._getEffectiveBranch();
        const locators: PluginLocator[] = [];
        let pluginIdDirs: any[];

        try {
            const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${this.pluginsDir}`, undefined, { ref: effectiveBranch });
            if (!Array.isArray(response.data)) {
                 console.warn(`GitHubRepository: Failed to list plugin ID directories or directory is empty at ${this.pluginsDir}`);
                 return [];
            }
            pluginIdDirs = response.data.filter((item: { type: string }) => item.type === 'dir');
        } catch (error) {
            // Check for 404 (directory doesn't exist) vs other errors like 401 (auth issues)
            const isAxiosError = (error as any).response;
            const status = isAxiosError ? (error as any).response.status : null;

            if (status === 404) {
                console.log(`GitHubRepository: pluginsDir '${this.pluginsDir}' not found on branch ${effectiveBranch}. This is normal for empty repositories.`);
                return []; // Return empty array instead of trying to create directory
            } else if (status === 401) {
                console.error(`GitHubRepository: Authentication failed. Please check GITHUB_TOKEN and repository permissions.`);
                return [];
            } else if ((error as any).code === 'RESOURCE_NOT_FOUND') {
                console.log(`GitHubRepository: pluginsDir '${this.pluginsDir}' not found on branch ${effectiveBranch}. Attempting to create.`);
                try {
                    await this.createOrUpdateFile(`${this.pluginsDir}/README.md`, '# Plugins', 'Creating plugins directory', effectiveBranch);
                } catch (initError) { console.error(`GitHubRepository: Failed to create pluginsDir: ${(initError as Error).message}`); }
                return [];
            }
            console.error(`GitHubRepository: Error listing plugin ID dirs from ${this.pluginsDir}: ${(error as Error).message}`);
            return [];
        }

        for (const pluginIdDir of pluginIdDirs) {
            const pluginId = pluginIdDir.name;
            const versions = await this.fetchAllVersionsOfPlugin(pluginId); // This will fetch manifests
            if (versions) {
                for (const manifest of versions) {
                    if (manifest.id !== pluginId) {
                        console.warn(`GitHubRepository.list: Manifest ID '${manifest.id}' does not match directory ID '${pluginId}'. Using manifest ID.`);
                    }
                    locators.push({
                        id: manifest.id, // Use ID from manifest
                        verb: manifest.verb,
                        description: manifest.description,
                        version: manifest.version,
                        repository: {
                            type: 'github',
                            url: `https://github.com/${this.repoOwner}/${this.repoName}/tree/${effectiveBranch}/${this.pluginsDir}/${manifest.id}/${manifest.version}`
                        }
                    });
                    locators.push({
                        id: manifest.id, // Use ID from manifest
                        verb: manifest.verb,
                        version: manifest.version,
                        repository: {
                            type: 'github',
                            url: `https://github.com/${this.repoOwner}/${this.repoName}/tree/${effectiveBranch}/${this.pluginsDir}/${manifest.id}/${manifest.version}`
                        }
                    });
                }
            }
            // Check for a default/latest manifest directly under pluginId dir as well
            try {
                const defaultManifest = await this.fetch(pluginId); // Fetch without version
                if (defaultManifest) {
                    // Avoid duplicates if already listed via fetchAllVersions (e.g. if 'latest' is also a numbered version dir)
                    if (!locators.some(loc => loc.id === defaultManifest.id && loc.version === defaultManifest.version)) {
                         locators.push({
                            id: defaultManifest.id,
                            verb: defaultManifest.verb,
                            version: defaultManifest.version, // This might be "latest" or a specific version
                            repository: {
                                type: 'github',
                                url: `https://github.com/${this.repoOwner}/${this.repoName}/tree/${effectiveBranch}/${this.pluginsDir}/${defaultManifest.id}`
                            }
                        });
                    }
                }
            } catch (error) {
                // It's okay if default manifest doesn't exist, already logged by fetch
            }
        }
        return locators;
    }

    private async getFileContent(path: string, ref?: string): Promise<string | undefined> {
        if (!this.isEnabled) return undefined;
        try {
            const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${path}`, undefined, { ref: ref || await this._getEffectiveBranch() });
            if (response.status === 200 && response.data.content) {
                return Buffer.from(response.data.content, 'base64').toString('utf-8');
            }
            return undefined;
        } catch (error: unknown) {
            if (typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'RESOURCE_NOT_FOUND') {
                return undefined;
            }
            throw error; // Re-throw other errors
        }
    }

    private async createOrUpdateFile(path: string, content: string, message: string, branch: string): Promise<void> {
        if (!this.isEnabled) return;
        let sha: string | undefined;
        try {
            const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${path}`, undefined, { ref: branch });
            if (response.status === 200) {
                sha = response.data.sha;
            }
        } catch (error: unknown) {
            if (!(typeof error === 'object' && error !== null && 'code' in error && (error as any).code === 'RESOURCE_NOT_FOUND')) {
                throw error; // Re-throw if not a 404 (file doesn't exist is fine for creation)
            }
        }

        await this.makeGitHubRequest('PUT', `${this.baseContentUrl}/${path}`, {
            message,
            content: Buffer.from(content).toString('base64'),
            sha, // If undefined, GitHub creates a new file. If provided, it updates existing.
            branch
        });
    }

    private async deleteFile(path: string, sha: string, message: string, branch: string): Promise<void> {
        if (!this.isEnabled) return;
        await this.makeGitHubRequest('DELETE', `${this.baseContentUrl}/${path}`, {
            message,
            sha,
            branch
        });
    }
}
