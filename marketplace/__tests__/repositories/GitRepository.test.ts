import { GitRepository } from '../src/repositories/GitRepository';
import { RepositoryConfig, PluginManifest, PluginLocator } from '@cktmcs/shared';
import simpleGit, { SimpleGit } from 'simple-git';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock external dependencies
jest.mock('simple-git');
jest.mock('fs/promises');
jest.mock('path');

// Cast mocked functions/modules
const mockSimpleGit = simpleGit as jest.MockedFunction<typeof simpleGit>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('GitRepository', () => {
    let repository: GitRepository;
    let mockGitInstance: jest.Mocked<SimpleGit>;

    const MOCK_REPO_URL = 'https://github.com/test-owner/test-repo.git';
    const MOCK_TOKEN = 'mock-token';
    const MOCK_USERNAME = 'mock-user';
    const MOCK_BRANCH = 'main';

    const baseConfig: RepositoryConfig = {
        type: 'git',
        url: MOCK_REPO_URL,
        options: { defaultBranch: MOCK_BRANCH }
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock simple-git instance and its methods
        mockGitInstance = {
            cwd: jest.fn().mockReturnThis(),
            init: jest.fn().mockResolvedValue(undefined),
            addRemote: jest.fn().mockResolvedValue(undefined),
            add: jest.fn().mockResolvedValue(undefined),
            commit: jest.fn().mockResolvedValue(undefined),
            push: jest.fn().mockResolvedValue(undefined),
            clone: jest.fn().mockResolvedValue(undefined),
        } as any;
        mockSimpleGit.mockReturnValue(mockGitInstance);

        // Mock fs/promises
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.readdir.mockResolvedValue([]);
        mockFs.readFile.mockResolvedValue('');
        mockFs.rm.mockResolvedValue(undefined);

        // Mock path
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.dirname.mockImplementation((p) => p.split('/').slice(0, -1).join('/'));

        // Mock process.cwd and process.env
        jest.spyOn(process, 'cwd').mockReturnValue('/app');
        process.env.GITHUB_TOKEN = MOCK_TOKEN;
        process.env.GITHUB_USERNAME = MOCK_USERNAME;

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        repository = new GitRepository(baseConfig);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided config and authenticate URL', () => {
            expect((repository as any).config).toBe(baseConfig);
            expect((repository as any).authenticatedUrl).toBe(`https://${MOCK_USERNAME}:${MOCK_TOKEN}@github.com/test-owner/test-repo.git`);
            expect((repository as any).baseDir).toBe('/app/git-plugins');
        });

        it('should use default repo URL if not provided in config', () => {
            const configWithoutUrl = { ...baseConfig, url: undefined };
            repository = new GitRepository(configWithoutUrl);
            expect((repository as any).authenticatedUrl).toBe(`https://${MOCK_USERNAME}:${MOCK_TOKEN}@github.com/your-repo.git`);
        });
    });

    describe('store', () => {
        const mockManifest: PluginManifest = {
            id: 'new-plugin',
            verb: 'NEW_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A new plugin',
            repository: { type: 'git' },
            entryPoint: { main: 'index.js', files: { 'index.js': 'console.log("hello")' } }
        };
        const expectedTempDir = '/app/temp/plugin-git-new-plugin';

        it('should store a plugin successfully', async () => {
            await repository.store(mockManifest);

            expect(mockFs.mkdir).toHaveBeenCalledWith(expectedTempDir, { recursive: true });
            expect(mockGitInstance.cwd).toHaveBeenCalledWith(expectedTempDir);
            expect(mockGitInstance.init).toHaveBeenCalledTimes(1);
            expect(mockGitInstance.addRemote).toHaveBeenCalledWith('origin', `https://${MOCK_USERNAME}:${MOCK_TOKEN}@github.com/test-owner/test-repo.git`);
            expect(mockFs.writeFile).toHaveBeenCalledWith(expectedTempDir + '/plugin-manifest.json', JSON.stringify(mockManifest, null, 2));
            expect(mockFs.writeFile).toHaveBeenCalledWith(expectedTempDir + '/index.js', 'console.log("hello")');
            expect(mockGitInstance.add).toHaveBeenCalledWith('./*');
            expect(mockGitInstance.commit).toHaveBeenCalledWith('Publishing plugin new-plugin - NEW_VERB');
            expect(mockGitInstance.push).toHaveBeenCalledWith('origin', MOCK_BRANCH, ['--force']);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Successfully pushed plugin'));
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });

        it('should not store if GitHub credentials are missing', async () => {
            process.env.GITHUB_TOKEN = '';
            await repository.store(mockManifest);
            expect(console.log).toHaveBeenCalledWith('GitHub credentials not found in environment variables');
            expect(mockFs.mkdir).not.toHaveBeenCalled();
        });

        it('should throw error if git operations fail', async () => {
            mockGitInstance.init.mockRejectedValueOnce(new Error('Git init failed'));
            await expect(repository.store(mockManifest)).rejects.toThrow('Failed to push to Git repository: Git init failed');
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });

        it('should cleanup temp directory even if operations fail', async () => {
            mockGitInstance.init.mockRejectedValueOnce(new Error('Git init failed'));
            await expect(repository.store(mockManifest)).rejects.toThrow();
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });
    });

    describe('fetch', () => {
        const mockManifest: PluginManifest = {
            id: 'fetched-plugin',
            verb: 'FETCH_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A fetched plugin',
            repository: { type: 'git' },
        };
        const expectedTempDir = '/app/temp/fetch-fetched-plugin';

        beforeEach(() => {
            mockFs.readdir.mockResolvedValueOnce(['plugin-manifest.json']);
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockManifest));
        });

        it('should fetch a plugin by ID successfully', async () => {
            const result = await repository.fetch('fetched-plugin');

            expect(mockFs.mkdir).toHaveBeenCalledWith(expectedTempDir, { recursive: true });
            expect(mockGitInstance.clone).toHaveBeenCalledWith(`https://${MOCK_USERNAME}:${MOCK_TOKEN}@github.com/test-owner/test-repo.git`, expectedTempDir);
            expect(mockGitInstance.cwd).toHaveBeenCalledWith(expectedTempDir);
            expect(mockFs.readdir).toHaveBeenCalledWith(expectedTempDir, { recursive: true });
            expect(mockFs.readFile).toHaveBeenCalledWith(expectedTempDir + '/plugin-manifest.json', 'utf-8');
            expect(result).toEqual(mockManifest);
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });

        it('should return undefined if plugin manifest not found', async () => {
            mockFs.readdir.mockResolvedValueOnce([]); // No manifest found
            const result = await repository.fetch('non-existent');
            expect(result).toBeUndefined();
        });

        it('should handle errors during fetch', async () => {
            mockGitInstance.clone.mockRejectedValueOnce(new Error('Clone failed'));
            const result = await repository.fetch('fetched-plugin');
            expect(result).toBeUndefined();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch plugin from Git repository'), expect.any(Error));
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });
    });

    describe('fetchByVerb', () => {
        const mockManifest: PluginManifest = {
            id: 'fetched-plugin',
            verb: 'FETCH_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A fetched plugin',
            repository: { type: 'git' },
        };
        const expectedTempDir = '/app/temp/fetch-FETCH_VERB';

        beforeEach(() => {
            mockFs.readdir.mockResolvedValueOnce(['plugin-manifest.json']);
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockManifest));
        });

        it('should fetch a plugin by verb successfully', async () => {
            const result = await repository.fetchByVerb('FETCH_VERB');

            expect(mockFs.mkdir).toHaveBeenCalledWith(expectedTempDir, { recursive: true });
            expect(mockGitInstance.clone).toHaveBeenCalledWith(`https://${MOCK_USERNAME}:${MOCK_TOKEN}@github.com/test-owner/test-repo.git`, expectedTempDir);
            expect(mockGitInstance.cwd).toHaveBeenCalledWith(expectedTempDir);
            expect(mockFs.readdir).toHaveBeenCalledWith(expectedTempDir, { recursive: true });
            expect(mockFs.readFile).toHaveBeenCalledWith(expectedTempDir + '/plugin-manifest.json', 'utf-8');
            expect(result).toEqual(mockManifest);
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });

        it('should return undefined if plugin manifest not found by verb', async () => {
            mockFs.readdir.mockResolvedValueOnce([]); // No manifest found
            const result = await repository.fetchByVerb('non-existent-verb');
            expect(result).toBeUndefined();
        });

        it('should handle errors during fetchByVerb', async () => {
            mockGitInstance.clone.mockRejectedValueOnce(new Error('Clone failed'));
            const result = await repository.fetchByVerb('FETCH_VERB');
            expect(result).toBeUndefined();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch plugin from Git repository'), expect.any(Error));
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });
    });

    describe('delete', () => {
        const mockManifest: PluginManifest = {
            id: 'plugin-to-delete',
            verb: 'DELETE_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A plugin to delete',
            repository: { type: 'git' },
        };
        const expectedTempDir = '/app/temp/delete-plugin-to-delete';
        const pluginDirToDelete = '/app/temp/delete-plugin-to-delete/plugins/plugin-to-delete';

        beforeEach(() => {
            mockFs.readdir.mockResolvedValueOnce(['plugins/plugin-to-delete/plugin-manifest.json']);
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockManifest));
            mockPath.dirname.mockImplementationOnce(() => pluginDirToDelete);
        });

        it('should delete a plugin successfully', async () => {
            await repository.delete('plugin-to-delete');

            expect(mockFs.mkdir).toHaveBeenCalledWith(expectedTempDir, { recursive: true });
            expect(mockGitInstance.clone).toHaveBeenCalledWith(`https://${MOCK_USERNAME}:${MOCK_TOKEN}@github.com/test-owner/test-repo.git`, expectedTempDir);
            expect(mockGitInstance.cwd).toHaveBeenCalledWith(expectedTempDir);
            expect(mockFs.readdir).toHaveBeenCalledWith(expectedTempDir, { recursive: true });
            expect(mockFs.rm).toHaveBeenCalledWith(pluginDirToDelete, { recursive: true });
            expect(mockGitInstance.add).toHaveBeenCalledWith('./*');
            expect(mockGitInstance.commit).toHaveBeenCalledWith('Deleted plugin plugin-to-delete');
            expect(mockGitInstance.push).toHaveBeenCalledWith('origin', MOCK_BRANCH);
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });

        it('should not delete if ID is not provided', async () => {
            await repository.delete('');
            expect(console.log).toHaveBeenCalledWith('ID must be provided');
            expect(mockFs.mkdir).not.toHaveBeenCalled();
        });

        it('should not delete if plugin not found', async () => {
            mockFs.readdir.mockResolvedValueOnce([]); // No manifest found
            await repository.delete('non-existent');
            expect(console.log).toHaveBeenCalledWith('Plugin with ID non-existent not found');
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });

        it('should handle errors during delete', async () => {
            mockGitInstance.clone.mockRejectedValueOnce(new Error('Clone failed'));
            await expect(repository.delete('plugin-to-delete')).rejects.toThrow('Failed to delete plugin from Git repository: Clone failed');
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });
    });

    describe('list', () => {
        const mockManifest1: PluginManifest = {
            id: 'plugin1',
            verb: 'VERB1',
            language: 'js',
            version: '1.0.0',
            description: 'Desc1',
            repository: { type: 'git' },
        };
        const mockManifest2: PluginManifest = {
            id: 'plugin2',
            verb: 'VERB2',
            language: 'py',
            version: '2.0.0',
            description: 'Desc2',
            repository: { type: 'git' },
        };
        const expectedTempDir = '/app/temp/list-plugins';

        beforeEach(() => {
            mockFs.readdir.mockResolvedValueOnce(['plugin1/plugin-manifest.json', 'plugin2/plugin-manifest.json']);
            mockFs.readFile.mockImplementation((p) => {
                if (p.includes('plugin1')) return JSON.stringify(mockManifest1);
                if (p.includes('plugin2')) return JSON.stringify(mockManifest2);
                return '{}';
            });
        });

        it('should list all plugins successfully', async () => {
            const locators = await repository.list();

            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true }); // Proactive cleanup
            expect(mockFs.mkdir).toHaveBeenCalledWith(expectedTempDir, { recursive: true });
            expect(mockGitInstance.clone).toHaveBeenCalledWith(`https://${MOCK_USERNAME}:${MOCK_TOKEN}@github.com/test-owner/test-repo.git`, expectedTempDir);
            expect(mockGitInstance.cwd).toHaveBeenCalledWith(expectedTempDir);
            expect(mockFs.readdir).toHaveBeenCalledWith(expectedTempDir, { recursive: true });
            expect(locators).toEqual([
                expect.objectContaining({ id: 'plugin1', verb: 'VERB1' }),
                expect.objectContaining({ id: 'plugin2', verb: 'VERB2' }),
            ]);
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true }); // Final cleanup
        });

        it('should handle errors during list', async () => {
            mockGitInstance.clone.mockRejectedValueOnce(new Error('Clone failed'));
            const locators = await repository.list();
            expect(locators).toEqual([]);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to list plugins from Git repository'), expect.any(Error));
            expect(mockFs.rm).toHaveBeenCalledWith(expectedTempDir, { recursive: true, force: true });
        });

        it('should handle invalid manifest files during list', async () => {
            mockFs.readdir.mockResolvedValueOnce(['plugin1/plugin-manifest.json', 'invalid-manifest.json']);
            mockFs.readFile.mockImplementation((p) => {
                if (p.includes('plugin1')) return JSON.stringify(mockManifest1);
                if (p.includes('invalid-manifest')) return 'invalid json';
                return '{}';
            });

            const locators = await repository.list();
            expect(locators).toEqual([
                expect.objectContaining({ id: 'plugin1', verb: 'VERB1' }),
            ]);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to parse manifest file'), expect.any(Error));
        });
    });
});
