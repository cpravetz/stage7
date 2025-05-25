import { PluginManifest, PluginRepository, RepositoryConfig, PluginLocator } from '@cktmcs/shared';
import axios, { AxiosError, AxiosResponse } from 'axios'; // Import AxiosError and AxiosResponse
// import { analyzeError } from '@cktmcs/errorhandler'; // To be replaced by embedded error handling

// --- Embedded Error Reporting Logic ---
const GitHubRepositoryErrorCodes_EMBEDDED = {
  AUTH_FAILED: 'GITHUB_AUTH_FAILED',
  FORBIDDEN: 'GITHUB_FORBIDDEN',
  RESOURCE_NOT_FOUND: 'GITHUB_RESOURCE_NOT_FOUND',
  API_RATE_LIMIT: 'GITHUB_API_RATE_LIMIT',
  SERVER_ERROR: 'GITHUB_SERVER_ERROR',
  API_ERROR: 'GITHUB_API_ERROR', // Generic API error
  CONFIG_ERROR: 'GITHUB_CONFIG_ERROR',
  FETCH_DEFAULT_BRANCH_FAILED: 'GITHUB_FETCH_DEFAULT_BRANCH_FAILED',
};

function generateGhApiError(
    code: string,
    message: string,
    status?: number,
    originalError?: any
): Error {
    let fullMessage = `${code}: ${message}`;
    if (status) {
        fullMessage = `Status ${status} - ${fullMessage}`;
    }
    const error = new Error(fullMessage);
    (error as any).code = code; // Attach custom error code
    if (originalError) {
        (error as any).originalError = originalError;
        if (originalError.response?.data) {
             (error as any).details = originalError.response.data;
        }
    }
    // console.error(fullMessage, (error as any).details || originalError); // Log error internally
    return error;
}

// Utility for retry logic
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
// --- End of Embedded Error Reporting Logic ---

