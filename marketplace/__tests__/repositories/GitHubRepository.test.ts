import { GitHubRepository } from '@cktmcs/marketplace/repositories/GitHubRepository';
import { RepositoryConfig, PluginManifest, PluginLocator } from '@cktmcs/shared';
import axios, { AxiosError, AxiosResponse } from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';

// Mock external dependencies
jest.mock('axios');
jest.mock('@cktmcs/errorhandler');

// Cast mocked functions
const mockAxios = axios as jest.MockedFunction<typeof axios>;
const mockAnalyzeError = analyzeError as jest.Mock;

// Default properties for PluginManifest to satisfy type requirements
const defaultPluginManifestProps = {
    inputDefinitions: [],
    outputDefinitions: [],
    security: {
        trust: {
            signature: 'mock-signature',
            publicKey: 'mock-public-key',
        },
        permissions: [],
    },
};

describe('GitHubRepository', () => {
    let repository: GitHubRepository;
    const MOCK_REPO_URL = 'https://github.com/test-owner/test-repo.git';
    const MOCK_TOKEN = 'mock-token';
    const MOCK_USERNAME = 'mock-user';
    const MOCK_BRANCH = 'main';

    const baseConfig: RepositoryConfig = {
        type: 'github',
        url: MOCK_REPO_URL,
        credentials: { token: MOCK_TOKEN, username: MOCK_USERNAME },
        options: { defaultBranch: MOCK_BRANCH, pluginsPath: 'plugins' }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For retry logic

        // Mock process.env
        process.env.ENABLE_GITHUB = 'true';
        process.env.GITHUB_TOKEN = MOCK_TOKEN;
        process.env.GITHUB_USERNAME = MOCK_USERNAME;
        process.env.GIT_REPOSITORY_URL = MOCK_REPO_URL;
        process.env.GIT_DEFAULT_BRANCH = MOCK_BRANCH;

        // Default axios mocks
        mockAxios.get.mockResolvedValue({ data: {}, status: 200 });
        mockAxios.post.mockResolvedValue({ data: {}, status: 200 });
        mockAxios.put.mockResolvedValue({ data: {}, status: 200 });
        mockAxios.delete.mockResolvedValue({ data: {}, status: 200 });

        // Mock default branch fetch if not explicitly set in config
        mockAxios.get.mockImplementation((url) => {
            if (url.includes('/repos/test-owner/test-repo') && !url.includes('/contents')) {
                return Promise.resolve({ data: { default_branch: 'main' }, status: 200 });
            }
            return Promise.resolve({ data: {}, status: 200 });
        });

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        repository = new GitHubRepository(baseConfig);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided config', () => {
            expect((repository as any).token).toBe(MOCK_TOKEN);
            expect((repository as any).repoOwner).toBe('test-owner');
            expect((repository as any).repoName).toBe('test-repo');
            expect((repository as any).defaultBranch).toBe(MOCK_BRANCH);
            expect((repository as any).pluginsDir).toBe('plugins');
            expect((repository as any).isEnabled).toBe(true);
        });

        it('should disable if ENABLE_GITHUB is false', () => {
            process.env.ENABLE_GITHUB = 'false';
            repository = new GitHubRepository(baseConfig);
            expect((repository as any).isEnabled).toBe(false);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('GitHub access is disabled by configuration'));
        });

        it('should disable if GITHUB_TOKEN is missing', () => {
            delete process.env.GITHUB_TOKEN;
            repository = new GitHubRepository(baseConfig);
            expect((repository as any).isEnabled).toBe(false);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('GITHUB_TOKEN or GITHUB_USERNAME is missing'));
        });

        it('should parse repo owner/name from URL', () => {
            const config = { ...baseConfig, url: 'https://github.com/another-owner/another-repo.git' };
            repository = new GitHubRepository(config);
            expect((repository as any).repoOwner).toBe('another-owner');
            expect((repository as any).repoName).toBe('another-repo');
        });

        it('should fetch default branch if not provided', async () => {
            const config = { ...baseConfig, options: { pluginsPath: 'plugins' } }; // No defaultBranch
            delete process.env.GIT_DEFAULT_BRANCH;
            mockAxios.get.mockResolvedValueOnce({ data: { default_branch: 'master' }, status: 200 });

            repository = new GitHubRepository(config);
            jest.runAllTimers(); // Allow async fetch to complete
            await Promise.resolve(); // Allow promise chain to resolve

            expect((repository as any).defaultBranch).toBe('master');
            expect(mockAxios.get).toHaveBeenCalledWith('https://api.github.com/repos/test-owner/test-repo', expect.any(Object));
        });

        it('should log critical error if default branch fetch fails', async () => {
            const config = { ...baseConfig, options: { pluginsPath: 'plugins' } }; // No defaultBranch
            delete process.env.GIT_DEFAULT_BRANCH;
            mockAxios.get.mockRejectedValueOnce(new Error('Branch fetch failed'));

            repository = new GitHubRepository(config);
            jest.runAllTimers();
            await Promise.resolve();

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL - Failed to initialize default branch'), expect.any(Error));
        });
    });

    describe('store', () => {
        const mockManifest: PluginManifest = {
            ...defaultPluginManifestProps, // Add required properties
            id: 'new-plugin',
            verb: 'NEW_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A new plugin',
            repository: { type: 'github' },
            entryPoint: { main: 'index.js', files: { 'index.js': 'console.log("hello")' } }
        };

        it('should store a plugin manifest and its files', async () => {
            jest.spyOn(repository as any, 'createOrUpdateFile').mockResolvedValue(undefined);

            await repository.store(mockManifest);

            expect((repository as any).createOrUpdateFile).toHaveBeenCalledWith(
                'plugins/new-plugin/1.0.0/plugin-manifest.json',
                JSON.stringify(mockManifest, null, 2),
                'Publishing plugin new-plugin v1.0.0 - NEW_VERB',
                MOCK_BRANCH
            );
            expect((repository as any).createOrUpdateFile).toHaveBeenCalledWith(
                'plugins/new-plugin/1.0.0/index.js',
                'console.log("hello")',
                'Adding file index.js for plugin new-plugin v1.0.0',
                MOCK_BRANCH
            );
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Successfully published plugin'));
        });

        it('should not store if repository is disabled', async () => {
            (repository as any).isEnabled = false;
            jest.spyOn(repository as any, 'createOrUpdateFile');

            await repository.store(mockManifest);

            expect((repository as any).createOrUpdateFile).not.toHaveBeenCalled();
        });
    });

    describe('fetch', () => {
        const mockManifestContent = JSON.stringify({
            ...defaultPluginManifestProps, // Add required properties
            id: 'fetched-plugin',
            verb: 'FETCH_VERB',
            language: 'javascript',
            version: '1.0.0',
            repository: { type: 'github' },
            entryPoint: { main: 'index.js' }
        });

        beforeEach(() => {
            jest.spyOn(repository as any, 'getFileContent').mockResolvedValue(mockManifestContent);
            mockAxios.get.mockResolvedValue({ data: [], status: 200 }); // For listing files in dir
        });

        it('should fetch a specific version of a plugin', async () => {
            const manifest = await repository.fetch('fetched-plugin', '1.0.0');

            expect((repository as any).getFileContent).toHaveBeenCalledWith(
                'plugins/fetched-plugin/1.0.0/plugin-manifest.json',
                MOCK_BRANCH
            );
            expect(manifest?.id).toBe('fetched-plugin');
            expect(manifest?.version).toBe('1.0.0');
        });

        it('should fetch the default/latest version if no version specified', async () => {
            const manifest = await repository.fetch('fetched-plugin');

            expect((repository as any).getFileContent).toHaveBeenCalledWith(
                'plugins/fetched-plugin/plugin-manifest.json',
                MOCK_BRANCH
            );
            expect(manifest?.id).toBe('fetched-plugin');
        });

        it('should fetch entry point files for non-git plugins', async () => {
            const manifestWithFiles = JSON.stringify({
                ...defaultPluginManifestProps, // Add required properties
                id: 'fetched-plugin',
                verb: 'FETCH_VERB',
                language: 'javascript',
                version: '1.0.0',
                repository: { type: 'github' },
                entryPoint: { main: 'index.js', files: {} } // Empty files object
            });
            jest.spyOn(repository as any, 'getFileContent')
                .mockResolvedValueOnce(manifestWithFiles) // For manifest
                .mockResolvedValueOnce('file1 content') // For file1.txt
                .mockResolvedValueOnce('file2 content'); // For file2.txt

            mockAxios.get.mockResolvedValueOnce({
                data: [
                    { type: 'file', name: 'file1.txt' },
                    { type: 'file', name: 'file2.txt' },
                    { type: 'file', name: 'plugin-manifest.json' }, // Should be filtered out
                ],
                status: 200
            });

            const manifest = await repository.fetch('fetched-plugin', '1.0.0');

            expect(manifest?.entryPoint?.files).toEqual({
                'file1.txt': 'file1 content',
                'file2.txt': 'file2 content',
            });
            expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining('/contents/plugins/fetched-plugin/1.0.0'), expect.any(Object));
        });

        it('should return undefined if manifest not found', async () => {
            jest.spyOn(repository as any, 'getFileContent').mockResolvedValue(undefined);
            const manifest = await repository.fetch('non-existent');
            expect(manifest).toBeUndefined();
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Manifest not found'));
        });

        it('should not fetch if repository is disabled', async () => {
            (repository as any).isEnabled = false;
            jest.spyOn(repository as any, 'getFileContent');

            const manifest = await repository.fetch('any-plugin');
            expect(manifest).toBeUndefined();
            expect((repository as any).getFileContent).not.toHaveBeenCalled();
        });
    });

    describe('fetchAllVersionsOfPlugin', () => {
        const mockPluginId = 'test-plugin';
        const mockManifest1: PluginManifest = { ...defaultPluginManifestProps, id: mockPluginId, verb: 'V', language: 'js', version: '1.0.0', repository: { type: 'github' } };
        const mockManifest2: PluginManifest = { ...defaultPluginManifestProps, id: mockPluginId, verb: 'V', language: 'js', version: '1.1.0', repository: { type: 'github' } };

        beforeEach(() => {
            mockAxios.get.mockResolvedValueOnce({
                data: [
                    { type: 'dir', name: '1.0.0' },
                    { type: 'dir', name: '1.1.0' },
                ],
                status: 200
            });
            jest.spyOn(repository, 'fetch')
                .mockResolvedValueOnce(mockManifest1)
                .mockResolvedValueOnce(mockManifest2);
        });

        it('should fetch all versions of a plugin', async () => {
            const versions = await repository.fetchAllVersionsOfPlugin(mockPluginId);
            expect(versions).toEqual([mockManifest1, mockManifest2]);
            expect(repository.fetch).toHaveBeenCalledWith(mockPluginId, '1.0.0');
            expect(repository.fetch).toHaveBeenCalledWith(mockPluginId, '1.1.0');
        });

        it('should return undefined if no versions found', async () => {
            mockAxios.get.mockResolvedValueOnce({ data: [], status: 200 }); // No version dirs
            const versions = await repository.fetchAllVersionsOfPlugin(mockPluginId);
            expect(versions).toBeUndefined();
        });

        it('should return undefined if plugin directory not found (404)', async () => {
            mockAxios.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 }, code: 'RESOURCE_NOT_FOUND' });
            const versions = await repository.fetchAllVersionsOfPlugin(mockPluginId);
            expect(versions).toBeUndefined();
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Plugin directory not found'));
        });

        it('should throw error for other fetch failures', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('Network error'));
            await expect(repository.fetchAllVersionsOfPlugin(mockPluginId)).rejects.toThrow('Network error');
        });

        it('should not fetch if repository is disabled', async () => {
            (repository as any).isEnabled = false;
            mockAxios.get.mockClear();
            const versions = await repository.fetchAllVersionsOfPlugin(mockPluginId);
            expect(versions).toBeUndefined();
            expect(mockAxios.get).not.toHaveBeenCalled();
        });
    });

    describe('fetchByVerb', () => {
        const mockPluginLocator1: PluginLocator = { id: 'p1', verb: 'VERB1', language: 'js', name: 'P1', version: '1', description: 'desc', repository: { type: 'github' } };
        const mockPluginLocator2: PluginLocator = { id: 'p2', verb: 'VERB2', language: 'js', name: 'P2', version: '1', description: 'desc', repository: { type: 'github' } };

        beforeEach(() => {
            jest.spyOn(repository, 'list').mockResolvedValue([mockPluginLocator1, mockPluginLocator2]);
            jest.spyOn(repository, 'fetch').mockResolvedValue({ ...defaultPluginManifestProps, id: 'p1', verb: 'VERB1', language: 'js', repository: { type: 'github' } } as PluginManifest);
        });

        it('should fetch plugin by verb', async () => {
            const plugin = await repository.fetchByVerb('VERB1');
            expect(plugin?.verb).toBe('VERB1');
            expect(repository.list).toHaveBeenCalledTimes(1);
            expect(repository.fetch).toHaveBeenCalledWith('p1', '1');
        });

        it('should return undefined if verb not found', async () => {
            const plugin = await repository.fetchByVerb('NON_EXISTENT_VERB');
            expect(plugin).toBeUndefined();
        });

        it('should fetch specific version by verb', async () => {
            const mockManifestV2: PluginManifest = { ...defaultPluginManifestProps, id: 'p1', verb: 'VERB1', language: 'js', version: '2', repository: { type: 'github' } };
            jest.spyOn(repository, 'list').mockResolvedValue([{ ...mockPluginLocator1, version: '2' }]);
            jest.spyOn(repository, 'fetch').mockResolvedValue(mockManifestV2);

            const plugin = await repository.fetchByVerb('VERB1', '2');
            expect(plugin?.version).toBe('2');
            expect(repository.fetch).toHaveBeenCalledWith('p1', '2');
        });

        it('should not fetch if repository is disabled', async () => {
            (repository as any).isEnabled = false;
            jest.spyOn(repository, 'list');
            const plugin = await repository.fetchByVerb('VERB1');
            expect(plugin).toBeUndefined();
            expect(repository.list).not.toHaveBeenCalled();
        });
    });

    describe('delete', () => {
        const mockPluginId = 'plugin-to-delete';
        const mockVersion = '1.0.0';
        const mockFilePath = `plugins/${mockPluginId}/${mockVersion}/file.txt`;
        const mockManifestPath = `plugins/${mockPluginId}/${mockVersion}/plugin-manifest.json`;

        beforeEach(() => {
            jest.spyOn(repository as any, '_getEffectiveBranch').mockResolvedValue(MOCK_BRANCH);
            jest.spyOn(repository as any, 'deleteFile').mockResolvedValue(undefined);
            mockAxios.get.mockResolvedValueOnce({
                data: [
                    { type: 'file', name: 'file.txt', path: mockFilePath, sha: 'file-sha' },
                    { type: 'file', name: 'plugin-manifest.json', path: mockManifestPath, sha: 'manifest-sha' },
                ],
                status: 200
            });
        });

        it('should delete a specific version of a plugin', async () => {
            await repository.delete(mockPluginId, mockVersion);

            expect((repository as any).deleteFile).toHaveBeenCalledWith(mockFilePath, 'file-sha', expect.any(String), MOCK_BRANCH);
            expect((repository as any).deleteFile).toHaveBeenCalledWith(mockManifestPath, 'manifest-sha', expect.any(String), MOCK_BRANCH);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Attempted to delete files'));
        });

        it('should delete entire plugin directory if no version specified', async () => {
            const mockPluginDirPath = `plugins/${mockPluginId}`;
            mockAxios.get.mockResolvedValueOnce({
                data: [
                    { type: 'file', name: 'file.txt', path: `${mockPluginDirPath}/file.txt`, sha: 'file-sha' },
                    { type: 'dir', name: '1.0.0', path: `${mockPluginDirPath}/1.0.0`, sha: 'dir-sha' },
                ],
                status: 200
            });

            await repository.delete(mockPluginId);

            expect((repository as any).deleteFile).toHaveBeenCalledWith(`${mockPluginDirPath}/file.txt`, 'file-sha', expect.any(String), MOCK_BRANCH);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Recursive delete for directories not fully implemented'));
        });

        it('should not delete if repository is disabled', async () => {
            (repository as any).isEnabled = false;
            jest.spyOn(repository as any, 'deleteFile');

            await repository.delete(mockPluginId, mockVersion);

            expect((repository as any).deleteFile).not.toHaveBeenCalled();
        });

        it('should log and return if pluginId is not provided', async () => {
            await repository.delete('');
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('pluginId must be provided'));
        });

        it('should log if path not found for deletion', async () => {
            mockAxios.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 }, code: 'RESOURCE_NOT_FOUND' });
            await repository.delete(mockPluginId, mockVersion);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Path not found for deletion'));
        });

        it('should re-throw other errors during deletion', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('Network error'));
            await expect(repository.delete(mockPluginId, mockVersion)).rejects.toThrow('Network error');
        });
    });

    describe('list', () => {
        const mockPluginId = 'test-plugin';
        const mockManifest1: PluginManifest = { ...defaultPluginManifestProps, id: mockPluginId, verb: 'V', language: 'js', version: '1.0.0', repository: { type: 'github' } };
        const mockManifest2: PluginManifest = { ...defaultPluginManifestProps, id: mockPluginId, verb: 'V', language: 'js', version: '1.1.0', repository: { type: 'github' } };

        beforeEach(() => {
            jest.spyOn(repository, 'fetchAllVersionsOfPlugin').mockResolvedValue([mockManifest1, mockManifest2]);
            jest.spyOn(repository, 'fetch').mockResolvedValue(undefined); // For default manifest check
            mockAxios.get.mockResolvedValueOnce({
                data: [
                    { type: 'dir', name: mockPluginId },
                ],
                status: 200
            });
        });

        it('should list all plugins and their versions', async () => {
            const locators = await repository.list();
            expect(locators.length).toBe(2);
            expect(locators[0].id).toBe(mockPluginId);
            expect(locators[0].version).toBe('1.0.0');
            expect(locators[1].version).toBe('1.1.0');
            expect(repository.fetchAllVersionsOfPlugin).toHaveBeenCalledWith(mockPluginId);
        });

        it('should include default manifest if it exists and is not a duplicate', async () => {
            const defaultManifest: PluginManifest = { ...defaultPluginManifestProps, id: mockPluginId, verb: 'V', language: 'js', version: 'latest', repository: { type: 'github' } };
            jest.spyOn(repository, 'fetch').mockResolvedValueOnce(defaultManifest);

            const locators = await repository.list();
            expect(locators.length).toBe(3);
            expect(locators[2].version).toBe('latest');
        });

        it('should return empty array if repository is disabled', async () => {
            (repository as any).isEnabled = false;
            const locators = await repository.list();
            expect(locators).toEqual([]);
        });

        it('should return empty array and log warning if plugins directory is empty', async () => {
            mockAxios.get.mockResolvedValueOnce({ data: [], status: 200 });
            const locators = await repository.list();
            expect(locators).toEqual([]);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to list plugin ID directories or directory is empty'));
        });

        it('should return empty array and log for 404 on plugins directory', async () => {
            mockAxios.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 } });
            const locators = await repository.list();
            expect(locators).toEqual([]);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining("pluginsDir '/plugins' not found"));
        });

        it('should return empty array and log for 401 on plugins directory', async () => {
            mockAxios.get.mockRejectedValueOnce({ isAxiosError: true, response: { status: 401 } });
            const locators = await repository.list();
            expect(locators).toEqual([]);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Authentication failed (401)'));
        });

        it('should return empty array and log for other errors on plugins directory', async () => {
            mockAxios.get.mockRejectedValueOnce(new Error('Generic network error'));
            const locators = await repository.list();
            expect(locators).toEqual([]);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('An unexpected error occurred while listing plugins'));
        });
    });

    describe('makeGitHubRequest (private)', () => {
        it('should make a successful request', async () => {
            mockAxios.request.mockResolvedValueOnce({ data: { success: true }, status: 200 });
            const response = await (repository as any).makeGitHubRequest('GET', 'http://test.com/api');
            expect(response.data).toEqual({ success: true });
            expect(mockAxios.request).toHaveBeenCalledWith(expect.objectContaining({
                method: 'GET',
                url: 'http://test.com/api',
                headers: expect.objectContaining({
                    'Authorization': `token ${MOCK_TOKEN}`,
                }),
            }));
            expect((repository as any).failureCount).toBe(0);
            expect((repository as any).circuitState).toBe('CLOSED');
        });

        it('should retry on 5xx errors', async () => {
            mockAxios.request
                .mockRejectedValueOnce({ isAxiosError: true, response: { status: 500 } })
                .mockResolvedValueOnce({ data: { success: true }, status: 200 });

            const response = await (repository as any).makeGitHubRequest('GET', 'http://test.com/api');
            expect(response.data).toEqual({ success: true });
            expect(mockAxios.request).toHaveBeenCalledTimes(2);
            jest.advanceTimersByTime(1000); // Advance for first retry
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Retrying attempt 2/3'));
        });

        it('should open circuit after failure threshold', async () => {
            mockAxios.request.mockRejectedValue({ isAxiosError: true, response: { status: 500 } });

            await expect((repository as any).makeGitHubRequest('GET', 'http://test.com/api')).rejects.toThrow();
            await expect((repository as any).makeGitHubRequest('GET', 'http://test.com/api')).rejects.toThrow();
            await expect((repository as any).makeGitHubRequest('GET', 'http://test.com/api')).rejects.toThrow();
            jest.runAllTimers(); // Allow retries to exhaust

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Circuit is now OPEN'));
            expect((repository as any).circuitState).toBe('OPEN');

            // Subsequent call while circuit is open
            await expect((repository as any).makeGitHubRequest('GET', 'http://test.com/api')).rejects.toThrow('Circuit is open. GitHub repository is temporarily unavailable.');
        });

        it('should half-open circuit after openTimeout', async () => {
            mockAxios.request.mockRejectedValue({ isAxiosError: true, response: { status: 500 } });

            // Open circuit
            await expect((repository as any).makeGitHubRequest('GET', 'http://test.com/api')).rejects.toThrow();
            await expect((repository as any).makeGitHubRequest('GET', 'http://test.com/api')).rejects.toThrow();
            await expect((repository as any).makeGitHubRequest('GET', 'http://test.com/api')).rejects.toThrow();
            jest.runAllTimers();

            // Advance time past openTimeout
            jest.advanceTimersByTime(300000 + 1); // 5 minutes + 1ms

            // First request in half-open state
            mockAxios.request.mockResolvedValueOnce({ data: { success: true }, status: 200 });
            const response = await (repository as any).makeGitHubRequest('GET', 'http://test.com/api');

            expect(response.data).toEqual({ success: true });
            expect((repository as any).circuitState).toBe('CLOSED'); // Should close after success in half-open
        });

        it('should reject if GitHub access is disabled', async () => {
            (repository as any).isEnabled = false;
            await expect((repository as any).makeGitHubRequest('GET', 'http://test.com/api')).rejects.toThrow('GitHub access is disabled by configuration.');
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('GitHub access is disabled'));
        });

        it('should reject if GitHub token is missing', async () => {
            (repository as any).token = '';
            await expect((repository as any).makeGitHubRequest('GET', 'http://test.com/api')).rejects.toThrow('GitHub token not configured or missing.');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('GitHub token not configured'));
        });
    });

    describe('getFileContent (private)', () => {
        it('should return file content successfully', async () => {
            mockAxios.request.mockResolvedValueOnce({ data: { content: Buffer.from('file content').toString('base64') }, status: 200 });
            const content = await (repository as any).getFileContent('path/to/file.txt', MOCK_BRANCH);
            expect(content).toBe('file content');
        });

        it('should return undefined if file not found (404)', async () => {
            mockAxios.request.mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 }, code: 'RESOURCE_NOT_FOUND' });
            const content = await (repository as any).getFileContent('non-existent.txt', MOCK_BRANCH);
            expect(content).toBeUndefined();
        });

        it('should throw error for other request failures', async () => {
            mockAxios.request.mockRejectedValueOnce(new Error('Network error'));
            await expect((repository as any).getFileContent('path/to/file.txt', MOCK_BRANCH)).rejects.toThrow('Network error');
        });
    });

    describe('createOrUpdateFile (private)', () => {
        const filePath = 'path/to/new-file.txt';
        const content = 'new file content';
        const message = 'Add new file';

        it('should create a new file', async () => {
            jest.spyOn(repository as any, 'makeGitHubRequest')
                .mockRejectedValueOnce({ isAxiosError: true, response: { status: 404 }, code: 'RESOURCE_NOT_FOUND' }) // GET fails (file not found)
                .mockResolvedValueOnce({ data: {}, status: 200 }); // PUT succeeds

            await (repository as any).createOrUpdateFile(filePath, content, message, MOCK_BRANCH);

            expect((repository as any).makeGitHubRequest).toHaveBeenCalledWith('PUT', expect.any(String), expect.objectContaining({
                message,
                content: Buffer.from(content).toString('base64'),
                sha: undefined,
                branch: MOCK_BRANCH,
            }));
        });

        it('should update an existing file', async () => {
            jest.spyOn(repository as any, 'makeGitHubRequest')
                .mockResolvedValueOnce({ data: { sha: 'existing-sha' }, status: 200 }) // GET succeeds (file found)
                .mockResolvedValueOnce({ data: {}, status: 200 }); // PUT succeeds

            await (repository as any).createOrUpdateFile(filePath, content, message, MOCK_BRANCH);

            expect((repository as any).makeGitHubRequest).toHaveBeenCalledWith('PUT', expect.any(String), expect.objectContaining({
                sha: 'existing-sha',
            }));
        });
    });

    describe('deleteFile (private)', () => {
        const filePath = 'path/to/delete-file.txt';
        const sha = 'file-sha';
        const message = 'Delete file';

        it('should delete a file', async () => {
            jest.spyOn(repository as any, 'makeGitHubRequest').mockResolvedValueOnce({ data: {}, status: 200 });

            await (repository as any).deleteFile(filePath, sha, message, MOCK_BRANCH);

            expect((repository as any).makeGitHubRequest).toHaveBeenCalledWith('DELETE', expect.any(String), {
                message,
                sha,
                branch: MOCK_BRANCH,
            });
        });
    });
});
