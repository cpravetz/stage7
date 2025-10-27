import { PluginManifest, PluginRepository, RepositoryConfig, PluginLocator } from '@cktmcs/shared';
import axios, { AxiosError, AxiosResponse } from 'axios'; // Import AxiosError and AxiosResponse

// Utility for retry logic
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
/**
 * GitHub Repository implementation for plugin storage and retrieval.
 * Uses GitHub API directly.
 *
 * --- Assumed GitHub Repository Structure ---
 * Base plugin directory: `this.pluginsDir` (e.g., "plugins/")
 * Plugin ID directory: `plugins/{pluginId}/`
 *  - Default/Latest Manifest (optional): `plugins/{pluginId}/manifest.json` (used if no version specified in fetch)
 * Versioned plugin directory: `plugins/{pluginId}/{versionString}/` (e.g., "plugins/my-plugin/1.0.0/")
 *  - Versioned Manifest: `plugins/{pluginId}/{versionString}/manifest.json`
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
    private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private failureCount = 0;
    private lastFailureTime = 0;
    private readonly failureThreshold = 3;
    private readonly openTimeout = 300000; // 5 minutes

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
        if (!this.isEnabled) {
            console.warn("GitHubRepository: GitHub access disabled, cannot fetch default branch. Returning 'main'.");
            return 'main'; // Return a default if disabled
        }
        console.log(`GitHubRepository: Fetching default branch for ${this.repoOwner}/${this.repoName}...`);
        const response = await this.makeGitHubRequest('GET', this.baseApiUrl); // Get repo metadata

        if (response.status === 200 && response.data && response.data.default_branch) {
            return response.data.default_branch;
        } else {
            console.warn(`GitHubRepository: Failed to fetch default branch from server for ${this.repoOwner}/${this.repoName}. Status: ${response.status}. Response missing default_branch field or request failed. Defaulting to 'main' for this operation.`);
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
        if (this.circuitState === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.openTimeout) {
                this.circuitState = 'HALF_OPEN';
            } else {
                // Return a dummy response instead of rejecting the promise
                return {
                    data: { message: 'Circuit is open. GitHub repository is temporarily unavailable.' },
                    status: 503, // Service Unavailable
                    statusText: 'Service Unavailable',
                    headers: {},
                    config: {},
                    request: {},
                } as AxiosResponse;
            }
        }

        if (!this.isEnabled) {
            const errorMsg = 'GitHub access is disabled by configuration.';
            console.warn(`GitHubRepository: ${errorMsg}`);
            // Simulate a "service unavailable" or "forbidden" type of error locally
            return {
                data: { message: errorMsg },
                status: 403, // Forbidden
                statusText: 'Forbidden',
                headers: {},
                config: {},
                request: {},
            } as AxiosResponse;
        }
        if (!this.token) {
             console.error(new Error('GitHub token not configured or missing.'));
             return {
                data: { message: 'GitHub token not configured or missing.' },
                status: 401, // Unauthorized
                statusText: 'Unauthorized',
                headers: {},
                config: {},
                request: {},
            } as AxiosResponse;
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
            this.failureCount = 0;
            this.circuitState = 'CLOSED';
            return response;
        } catch (error: unknown) {
            this.failureCount++;
            this.lastFailureTime = Date.now();
            if (this.circuitState === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
                this.circuitState = 'OPEN';
                console.error(`Circuit is now OPEN for GitHubRepository.`);
            }

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
                console.error(`GitHubRepository: Failed request URL: ${url}, Status: ${status}`);
                return {
                    data: { message: `GitHub API Error: ${messageDetails}` },
                    status: status,
                    statusText: error.response.statusText,
                    headers: error.response.headers,
                    config: error.config,
                    request: error.request,
                } as AxiosResponse;
            }
            // Non-Axios error or Axios error without response
            if (error instanceof Error) {
                console.error(new Error(`Unexpected error during GitHub request to ${url}: ${error.message}`));
            } else {
                console.error(new Error(`Unexpected error during GitHub request to ${url}: Unknown error`));
            }
            return {
                data: { message: `Unexpected error during GitHub request to ${url}` },
                status: 500, // Internal Server Error
                statusText: 'Internal Server Error',
                headers: {},
                config: {},
                request: {},
            } as AxiosResponse;
        }
    }

    async store(manifest: PluginManifest): Promise<void> {
        if (!this.isEnabled) return;
        const branch = await this._getEffectiveBranch();

        // Path includes version: plugins/{pluginId}/{version}/manifest.json
        const manifestPath = `${this.pluginsDir}/${manifest.id}/${manifest.version}/manifest.json`;
        
        const manifestUpdateResult = await this.createOrUpdateFile(
            manifestPath,
            JSON.stringify(manifest, null, 2),
            `Publishing plugin ${manifest.id} v${manifest.version} - ${manifest.verb}`,
            branch
        );
        if (!manifestUpdateResult) {
            console.error(`GitHubRepository: Failed to store manifest for plugin ${manifest.id} v${manifest.version}.`);
            return; // Exit if manifest storage failed
        }

        if (!(manifest.packageSource && manifest.packageSource.type === 'git')) {
            if (manifest.entryPoint?.files) {
                const basePluginVersionPath = `${this.pluginsDir}/${manifest.id}/${manifest.version}`;
                for (const [filename, content] of Object.entries(manifest.entryPoint.files)) {
                    const fileUpdateResult = await this.createOrUpdateFile(
                        `${basePluginVersionPath}/${filename}`,
                        content,
                        `Adding file ${filename} for plugin ${manifest.id} v${manifest.version}`,
                        branch
                    );
                    if (!fileUpdateResult) {
                        console.error(`GitHubRepository: Failed to store file ${filename} for plugin ${manifest.id} v${manifest.version}.`);
                        // Continue to try other files or decide to return
                    }
                }
            }
        }
        console.log(`GitHubRepository: Successfully published plugin ${manifest.id} v${manifest.version} to ${this.repoOwner}/${this.repoName} on branch ${branch} at path ${manifestPath}`);
    }

    async fetch(pluginId: string, version?: string): Promise<PluginManifest | undefined> {
        if (!this.isEnabled) return undefined;
        if (!pluginId) { console.warn('GitHubRepository.fetch: pluginId must be provided'); return undefined; }

        // Always strip 'plugin-' prefix for path construction
        const pathPluginId = pluginId.startsWith('plugin-') ? pluginId.substring('plugin-'.length) : pluginId;

        const effectiveBranch = await this._getEffectiveBranch();
        let manifestPath: string;
        let baseContentFetchingPath: string;

        if (version) {
            manifestPath = `${this.pluginsDir}/${pathPluginId}/${version}/manifest.json`;
            baseContentFetchingPath = `${this.pluginsDir}/${pathPluginId}/${version}`;
        } else {
            // Fallback to default/latest manifest directly under pluginId directory
            manifestPath = `${this.pluginsDir}/${pathPluginId}/manifest.json`;
            baseContentFetchingPath = `${this.pluginsDir}/${pathPluginId}`;
        }

        const manifestContent = await this.getFileContent(manifestPath, effectiveBranch);

        if (!manifestContent) {
            console.log(`GitHubRepository.fetch: Manifest not found for pluginId '${pluginId}' ${version ? `version '${version}'` : '(default/latest)'} at path '${manifestPath}' on branch '${effectiveBranch}'.`);
            return undefined;
        }

        const manifest = JSON.parse(manifestContent);

        if (!manifest || typeof manifest.id !== 'string' || typeof manifest.verb !== 'string' || typeof manifest.version !== 'string') {
            console.warn(`GitHubRepository.fetch: Invalid manifest for pluginId '${pluginId}' ${version ? `version '${version}'` : '(default/latest)'}. Missing id, verb, or version.`);
            return undefined;
        }

        // For non-git-sourced plugins (inline), fetch files if entryPoint.files is not already populated.
        if (!(manifest.packageSource && manifest.packageSource.type === 'git')) {
            if (manifest.entryPoint && (!manifest.entryPoint.files || Object.keys(manifest.entryPoint.files).length === 0) ) {
                manifest.entryPoint.files = {}; // Initialize if null/undefined
                const filesInDirResponse = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${baseContentFetchingPath}`, undefined, { ref: effectiveBranch });
                if (filesInDirResponse.status === 200 && Array.isArray(filesInDirResponse.data)) {
                    const filesToFetch = filesInDirResponse.data.filter((item: { type: string; name: string }) =>
                        item.type === 'file' && item.name !== 'manifest.json'
                    );
                    for (const file of filesToFetch) {
                        const fileContent = await this.getFileContent(`${baseContentFetchingPath}/${file.name}`, effectiveBranch);
                        if (fileContent) {
                            manifest.entryPoint.files[file.name] = fileContent;
                        }
                    }
                } else if (filesInDirResponse.status !== 404) {
                    console.warn(`GitHubRepository: Failed to fetch entry point files for inline plugin ${pluginId} ${version ? `v${version}` : '(default)'} on branch ${effectiveBranch}. Status: ${filesInDirResponse.status}`);
                } else {
                    console.log(`GitHubRepository: No additional entry point files found for inline plugin ${pluginId} ${version ? `v${version}` : '(default)'} on branch ${effectiveBranch}.`);
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
        let versionDirs: any[] = []; // Initialize to empty array

        const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${pluginBaseDir}`, undefined, { ref: effectiveBranch });

        if (response.status === 200 && Array.isArray(response.data)) {
            versionDirs = response.data.filter((item: { type: string }) => item.type === 'dir');
        } else if (response.status === 404) {
            console.log(`GitHubRepository: Plugin directory not found for pluginId '${pluginId}' at ${pluginBaseDir}. Status: 404.`);
            return undefined; // Or empty array, depending on desired behavior
        } else {
            console.warn(`GitHubRepository: Failed to list versions for plugin ${pluginId} at ${pluginBaseDir}. Status: ${response.status}.`);
            return undefined; // Or empty array
        }

        const manifests: PluginManifest[] = [];
        for (const versionDir of versionDirs) {
            const version = versionDir.name;
            const manifest = await this.fetch(pluginId, version);
            if (manifest) { // Only add if manifest was successfully fetched
                manifests.push(manifest);
            } else {
                console.warn(`GitHubRepository.fetchAllVersionsOfPlugin: Skipping invalid or unfetchable manifest for plugin ${pluginId} version ${version}.`);
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
                        return this.fetch(locator.id, locator.version);
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

        const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${pathToDelete}`, undefined, { ref: effectiveBranch });
        if (response.status === 200 && Array.isArray(response.data)) {
            for (const item of response.data) { // item can be file or dir
                if (item.type === 'file') {
                    const deleteResult = await this.deleteFile(
                        item.path, // Full path from item.path
                        item.sha,
                        `Deleting file ${item.name} for ${pluginId}${version ? ` v${version}` : ''}`,
                        effectiveBranch
                    );
                    if (!deleteResult) {
                        console.error(`GitHubRepository: Failed to delete file ${item.name} for ${pluginId}${version ? ` v${version}` : ''}.`);
                    }
                } else if (item.type === 'dir' && version) {
                    console.warn(`GitHubRepository.delete: item ${item.path} is a directory. Recursive delete for directories not fully implemented here. Only direct files under ${pathToDelete} will be attempted for deletion.`);
                }
            }
            console.log(`GitHubRepository: Attempted to delete files for ${pathToDelete} from branch ${effectiveBranch}.`);
        } else if (response.status === 404) {
            console.log(`GitHubRepository: Path ${pathToDelete} not found for deletion on branch ${effectiveBranch}. Nothing to delete.`);
        } else {
            console.error(`GitHubRepository: Failed to list contents for deletion at ${pathToDelete}. Status: ${response.status}.`);
        }
    }

    private async getFileContent(path: string, ref?: string): Promise<string | undefined> {
        if (!this.isEnabled) return undefined;
        const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${path}`, undefined, { ref: ref || await this._getEffectiveBranch() });
        if (response.status === 200 && response.data.content) {
            return Buffer.from(response.data.content, 'base64').toString('utf-8');
        }
        // Log if it's a 404, otherwise just return undefined
        if (response.status === 404) {
            console.log(`GitHubRepository.getFileContent: Path '${path}' not found (404).`);
        } else {
                console.warn(`GitHubRepository.getFileContent: Failed to get content for path '${path}'. Status: ${response.status}`);
        }
        return undefined;
    }

    private async createOrUpdateFile(path: string, content: string, message: string, branch: string): Promise<boolean> {
        if (!this.isEnabled) return false;
        let sha: string | undefined;
        const getResponse = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${path}`, undefined, { ref: branch });
        if (getResponse.status === 200) {
            sha = getResponse.data.sha;
        } else if (getResponse.status !== 404) { // If not 200 and not 404, it's an unexpected error
            console.error(`GitHubRepository: Failed to check existence of file ${path}. Status: ${getResponse.status}.`);
            return false;
        }

        const putResponse = await this.makeGitHubRequest('PUT', `${this.baseContentUrl}/${path}`, {
            message,
            content: Buffer.from(content).toString('base64'),
            sha, // If undefined, GitHub creates a new file. If provided, it updates existing.
            branch
        });

        if (putResponse.status === 200 || putResponse.status === 201) {
            return true;
        } else {
            console.error(`GitHubRepository: Failed to create or update file ${path}. Status: ${putResponse.status}.`);
            return false;
        }
    }

    private async deleteFile(path: string, sha: string, message: string, branch: string): Promise<boolean> {
        if (!this.isEnabled) return false;
        const response = await this.makeGitHubRequest('DELETE', `${this.baseContentUrl}/${path}`, {
            message,
            sha,
            branch
        });

        if (response.status === 200) {
            return true;
        } else {
            console.error(`GitHubRepository: Failed to delete file ${path}. Status: ${response.status}.`);
            return false;
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
        } catch (error: unknown) {
            // Check for Axios-specific errors to get status code
            if (axios.isAxiosError(error) && error.response) {
                const { status } = error.response;
                if (status === 404) {
                    // This is the case where the plugins directory doesn't exist.
                    console.log(`GitHubRepository: pluginsDir '${this.pluginsDir}' not found on branch ${effectiveBranch}. This is normal for new or empty repositories.`);
                    return []; // Gracefully exit with an empty list.
                } else if (status === 401) {
                    // This is the authentication error seen in the logs.
                    console.error(`GitHubRepository: Authentication failed (401). Please check GITHUB_TOKEN and repository permissions.`);
                    return []; // Gracefully exit with an empty list.
                }
            }
            // For all other errors, log it and exit gracefully.
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`GitHubRepository: An unexpected error occurred while listing plugins from '${this.pluginsDir}': ${errorMessage}`);
            return [];
        }

        for (const pluginIdDir of pluginIdDirs) {
            const pluginId = pluginIdDir.name;
            try {
                const versions = await this.fetchAllVersionsOfPlugin(pluginId); // This will fetch manifests
                if (versions) {
                    for (const manifest of versions) {
                        if (manifest && manifest.id && manifest.verb && manifest.version) {
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
                        } else {
                            console.warn(`GitHubRepository.list: Invalid manifest for plugin ${pluginId}, version ${manifest.version}. Skipping.`);
                        }
                    }
                }
                // Check for a default/latest manifest directly under pluginId dir as well
                const defaultManifest = await this.fetch(pluginId); // Fetch without version
                if (defaultManifest) {
                    if (defaultManifest.id && defaultManifest.verb && defaultManifest.version) {
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
                    } else {
                        console.warn(`GitHubRepository.list: Invalid default manifest for plugin ${pluginId}. Skipping.`);
                    }
                }
            } catch (error) {
                console.error(`GitHubRepository.list: Failed to process plugin '${pluginId}'. Skipping. Error: ${error instanceof Error ? error.message : String(error)}`);
                // Continue to the next plugin
            }
        }
        return locators;
    }

}