/**
 * GitHub Repository implementation for plugin storage and retrieval
 * Uses GitHub API directly instead of git commands
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

        this.token = config.credentials?.token || process.env.GITHUB_TOKEN || '';
        this.username = config.credentials?.username || process.env.GITHUB_USERNAME || ''; // Used as default owner

        if (!this.token) { // Username might not be strictly needed if repoOwner is from URL
            throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.CONFIG_ERROR, 'GitHub repository requires GITHUB_TOKEN.');
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
            this.repoName = 'plugins';
            if (!this.username) {
                console.warn('GitHubRepository: GITHUB_USERNAME not set, using default-owner as repository owner.');
            }
        }
        
        this.defaultBranch = config.options?.defaultBranch || process.env.GIT_DEFAULT_BRANCH; // No hardcoded 'main'

        this.baseApiUrl = `https://api.github.com/repos/${this.repoOwner}/${this.repoName}`;
        this.baseContentUrl = `${this.baseApiUrl}/contents`;
        this.pluginsDir = config.options?.pluginsPath || 'plugins'; // Use config or default

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
        if (!this.isEnabled) throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.CONFIG_ERROR, "GitHub access disabled.");
        console.log(`GitHubRepository: Fetching default branch for ${this.repoOwner}/${this.repoName}...`);
        try {
            const response = await this.makeGitHubRequest('GET', this.baseApiUrl); // Get repo metadata
            if (response.data && response.data.default_branch) {
                return response.data.default_branch;
            } else {
                throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.FETCH_DEFAULT_BRANCH_FAILED, `Could not determine default branch from GitHub API response for ${this.repoOwner}/${this.repoName}. Response missing default_branch field.`);
            }
        } catch (error) {
            console.warn(`GitHubRepository: Failed to fetch default branch from server for ${this.repoOwner}/${this.repoName}. Error: ${error.message}. Defaulting to 'main' for this operation.`);
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
            throw err;
        }
        if (!this.token) {
             throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.CONFIG_ERROR, 'GitHub token not configured or missing.');
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
        } catch (error) {
            const axiosError = error as AxiosError;
            if (axiosError.isAxiosError && axiosError.response) {
                const { status, data: responseData } = axiosError.response;
                const retryableStatuses = [429, 500, 502, 503, 504];

                if (retryableStatuses.includes(status) && attempt <= 3) {
                    const delayMs = Math.pow(2, attempt -1 ) * 1000; // 1s, 2s, 4s
                    console.warn(`GitHubRepository: Received status ${status} for ${method} ${url}. Retrying attempt ${attempt +1}/3 in ${delayMs}ms...`);
                    await delay(delayMs);
                    return this.makeGitHubRequest(method, url, data, params, attempt + 1);
                }

                const messageDetails = responseData ? ( (typeof responseData === 'string' ? responseData : JSON.stringify(responseData)) || "No additional details from API.") : (axiosError.message || "Unknown Axios error");

                if (status === 401) throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.AUTH_FAILED, `Authentication failed. Check GITHUB_TOKEN validity and permissions. Details: ${messageDetails}`, status, axiosError);
                if (status === 403) throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.FORBIDDEN, `Access forbidden. Check GITHUB_TOKEN permissions or API rate limits. Details: ${messageDetails}`, status, axiosError);
                if (status === 404) throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.RESOURCE_NOT_FOUND, `Resource not found at ${url}. Details: ${messageDetails}`, status, axiosError);
                if (status === 429) throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.API_RATE_LIMIT, `Rate limit exceeded. Details: ${messageDetails}`, status, axiosError);
                if (status >= 500) throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.SERVER_ERROR, `GitHub server error. Details: ${messageDetails}`, status, axiosError);
                
                throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.API_ERROR, `GitHub API Error for ${method} ${url}. Details: ${messageDetails}`, status, axiosError);
            }
            // Non-Axios error or Axios error without response
            throw generateGhApiError(GitHubRepositoryErrorCodes_EMBEDDED.API_ERROR, `Unexpected error during GitHub request to ${url}: ${error.message}`, undefined, error);
        }
    }

    async store(manifest: PluginManifest): Promise<void> {
        if (!this.isEnabled) return;
        const branch = await this._getEffectiveBranch(); // Use default branch for storing manifests

        const pluginPath = `${this.pluginsDir}/${manifest.id}`;
        // Check if plugin directory already exists - this call itself might not be needed if createOrUpdateFile handles it
        // For simplicity, we assume createOrUpdateFile will create path if necessary or update if exists.
        // GitHub API for contents will create/update files. Directories are implicit.

        await this.createOrUpdateFile(
            `${pluginPath}/plugin-manifest.json`,
            JSON.stringify(manifest, null, 2),
            `Publishing plugin ${manifest.id} v${manifest.version} - ${manifest.verb}`,
            branch // Pass branch to createOrUpdateFile
        );

        if (!(manifest.packageSource && manifest.packageSource.type === 'git')) {
            if (manifest.entryPoint?.files) {
                for (const [filename, content] of Object.entries(manifest.entryPoint.files)) {
                    await this.createOrUpdateFile(
                        `${pluginPath}/${filename}`,
                        content,
                        `Adding file ${filename} for plugin ${manifest.id} v${manifest.version}`,
                        branch // Pass branch
                    );
                }
            }
        }
        console.log(`GitHubRepository: Successfully published plugin ${manifest.id} v${manifest.version} to ${this.repoOwner}/${this.repoName} on branch ${branch}`);
    }

    async fetch(id: string, version?: string): Promise<PluginManifest | undefined> { // Version parameter added
        if (!this.isEnabled) return undefined;
        if (!id) { console.warn('GitHubRepository.fetch: ID must be provided'); return undefined; }

        // Versioning note: If this GitHub repo itself is versioned (e.g. by tags for each plugin version's manifest),
        // then the 'ref' for getFileContent should be that tag.
        // For now, assume manifests are on the default branch and version is in manifest.id or a versioned path.
        // If versioning implies paths like /plugins/pluginId/1.0.0/plugin-manifest.json, then id should include version.
        // For this iteration, we assume 'id' is the unique identifier that might already include version,
        // or that manifests on default branch are the "latest" discoverable ones.
        // The `feature_plugin_versioning.md` implies plugin definitions are stored like `plugins/{plugin_id}/{plugin_version}/plugin_definition.json`.
        // So, the `id` parameter should ideally be `plugin_id/plugin_version`.
        
        const manifestPath = `${this.pluginsDir}/${id}/plugin-manifest.json`; // If id is "pluginA/1.0.0" -> "plugins/pluginA/1.0.0/plugin-manifest.json"
        const ref = await this._getEffectiveBranch(); // Use default branch to find the manifest of this version.

        const manifestContent = await this.getFileContent(manifestPath, ref);
        if (!manifestContent) return undefined;

        const manifest = JSON.parse(manifestContent) as PluginManifest;

        // For non-git-sourced plugins (inline), fetch files if entryPoint.files is not already populated.
        if (!(manifest.packageSource && manifest.packageSource.type === 'git')) {
            if (manifest.entryPoint && (!manifest.entryPoint.files || Object.keys(manifest.entryPoint.files).length === 0) ) {
                manifest.entryPoint.files = {};
                try {
                    const filesInDirResponse = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${this.pluginsDir}/${id}`, undefined, { ref });
                    if (filesInDirResponse.status === 200 && Array.isArray(filesInDirResponse.data)) {
                        const filesToFetch = filesInDirResponse.data.filter((item: { type: string; name: string }) =>
                            item.type === 'file' && item.name !== 'plugin-manifest.json'
                        );
                        for (const file of filesToFetch) {
                            const fileContent = await this.getFileContent(`${this.pluginsDir}/${id}/${file.name}`, ref);
                            if (fileContent) {
                                manifest.entryPoint.files[file.name] = fileContent;
                            }
                        }
                    }
                } catch (error) { // Could be 404 if no other files
                    if (error.code !== GitHubRepositoryErrorCodes_EMBEDDED.RESOURCE_NOT_FOUND) {
                         console.warn(`GitHubRepository: Failed to fetch entry point files for inline plugin ${id} on ref ${ref}: ${error.message}`);
                    } else {
                         console.log(`GitHubRepository: No additional entry point files found for inline plugin ${id} on ref ${ref}.`)
                    }
                }
            }
        }
        return manifest;
    }
    
    async fetchByVerb(verb: string, version?: string): Promise<PluginManifest | undefined> {
        if (!this.isEnabled) return undefined;
        // This is inefficient. Ideally, we'd have an index or query capability.
        // For now, it lists all and filters. If versioning by path, list needs to be smarter.
        const plugins = await this.list(); // list() itself needs to be version-aware if paths are versioned
        for (const locator of plugins) {
            // If versioning is path-based, locator.id might be "pluginId/version"
            // This simple check assumes verb is unique across versions for now, or fetches latest if multiple match verb.
            // For true versioned fetchByVerb, list() needs to provide versioned locators.
            if (locator.verb === verb) {
                // If a version is specified, we need to ensure the locator matches that version.
                // This requires list() and PluginLocator to be version-aware.
                // For now, if version is passed, we'd ideally use it in fetch(locator.id, version)
                // but locator.id might already be versioned.
                // This part needs refinement once versioning strategy in GitHub repo is fully decided.
                // Let's assume for now fetch(locator.id) gets the specific version if id includes it.
                return this.fetch(locator.id); // Pass version if available and fetch supports it
            }
        }
        return undefined;
    }

    async delete(id: string, version?: string): Promise<void> { // Version parameter added
        if (!this.isEnabled) return;
        if (!id) { console.warn('GitHubRepository.delete: ID must be provided'); return; }

        const effectiveBranch = await this._getEffectiveBranch();
        const pluginPath = `${this.pluginsDir}/${id}`; // If id is "pluginA/1.0.0", this path is correct for versioned delete

        const response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${pluginPath}`, undefined, { ref: effectiveBranch });

        if (response.status !== 200 || !Array.isArray(response.data)) {
            console.log(`GitHubRepository: Plugin with ID ${id} (version path) not found on branch ${effectiveBranch}.`);
            return;
        }

        for (const file of response.data) {
            await this.deleteFile(
                `${pluginPath}/${file.name}`,
                file.sha,
                `Deleting file ${file.name} for plugin ${id}`,
                effectiveBranch
            );
        }
        // Deleting the folder itself is tricky with GitHub API (delete all files, folder disappears if empty)
        console.log(`GitHubRepository: Successfully deleted files for plugin ${id} from branch ${effectiveBranch}.`);
    }

    async list(): Promise<PluginLocator[]> {
        if (!this.isEnabled) return [];
        const effectiveBranch = await this._getEffectiveBranch();
        let response;
        try {
            response = await this.makeGitHubRequest('GET', `${this.baseContentUrl}/${this.pluginsDir}`, undefined, { ref: effectiveBranch });
        } catch (error) {
            if (error.code === GitHubRepositoryErrorCodes_EMBEDDED.RESOURCE_NOT_FOUND) {
                // If plugins directory doesn't exist, try to create it with a README.md
                console.log(`GitHubRepository: pluginsDir '${this.pluginsDir}' not found on branch ${effectiveBranch}. Attempting to create.`);
                try {
                    await this.createOrUpdateFile(
                        `${this.pluginsDir}/README.md`,
                        '# Plugins Directory\n\nThis directory contains plugin manifests.',
                        'Creating plugins directory',
                        effectiveBranch
                    );
                    console.log(`GitHubRepository: Created pluginsDir '${this.pluginsDir}' with a README.`);
                } catch (initError) {
                    console.error(`GitHubRepository: Failed to create pluginsDir '${this.pluginsDir}' on branch ${effectiveBranch}: ${initError.message}`);
                }
                return []; // Return empty list as directory was just (attempted to be) created
            }
            console.error(`GitHubRepository: Failed to list plugins from branch ${effectiveBranch}: ${error.message}`);
            return [];
        }

        if (!Array.isArray(response.data)) return [];

        const pluginDirsOrFiles = response.data.filter((item: { type: string; name: string }) => item.type === 'dir' || item.name === 'plugin-manifest.json');
        const locators: PluginLocator[] = [];

        for (const item of pluginDirsOrFiles) {
            let manifestPath: string;
            let pluginIdToUse: string;

            if (item.type === 'dir') {
                // Assumes structure: plugins/{pluginId}/{version}/plugin-manifest.json
                // or plugins/{pluginId}/plugin-manifest.json (if not versioned by path)
                // For now, let's assume 'item.name' is pluginId or pluginId/version segment.
                manifestPath = `${this.pluginsDir}/${item.name}/plugin-manifest.json`;
                pluginIdToUse = item.name; // This might need adjustment if item.name is versioned.
            } else { // It's a plugin-manifest.json at the root of pluginsDir (less likely for multiple plugins)
                // This case is less robust, better to have each plugin in its own directory.
                // Assuming the name of the manifest indicates the plugin ID if structure is flat.
                // manifestPath = `${this.pluginsDir}/${item.name}`;
                // pluginIdToUse = item.name.replace('plugin-manifest.json', '');
                console.warn(`GitHubRepository: Found manifest directly in pluginsDir: ${item.name}. Recommend organizing plugins in subdirectories.`);
                continue; 
            }
            
            try {
                const manifestContent = await this.getFileContent(manifestPath, effectiveBranch);
                if (manifestContent) {
                    const manifest = JSON.parse(manifestContent) as PluginManifest;
                    // If id in manifest is different from dir name, prefer manifest.id
                    const finalPluginId = manifest.id || pluginIdToUse; 
                    locators.push({
                        id: finalPluginId, // This ID should incorporate version if paths are versioned.
                        verb: manifest.verb,
                        name: manifest.name, // Added name to locator
                        version: manifest.version, // Added version to locator
                        description: manifest.description, // Added description
                        repository: {
                            type: 'github',
                            url: `https://github.com/${this.repoOwner}/${this.repoName}/tree/${effectiveBranch}/${this.pluginsDir}/${finalPluginId}`
                        }
                    });
                }
            } catch (error) {
                console.warn(`GitHubRepository: Failed to process item ${item.name} on branch ${effectiveBranch}: ${error.message}`);
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
        } catch (error) {
            if (error.code === GitHubRepositoryErrorCodes_EMBEDDED.RESOURCE_NOT_FOUND) {
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
        } catch (error) {
            if (error.code !== GitHubRepositoryErrorCodes_EMBEDDED.RESOURCE_NOT_FOUND) {
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
