import { PluginRegistry } from '../src/utils/pluginRegistry';
import { PluginMarketplace } from '@cktmcs/marketplace';
import { PluginManifest, PluginLocator, PluginRepositoryType } from '@cktmcs/shared';
import path from 'path';
import os from 'os';
import fs from 'fs/promises';
import * as fsSync from 'fs';
import { promisify } from 'util';
import { exec } from 'child_process';

// Mock external dependencies
jest.mock('@cktmcs/marketplace');
jest.mock('fs/promises');
jest.mock('fs');
jest.mock('child_process', () => ({
    exec: jest.fn(),
}));

const mockExecAsync = promisify(exec) as jest.Mock;

// Mock PluginMarketplace methods
const mockPluginMarketplaceInstance = {
    initialize: jest.fn().mockResolvedValue(undefined),
    getRepositories: jest.fn(),
    list: jest.fn(),
    fetchOne: jest.fn(),
    fetchOneByVerb: jest.fn(),
    fetchAllVersionsOfPlugin: jest.fn(),
    store: jest.fn(),
    delete: jest.fn(),
};

// Mock the constructor of PluginMarketplace to return our mock instance
(PluginMarketplace as jest.Mock).mockImplementation(() => mockPluginMarketplaceInstance);

describe('PluginRegistry', () => {
    let pluginRegistry: PluginRegistry;

    beforeEach(() => {
        jest.clearAllMocks();
        // Reset the singleton instance if PluginRegistry were a singleton
        // But it's not, so we just create a new instance

        // Set up default mock for getRepositories for refreshCache during initialization
        mockPluginMarketplaceInstance.getRepositories.mockReturnValue(new Map());
        mockPluginMarketplaceInstance.list.mockResolvedValue([]);
        mockPluginMarketplaceInstance.fetchOne.mockResolvedValue(undefined);
        mockPluginMarketplaceInstance.fetchOneByVerb.mockResolvedValue(undefined);
        mockPluginMarketplaceInstance.fetchAllVersionsOfPlugin.mockResolvedValue(undefined);

        pluginRegistry = new PluginRegistry();
    });

    describe('constructor', () => {
        it('should initialize cache, verbIndex, and PluginMarketplace', () => {
            expect((pluginRegistry as any).cache).toBeInstanceOf(Map);
            expect((pluginRegistry as any).verbIndex).toBeInstanceOf(Map);
            expect(PluginMarketplace).toHaveBeenCalledTimes(1);
            expect((pluginRegistry as any).pluginMarketplace).toBe(mockPluginMarketplaceInstance);
        });

        it('should call initialize during construction', () => {
            // initialize is called in constructor, so it should be called once
            expect(mockPluginMarketplaceInstance.getRepositories).toHaveBeenCalled();
        });

        it('should set currentDir correctly', () => {
            // This test might be brittle if run in different environments
            // For now, we'll check if it contains a plausible path segment
            expect(pluginRegistry.currentDir).toContain(path.join('services', 'capabilitiesmanager', 'src'));
        });

        it('should throw error if pluginMarketplace is invalid', () => {
            (PluginMarketplace as jest.Mock).mockImplementationOnce(() => null); // Simulate invalid marketplace
            expect(() => new PluginRegistry()).toThrow('PluginRegistry: pluginMarketplace is not initialized or invalid.');
        });
    });

    describe('initialize', () => {
        it('should call refreshCache', async () => {
            const refreshCacheSpy = jest.spyOn(pluginRegistry as any, 'refreshCache');
            // Re-instantiate to ensure initialize is called
            pluginRegistry = new PluginRegistry();
            expect(refreshCacheSpy).toHaveBeenCalled();
        });

        it('should log success on successful initialization', async () => {
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
            // Re-instantiate to ensure initialize is called
            pluginRegistry = new PluginRegistry();
            expect(consoleLogSpy).toHaveBeenCalledWith("PluginRegistry initialized and cache populated.");
            consoleLogSpy.mockRestore();
        });

        it('should log error on failed initialization', async () => {
            mockPluginMarketplaceInstance.getRepositories.mockImplementationOnce(() => {
                throw new Error('Marketplace init error');
            });
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
            // Re-instantiate to ensure initialize is called
            pluginRegistry = new PluginRegistry();
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                "PluginRegistry.initialize: Failed to refresh plugin cache during initialization",
                expect.any(Error)
            );
            consoleErrorSpy.mockRestore();
        });
    });

    describe('getPluginMarketplace', () => {
        it('should return the pluginMarketplace instance', () => {
            expect(pluginRegistry.getPluginMarketplace()).toBe(mockPluginMarketplaceInstance);
        });
    });

    describe('updatePluginMarketplace', () => {
        it('should update the pluginMarketplace instance and refresh cache', async () => {
            const newMarketplace = new PluginMarketplace();
            const refreshCacheSpy = jest.spyOn(pluginRegistry as any, 'refreshCache');
            pluginRegistry.updatePluginMarketplace(newMarketplace);
            expect((pluginRegistry as any).pluginMarketplace).toBe(newMarketplace);
            expect(refreshCacheSpy).toHaveBeenCalled();
        });
    });

    describe('fetchOne', () => {
        it('should fetch a plugin by ID', async () => {
            const mockManifest: PluginManifest = { id: 'test-plugin', verb: 'TEST_VERB', language: 'javascript', repository: { type: 'local' } };
            mockPluginMarketplaceInstance.fetchOne.mockResolvedValueOnce(mockManifest);

            const result = await pluginRegistry.fetchOne('test-plugin');
            expect(result).toBe(mockManifest);
            expect(mockPluginMarketplaceInstance.fetchOne).toHaveBeenCalledWith('test-plugin', undefined, undefined);
        });

        it('should return undefined if fetch fails', async () => {
            mockPluginMarketplaceInstance.fetchOne.mockRejectedValueOnce(new Error('Fetch error'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await pluginRegistry.fetchOne('non-existent');
            expect(result).toBeUndefined();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('fetchOne failed'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('fetchOneByVerb', () => {
        it('should fetch a plugin by verb', async () => {
            const mockManifest: PluginManifest = { id: 'verb-plugin', verb: 'VERB_TEST', language: 'python', repository: { type: 'local' } };
            mockPluginMarketplaceInstance.fetchOneByVerb.mockResolvedValueOnce(mockManifest);

            const result = await pluginRegistry.fetchOneByVerb('VERB_TEST');
            expect(result).toBe(mockManifest);
            expect(mockPluginMarketplaceInstance.fetchOneByVerb).toHaveBeenCalledWith('VERB_TEST');
        });

        it('should return undefined if fetch by verb fails', async () => {
            mockPluginMarketplaceInstance.fetchOneByVerb.mockRejectedValueOnce(new Error('Fetch verb error'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await pluginRegistry.fetchOneByVerb('NON_EXISTENT_VERB');
            expect(result).toBeUndefined();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('fetchOneByVerb failed'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });

        it('should use verbIndex if available', async () => {
            // Manually populate verbIndex for this test
            (pluginRegistry as any).verbIndex.set('CACHED_VERB', 'cached-plugin-id');
            (pluginRegistry as any).cache.set('cached-plugin-id', 'local' as PluginRepositoryType);

            const mockManifest: PluginManifest = { id: 'cached-plugin-id', verb: 'CACHED_VERB', language: 'javascript', repository: { type: 'local' } };
            mockPluginMarketplaceInstance.fetchOne.mockResolvedValueOnce(mockManifest);

            const result = await pluginRegistry.fetchOneByVerb('CACHED_VERB');
            expect(result).toBe(mockManifest);
            expect(mockPluginMarketplaceInstance.fetchOne).toHaveBeenCalledWith('cached-plugin-id', undefined, 'local');
            expect(mockPluginMarketplaceInstance.fetchOneByVerb).not.toHaveBeenCalled(); // Should not call this if found in cache
        });
    });

    describe('fetchAllVersionsOfPlugin', () => {
        it('should fetch and sort all versions of a plugin by ID', async () => {
            const mockManifests: PluginManifest[] = [
                { id: 'plugin-id', verb: 'TEST', language: 'js', version: '1.0.0', repository: { type: 'local' } },
                { id: 'plugin-id', verb: 'TEST', language: 'js', version: '1.1.0', repository: { type: 'local' } },
                { id: 'plugin-id', verb: 'TEST', language: 'js', version: '0.9.0', repository: { type: 'local' } },
            ];
            mockPluginMarketplaceInstance.fetchAllVersionsOfPlugin.mockResolvedValueOnce(mockManifests);

            const result = await pluginRegistry.fetchAllVersionsOfPlugin('plugin-id');
            expect(result).toEqual([
                { id: 'plugin-id', verb: 'TEST', language: 'js', version: '1.1.0', repository: { type: 'local' } },
                { id: 'plugin-id', verb: 'TEST', language: 'js', version: '1.0.0', repository: { type: 'local' } },
                { id: 'plugin-id', verb: 'TEST', language: 'js', version: '0.9.0', repository: { type: 'local' } },
            ]);
            expect(mockPluginMarketplaceInstance.fetchAllVersionsOfPlugin).toHaveBeenCalledWith('plugin-id', undefined);
        });

        it('should return undefined if no versions are found', async () => {
            mockPluginMarketplaceInstance.fetchAllVersionsOfPlugin.mockResolvedValueOnce([]);
            const result = await pluginRegistry.fetchAllVersionsOfPlugin('non-existent');
            expect(result).toBeUndefined();
        });

        it('should return undefined if fetching versions fails', async () => {
            mockPluginMarketplaceInstance.fetchAllVersionsOfPlugin.mockRejectedValueOnce(new Error('Fetch all versions error'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await pluginRegistry.fetchAllVersionsOfPlugin('error-plugin');
            expect(result).toBeUndefined();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Error fetching all versions'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('fetchAllVersionsByVerb', () => {
        it('should fetch all versions of a plugin by verb', async () => {
            const mockManifest: PluginManifest = { id: 'verb-plugin-id', verb: 'VERB_ALL', language: 'js', repository: { type: 'local' } };
            const mockManifests: PluginManifest[] = [
                { id: 'verb-plugin-id', verb: 'VERB_ALL', language: 'js', version: '1.0.0', repository: { type: 'local' } },
                { id: 'verb-plugin-id', verb: 'VERB_ALL', language: 'js', version: '1.1.0', repository: { type: 'local' } },
            ];
            mockPluginMarketplaceInstance.fetchOneByVerb.mockResolvedValueOnce(mockManifest);
            mockPluginMarketplaceInstance.fetchAllVersionsOfPlugin.mockResolvedValueOnce(mockManifests);

            const result = await pluginRegistry.fetchAllVersionsByVerb('VERB_ALL');
            expect(result).toEqual([
                { id: 'verb-plugin-id', verb: 'VERB_ALL', language: 'js', version: '1.1.0', repository: { type: 'local' } },
                { id: 'verb-plugin-id', verb: 'VERB_ALL', language: 'js', version: '1.0.0', repository: { type: 'local' } },
            ]);
            expect(mockPluginMarketplaceInstance.fetchOneByVerb).toHaveBeenCalledWith('VERB_ALL');
            expect(mockPluginMarketplaceInstance.fetchAllVersionsOfPlugin).toHaveBeenCalledWith('verb-plugin-id', undefined);
        });

        it('should return undefined if no plugin found for verb', async () => {
            mockPluginMarketplaceInstance.fetchOneByVerb.mockResolvedValueOnce(undefined);
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await pluginRegistry.fetchAllVersionsByVerb('UNKNOWN_VERB');
            expect(result).toBeUndefined();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('No plugin found for verb'));
            consoleWarnSpy.mockRestore();
        });

        it('should return undefined if fetching all versions fails', async () => {
            const mockManifest: PluginManifest = { id: 'verb-plugin-id', verb: 'VERB_ALL', language: 'js', repository: { type: 'local' } };
            mockPluginMarketplaceInstance.fetchOneByVerb.mockResolvedValueOnce(mockManifest);
            mockPluginMarketplaceInstance.fetchAllVersionsOfPlugin.mockRejectedValueOnce(new Error('Fetch all versions by verb error'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await pluginRegistry.fetchAllVersionsByVerb('ERROR_VERB');
            expect(result).toBeUndefined();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('fetchAllVersionsByVerb failed'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('findOne', () => {
        it('should find a plugin by ID, checking cache first', async () => {
            // Manually populate cache for this test
            (pluginRegistry as any).cache.set('cached-plugin-id', 'local' as PluginRepositoryType);

            const mockManifest: PluginManifest = { id: 'cached-plugin-id', verb: 'CACHED_FIND', language: 'javascript', repository: { type: 'local' } };
            mockPluginMarketplaceInstance.fetchOne.mockResolvedValueOnce(mockManifest);

            const result = await pluginRegistry.findOne('cached-plugin-id');
            expect(result).toBe(mockManifest);
            expect(mockPluginMarketplaceInstance.fetchOne).toHaveBeenCalledWith('cached-plugin-id', undefined, 'local');
        });

        it('should find a plugin by ID if not in cache', async () => {
            const mockManifest: PluginManifest = { id: 'new-plugin-id', verb: 'NEW_FIND', language: 'python', repository: { type: 'local' } };
            mockPluginMarketplaceInstance.fetchOne.mockResolvedValueOnce(mockManifest);

            const result = await pluginRegistry.findOne('new-plugin-id');
            expect(result).toBe(mockManifest);
            expect(mockPluginMarketplaceInstance.fetchOne).toHaveBeenCalledWith('new-plugin-id', undefined);
        });

        it('should return undefined if find fails', async () => {
            mockPluginMarketplaceInstance.fetchOne.mockRejectedValueOnce(new Error('Find error'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await pluginRegistry.findOne('non-existent');
            expect(result).toBeUndefined();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('findOne failed'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('store', () => {
        it('should store a plugin', async () => {
            const mockManifest: PluginManifest = { id: 'store-plugin', verb: 'STORE_VERB', language: 'js', repository: { type: 'local' } };
            mockPluginMarketplaceInstance.store.mockResolvedValueOnce(undefined);

            await pluginRegistry.store(mockManifest);
            expect(mockPluginMarketplaceInstance.store).toHaveBeenCalledWith(mockManifest);
        });

        it('should log warning if store fails', async () => {
            const mockManifest: PluginManifest = { id: 'store-fail', verb: 'STORE_FAIL', language: 'js', repository: { type: 'local' } };
            mockPluginMarketplaceInstance.store.mockRejectedValueOnce(new Error('Store error'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await pluginRegistry.store(mockManifest);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('store failed'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('delete', () => {
        it('should delete a plugin', async () => {
            mockPluginMarketplaceInstance.delete.mockResolvedValueOnce(undefined);

            await pluginRegistry.delete('delete-plugin', '1.0.0', 'local' as PluginRepositoryType);
            expect(mockPluginMarketplaceInstance.delete).toHaveBeenCalledWith('delete-plugin', '1.0.0', 'local');
        });

        it('should log warning if delete fails', async () => {
            mockPluginMarketplaceInstance.delete.mockRejectedValueOnce(new Error('Delete error'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await pluginRegistry.delete('delete-fail');
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('delete failed'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('getActiveRepositories', () => {
        it('should return active repositories with labels', () => {
            mockPluginMarketplaceInstance.getRepositories.mockReturnValue(new Map([
                ['local', {} as any],
                ['github', {} as any],
                ['unknown', {} as any],
            ]));

            const result = pluginRegistry.getActiveRepositories();
            expect(result).toEqual([
                { type: 'local', label: 'Local' },
                { type: 'github', label: 'GitHub' },
                { type: 'unknown', label: 'unknown' },
            ]);
        });
    });

    describe('list', () => {
        it('should list all plugins if no repositoryType is specified', async () => {
            const mockLocators: PluginLocator[] = [
                { id: 'p1', verb: 'V1', repository: { type: 'local' } },
                { id: 'p2', verb: 'V2', repository: { type: 'github' } },
            ];
            mockPluginMarketplaceInstance.list.mockResolvedValueOnce(mockLocators);

            const result = await pluginRegistry.list();
            expect(result).toEqual(mockLocators);
            expect(mockPluginMarketplaceInstance.list).toHaveBeenCalledWith(undefined);
        });

        it('should list plugins filtered by repositoryType', async () => {
            const mockLocators: PluginLocator[] = [
                { id: 'p1', verb: 'V1', repository: { type: 'local' } },
                { id: 'p2', verb: 'V2', repository: { type: 'github' } },
            ];
            mockPluginMarketplaceInstance.list.mockResolvedValueOnce(mockLocators);

            const result = await pluginRegistry.list('local' as PluginRepositoryType);
            expect(result).toEqual([
                { id: 'p1', verb: 'V1', repository: { type: 'local' } },
            ]);
            expect(mockPluginMarketplaceInstance.list).toHaveBeenCalledWith('local');
        });

        it('should return empty array if list fails', async () => {
            mockPluginMarketplaceInstance.list.mockRejectedValueOnce(new Error('List error'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            const result = await pluginRegistry.list();
            expect(result).toEqual([]);
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('list failed'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });
    });

    describe('refreshCache (private method)', () => {
        it('should populate cache and verbIndex from repositories', async () => {
            const mockRepos = new Map([
                ['local', {
                    list: jest.fn().mockResolvedValueOnce([
                        { id: 'local-p1', verb: 'LOCAL_V1', repository: { type: 'local' } },
                    ]),
                    fetch: jest.fn().mockResolvedValueOnce({ id: 'local-p1', verb: 'LOCAL_V1', language: 'js', repository: { type: 'local' } }),
                } as any],
                ['github', {
                    list: jest.fn().mockResolvedValueOnce([
                        { id: 'github-p1', verb: 'GITHUB_V1', repository: { type: 'github' } },
                    ]),
                    fetch: jest.fn().mockResolvedValueOnce({ id: 'github-p1', verb: 'GITHUB_V1', language: 'js', repository: { type: 'github' } }),
                } as any],
            ]);
            mockPluginMarketplaceInstance.getRepositories.mockReturnValue(mockRepos);

            // Call refreshCache directly as it's private but crucial
            await (pluginRegistry as any).refreshCache();

            expect((pluginRegistry as any).cache.get('local-p1')).toBe('local');
            expect((pluginRegistry as any).verbIndex.get('LOCAL_V1')).toBe('local-p1');
            expect((pluginRegistry as any).cache.get('github-p1')).toBe('github');
            expect((pluginRegistry as any).verbIndex.get('GITHUB_V1')).toBe('github-p1');
            expect(mockRepos.get('local').list).toHaveBeenCalled();
            expect(mockRepos.get('github').list).toHaveBeenCalled();
            expect(mockRepos.get('local').fetch).toHaveBeenCalledWith('local-p1');
            expect(mockRepos.get('github').fetch).toHaveBeenCalledWith('github-p1');
        });

        it('should handle errors during repository listing', async () => {
            const mockRepos = new Map([
                ['local', {
                    list: jest.fn().mockRejectedValueOnce(new Error('Repo list error')),
                    fetch: jest.fn(),
                } as any],
            ]);
            mockPluginMarketplaceInstance.getRepositories.mockReturnValue(mockRepos);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await (pluginRegistry as any).refreshCache();

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to list plugins from local repository'), expect.any(Error));
            expect((pluginRegistry as any).cache.size).toBe(0);
            expect((pluginRegistry as any).verbIndex.size).toBe(0);
            consoleErrorSpy.mockRestore();
        });

        it('should handle errors during manifest fetching', async () => {
            const mockRepos = new Map([
                ['local', {
                    list: jest.fn().mockResolvedValueOnce([
                        { id: 'local-p1', verb: 'LOCAL_V1', repository: { type: 'local' } },
                    ]),
                    fetch: jest.fn().mockRejectedValueOnce(new Error('Manifest fetch error')),
                } as any],
            ]);
            mockPluginMarketplaceInstance.getRepositories.mockReturnValue(mockRepos);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await (pluginRegistry as any).refreshCache();

            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Failed to fetch manifest for plugin local-p1'), expect.any(Error));
            expect((pluginRegistry as any).cache.size).toBe(0);
            expect((pluginRegistry as any).verbIndex.size).toBe(0);
            consoleErrorSpy.mockRestore();
        });

        it('should throw error if pluginMarketplace is invalid in refreshCache', async () => {
            (pluginRegistry as any).pluginMarketplace = null; // Simulate invalid marketplace
            await expect((pluginRegistry as any).refreshCache()).rejects.toThrow('PluginRegistry: pluginMarketplace is not initialized or invalid in refreshCache.');
        });
    });

    describe('preparePluginForExecution', () => {
        const mockManifestGit: PluginManifest = {
            id: 'git-plugin',
            verb: 'GIT_VERB',
            language: 'javascript',
            repository: { type: 'git' },
            packageSource: { type: 'git', url: 'https://github.com/test/repo.git', branch: 'main', subPath: 'src' }
        };

        const mockManifestInline: PluginManifest = {
            id: 'inline-plugin',
            verb: 'INLINE_VERB',
            language: 'javascript',
            repository: { type: 'local' }
        };

        beforeEach(() => {
            // Reset mocks for fs and child_process for each test in this describe block
            (fs.stat as jest.Mock).mockReset();
            (fs.mkdir as jest.Mock).mockReset();
            (fs.rm as jest.Mock).mockReset();
            mockExecAsync.mockReset();
            (fsSync.existsSync as jest.Mock).mockReset();
            (fsSync.readdirSync as jest.Mock).mockReset();
            (fsSync.readFileSync as jest.Mock).mockReset();
        });

        it('should prepare a git plugin by cloning if cache directory does not exist', async () => {
            (fs.stat as jest.Mock).mockRejectedValueOnce(new Error('Not found')); // Simulate dir not existing
            (fs.mkdir as jest.Mock).mockResolvedValueOnce(undefined);
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

            const result = await pluginRegistry.preparePluginForExecution(mockManifestGit);

            expect(fs.mkdir).toHaveBeenCalledWith(expect.stringContaining('.cktmcs'), { recursive: true });
            expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('git clone'));
            expect(result.pluginRootPath).toContain(path.join('.cktmcs', 'plugin_cache', 'git-plugin', 'main', 'src'));
            expect(result.effectiveManifest).toBe(mockManifestGit);
        });

        it('should prepare a git plugin by using existing cache directory', async () => {
            (fs.stat as jest.Mock).mockResolvedValueOnce({}); // Simulate dir existing

            const result = await pluginRegistry.preparePluginForExecution(mockManifestGit);

            expect(fs.mkdir).not.toHaveBeenCalled();
            expect(mockExecAsync).not.toHaveBeenCalled();
            expect(result.pluginRootPath).toContain(path.join('.cktmcs', 'plugin_cache', 'git-plugin', 'main', 'src'));
            expect(result.effectiveManifest).toBe(mockManifestGit);
        });

        it('should checkout a specific commit hash for git plugin', async () => {
            const manifestWithCommit = { ...mockManifestGit, packageSource: { ...mockManifestGit.packageSource, commitHash: 'abcdef123' } };
            (fs.stat as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
            (fs.mkdir as jest.Mock).mockResolvedValueOnce(undefined);
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' }); // For clone
            mockExecAsync.mockResolvedValueOnce({ stdout: '', stderr: '' }); // For checkout

            await pluginRegistry.preparePluginForExecution(manifestWithCommit);

            expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('git clone'));
            expect(mockExecAsync).toHaveBeenCalledWith(expect.stringContaining('git -C') && expect.stringContaining('checkout abcdef123'));
        });

        it('should handle git clone failure and clean up', async () => {
            (fs.stat as jest.Mock).mockRejectedValueOnce(new Error('Not found'));
            (fs.mkdir as jest.Mock).mockResolvedValueOnce(undefined);
            mockExecAsync.mockRejectedValueOnce(new Error('Clone failed'));
            (fs.rm as jest.Mock).mockResolvedValueOnce(undefined);
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

            await expect(pluginRegistry.preparePluginForExecution(mockManifestGit)).rejects.toThrow('Failed to prepare git plugin: Clone failed');
            expect(fs.rm).toHaveBeenCalledWith(expect.stringContaining('.cktmcs'), { recursive: true, force: true });
            expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('Error preparing git plugin'), expect.any(Error));
            consoleErrorSpy.mockRestore();
        });

        it('should prepare an inline plugin using verb name directory', async () => {
            (fsSync.existsSync as jest.Mock).mockReturnValueOnce(true); // Simulate verb-named dir exists

            const result = await pluginRegistry.preparePluginForExecution(mockManifestInline);

            expect(result.pluginRootPath).toContain(path.join('plugins', mockManifestInline.verb));
            expect(result.effectiveManifest).toBe(mockManifestInline);
        });

        it('should prepare an inline plugin by scanning if verb name directory does not exist', async () => {
            (fsSync.existsSync as jest.Mock).mockReturnValueOnce(false); // Verb-named dir does not exist
            (fsSync.readdirSync as jest.Mock).mockReturnValueOnce(['plugin-dir-1', 'plugin-dir-2']);
            (fsSync.existsSync as jest.Mock).mockReturnValueOnce(true); // manifest.json exists for plugin-dir-1
            (fsSync.readFileSync as jest.Mock).mockReturnValueOnce(JSON.stringify({ verb: 'INLINE_VERB', id: 'inline-plugin' }));

            const result = await pluginRegistry.preparePluginForExecution(mockManifestInline);

            expect(result.pluginRootPath).toContain(path.join('plugins', 'plugin-dir-1'));
            expect(result.effectiveManifest).toBe(mockManifestInline);
        });

        it('should handle invalid manifest during scanning', async () => {
            (fsSync.existsSync as jest.Mock).mockReturnValueOnce(false); // Verb-named dir does not exist
            (fsSync.readdirSync as jest.Mock).mockReturnValueOnce(['plugin-dir-invalid', 'plugin-dir-valid']);
            (fsSync.existsSync as jest.Mock).mockReturnValueOnce(true); // manifest.json exists for invalid
            (fsSync.readFileSync as jest.Mock).mockReturnValueOnce('invalid json'); // Invalid JSON
            (fsSync.existsSync as jest.Mock).mockReturnValueOnce(true); // manifest.json exists for valid
            (fsSync.readFileSync as jest.Mock).mockReturnValueOnce(JSON.stringify({ verb: 'INLINE_VERB', id: 'inline-plugin' }));

            const result = await pluginRegistry.preparePluginForExecution(mockManifestInline);

            expect(result.pluginRootPath).toContain(path.join('plugins', 'plugin-dir-valid'));
            expect(result.effectiveManifest).toBe(mockManifestInline);
        });

        it('should fall back to original path if scanning fails', async () => {
            (fsSync.existsSync as jest.Mock).mockReturnValueOnce(false); // Verb-named dir does not exist
            (fsSync.readdirSync as jest.Mock).mockImplementationOnce(() => { throw new Error('Read dir error'); });

            const result = await pluginRegistry.preparePluginForExecution(mockManifestInline);

            expect(result.pluginRootPath).toContain(path.join('plugins', mockManifestInline.verb));
            expect(result.effectiveManifest).toBe(mockManifestInline);
        });
    });
});
