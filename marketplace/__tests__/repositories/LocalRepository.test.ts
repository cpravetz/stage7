import { LocalRepository } from '../src/repositories/LocalRepository';
import { RepositoryConfig, PluginManifest, PluginLocator } from '@cktmcs/shared';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock external dependencies
jest.mock('fs/promises');
jest.mock('path');

// Cast mocked functions/modules
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;

describe('LocalRepository', () => {
    let repository: LocalRepository;
    const MOCK_BASE_DIR = '/mock/local-plugins';

    const baseConfig: RepositoryConfig = {
        type: 'local',
        options: { localPath: MOCK_BASE_DIR }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers(); // For cache TTL

        // Default mocks for fs/promises
        mockFs.mkdir.mockResolvedValue(undefined);
        mockFs.writeFile.mockResolvedValue(undefined);
        mockFs.readFile.mockResolvedValue('');
        mockFs.readdir.mockResolvedValue([]);
        mockFs.rm.mockResolvedValue(undefined);
        mockFs.access.mockResolvedValue(undefined); // File exists by default

        // Default mocks for path
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.dirname.mockImplementation((p) => p.split('/').slice(0, -1).join('/'));

        // Mock process.cwd
        jest.spyOn(process, 'cwd').mockReturnValue('/app');

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        repository = new LocalRepository(baseConfig);
    });

    afterEach(() => {
        jest.runOnlyPendingTimers();
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided base path', () => {
            expect((repository as any).baseDir).toBe(MOCK_BASE_DIR);
        });

        it('should use default base path if not provided in config', () => {
            const configWithoutPath = { ...baseConfig, options: {} };
            repository = new LocalRepository(configWithoutPath);
            expect((repository as any).baseDir).toBe('/app/plugins');
        });
    });

    describe('store', () => {
        const mockManifest: PluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A test plugin',
            repository: { type: 'local' },
            entryPoint: { main: 'index.js', files: { 'index.js': 'console.log("hello")' } }
        };
        const expectedPluginDir = '/mock/local-plugins/TEST_VERB';
        const expectedManifestPath = '/mock/local-plugins/TEST_VERB/manifest.json';
        const expectedFilePath = '/mock/local-plugins/TEST_VERB/index.js';

        it('should store a plugin manifest and its files successfully', async () => {
            await repository.store(mockManifest);

            expect(mockFs.mkdir).toHaveBeenCalledWith(expectedPluginDir, { recursive: true });
            expect(mockFs.writeFile).toHaveBeenCalledWith(expectedManifestPath, JSON.stringify(mockManifest, null, 2));
            expect(mockFs.writeFile).toHaveBeenCalledWith(expectedFilePath, 'console.log("hello")');
            expect((repository as any).manifestPathCache.get('test-plugin')).toBe(expectedManifestPath);
            expect((repository as any).manifestPathCache.get('TEST_VERB')).toBe(expectedManifestPath);
            expect((repository as any).pluginListCache).toBeNull(); // Cache invalidated
        });

        it('should throw error if directory creation fails', async () => {
            mockFs.mkdir.mockRejectedValueOnce(new Error('Dir creation failed'));
            await expect(repository.store(mockManifest)).rejects.toThrow('Failed to publish plugin to local repository: Dir creation failed');
        });

        it('should throw error if manifest write fails', async () => {
            mockFs.writeFile.mockRejectedValueOnce(new Error('Manifest write failed'));
            await expect(repository.store(mockManifest)).rejects.toThrow('Failed to publish plugin to local repository: Manifest write failed');
        });

        it('should throw error if file write fails', async () => {
            mockFs.writeFile.mockResolvedValueOnce(undefined); // Manifest write succeeds
            mockFs.writeFile.mockRejectedValueOnce(new Error('File write failed')); // File write fails
            await expect(repository.store(mockManifest)).rejects.toThrow('Failed to publish plugin to local repository: File write failed');
        });
    });

    describe('fetch', () => {
        const mockManifest: PluginManifest = {
            id: 'fetched-plugin',
            verb: 'FETCH_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A fetched plugin',
            repository: { type: 'local' },
        };
        const expectedManifestPath = '/mock/local-plugins/fetched-plugin/manifest.json';

        beforeEach(() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify(mockManifest));
        });

        it('should fetch a plugin by ID successfully', async () => {
            const plugin = await repository.fetch('fetched-plugin');

            expect(mockFs.readFile).toHaveBeenCalledWith(expectedManifestPath, 'utf-8');
            expect(plugin).toEqual(mockManifest);
            expect((repository as any).manifestPathCache.get('fetched-plugin')).toBe(expectedManifestPath);
        });

        it('should fetch a specific version of a plugin', async () => {
            const versionedManifestPath = '/mock/local-plugins/fetched-plugin/1.0.0/manifest.json';
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockManifest));

            const plugin = await repository.fetch('fetched-plugin', '1.0.0');
            expect(mockFs.readFile).toHaveBeenCalledWith(versionedManifestPath, 'utf-8');
            expect(plugin).toEqual(mockManifest);
        });

        it('should return undefined if manifest not found (ENOENT)', async () => {
            mockFs.readFile.mockRejectedValueOnce({ code: 'ENOENT' });
            const plugin = await repository.fetch('non-existent');
            expect(plugin).toBeUndefined();
        });

        it('should throw error for other read failures', async () => {
            mockFs.readFile.mockRejectedValueOnce(new Error('Read error'));
            await expect(repository.fetch('fetched-plugin')).rejects.toThrow('Read error');
        });

        it('should use cache if available', async () => {
            (repository as any).manifestPathCache.set('cached-plugin', expectedManifestPath);
            const plugin = await repository.fetch('cached-plugin');
            expect(mockFs.readFile).toHaveBeenCalledWith(expectedManifestPath, 'utf-8');
            expect(plugin).toEqual(mockManifest);
        });

        it('should fall back to iterating directories if direct path fails', async () => {
            mockFs.readFile.mockRejectedValueOnce({ code: 'ENOENT' }); // Direct path fails
            mockFs.readdir.mockResolvedValueOnce(['dir1', 'dir2']);
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify({ id: 'fetched-plugin' })); // Found in dir1

            const plugin = await repository.fetch('fetched-plugin');
            expect(plugin?.id).toBe('fetched-plugin');
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Manifest not found at direct path'));
        });
    });

    describe('fetchByVerb', () => {
        const mockManifest: PluginManifest = {
            id: 'fetched-plugin',
            verb: 'FETCH_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A fetched plugin',
            repository: { type: 'local' },
        };
        const expectedManifestPath = '/mock/local-plugins/FETCH_VERB/manifest.json';

        beforeEach(() => {
            mockFs.readFile.mockResolvedValue(JSON.stringify(mockManifest));
        });

        it('should fetch a plugin by verb successfully', async () => {
            const plugin = await repository.fetchByVerb('FETCH_VERB');

            expect(mockFs.readFile).toHaveBeenCalledWith(expectedManifestPath, 'utf-8');
            expect(plugin).toEqual(mockManifest);
            expect((repository as any).manifestPathCache.get('FETCH_VERB')).toBe(expectedManifestPath);
        });

        it('should return undefined if manifest not found by verb (ENOENT)', async () => {
            mockFs.readFile.mockRejectedValueOnce({ code: 'ENOENT' });
            const plugin = await repository.fetchByVerb('non-existent-verb');
            expect(plugin).toBeUndefined();
        });

        it('should use cache if available', async () => {
            (repository as any).manifestPathCache.set('CACHED_VERB', expectedManifestPath);
            const plugin = await repository.fetchByVerb('CACHED_VERB');
            expect(mockFs.readFile).toHaveBeenCalledWith(expectedManifestPath, 'utf-8');
            expect(plugin).toEqual(mockManifest);
        });

        it('should fall back to cached plugin list if direct path fails', async () => {
            mockFs.readFile.mockRejectedValueOnce({ code: 'ENOENT' }); // Direct path fails
            jest.spyOn(repository, 'list').mockResolvedValueOnce([
                { id: 'found-id', verb: 'FETCH_VERB', description: '', repository: { type: 'local' } }
            ]);
            jest.spyOn(repository, 'fetch').mockResolvedValueOnce(mockManifest);

            const plugin = await repository.fetchByVerb('FETCH_VERB');
            expect(plugin).toEqual(mockManifest);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Manifest not found at direct path for verb'));
            expect(repository.list).toHaveBeenCalled();
            expect(repository.fetch).toHaveBeenCalledWith('found-id');
        });

        it('should fall back to directory scan if cached list fails', async () => {
            mockFs.readFile.mockRejectedValueOnce({ code: 'ENOENT' }); // Direct path fails
            jest.spyOn(repository, 'list').mockRejectedValueOnce(new Error('List error')); // Cached list fails
            mockFs.readdir.mockResolvedValueOnce(['FETCH_VERB']);
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockManifest));

            const plugin = await repository.fetchByVerb('FETCH_VERB');
            expect(plugin).toEqual(mockManifest);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Failed to use cached plugin list'));
            expect(mockFs.readdir).toHaveBeenCalledWith(MOCK_BASE_DIR);
        });
    });

    describe('delete', () => {
        const mockManifest: PluginManifest = {
            id: 'plugin-to-delete',
            verb: 'DELETE_VERB',
            language: 'javascript',
            version: '1.0.0',
            description: 'A plugin to delete',
            repository: { type: 'local' },
        };
        const expectedPluginDir = '/mock/local-plugins/DELETE_VERB';

        beforeEach(() => {
            mockFs.readdir.mockResolvedValueOnce(['DELETE_VERB']);
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockManifest));
        });

        it('should delete a plugin successfully', async () => {
            await repository.delete('plugin-to-delete');

            expect(mockFs.readdir).toHaveBeenCalledWith(MOCK_BASE_DIR);
            expect(mockFs.readFile).toHaveBeenCalledWith(expectedPluginDir + '/manifest.json', 'utf-8');
            expect(mockFs.rm).toHaveBeenCalledWith(expectedPluginDir, { recursive: true, force: true });
            expect((repository as any).manifestPathCache.has('plugin-to-delete')).toBe(false);
            expect((repository as any).manifestPathCache.has('DELETE_VERB')).toBe(false);
            expect((repository as any).pluginListCache).toBeNull(); // Cache invalidated
        });

        it('should not delete if plugin not found', async () => {
            mockFs.readdir.mockResolvedValueOnce(['OTHER_VERB']);
            await repository.delete('non-existent');
            expect(mockFs.rm).not.toHaveBeenCalled();
        });

        it('should handle errors during delete', async () => {
            mockFs.readdir.mockRejectedValueOnce(new Error('Read dir failed'));
            await expect(repository.delete('plugin-to-delete')).rejects.toThrow('Read dir failed');
        });
    });

    describe('list', () => {
        const mockManifest1: PluginManifest = {
            id: 'plugin1',
            verb: 'VERB1',
            language: 'js',
            version: '1.0.0',
            description: 'Desc1',
            repository: { type: 'local' },
        };
        const mockManifest2: PluginManifest = {
            id: 'plugin2',
            verb: 'VERB2',
            language: 'py',
            version: '2.0.0',
            description: 'Desc2',
            repository: { type: 'local' },
        };

        beforeEach(() => {
            mockFs.readdir.mockResolvedValueOnce(['VERB1', 'VERB2']);
            mockFs.readFile.mockImplementation((p) => {
                if (p.includes('VERB1')) return JSON.stringify(mockManifest1);
                if (p.includes('VERB2')) return JSON.stringify(mockManifest2);
                return '{}';
            });
        });

        it('should list all plugins successfully and cache the result', async () => {
            const locators = await repository.list();

            expect(mockFs.readdir).toHaveBeenCalledWith(MOCK_BASE_DIR);
            expect(locators).toEqual([
                expect.objectContaining({ id: 'plugin1', verb: 'VERB1' }),
                expect.objectContaining({ id: 'plugin2', verb: 'VERB2' }),
            ]);
            expect((repository as any).pluginListCache).toEqual(locators);
            expect((repository as any).cacheTimestamp).toBeGreaterThan(0);
        });

        it('should return cached list if cache is valid', async () => {
            // Populate cache first
            await repository.list();
            mockFs.readdir.mockClear(); // Clear mock to ensure it's not called again

            const locators = await repository.list();
            expect(mockFs.readdir).not.toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('LocalRepo: Using cached plugin list');
            expect(locators.length).toBe(2);
        });

        it('should reload list if cache is expired', async () => {
            // Populate cache
            await repository.list();
            jest.advanceTimersByTime(60001); // Advance time past TTL
            mockFs.readdir.mockClear();
            mockFs.readdir.mockResolvedValueOnce(['VERB1']); // Simulate new content
            mockFs.readFile.mockResolvedValueOnce(JSON.stringify(mockManifest1));

            const locators = await repository.list();
            expect(mockFs.readdir).toHaveBeenCalledTimes(1); // Should reload
            expect(console.log).toHaveBeenCalledWith('LocalRepo: Loading fresh plugin list');
            expect(locators.length).toBe(1);
        });

        it('should handle errors during list', async () => {
            mockFs.readdir.mockRejectedValueOnce(new Error('Read dir failed'));
            const locators = await repository.list();
            expect(locators).toEqual([]);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('LocalRepo: Error loading from'), expect.any(Error));
        });

        it('should handle malformed manifest files during list', async () => {
            mockFs.readdir.mockResolvedValueOnce(['VERB1', 'MALFORMED']);
            mockFs.readFile.mockImplementation((p) => {
                if (p.includes('VERB1')) return JSON.stringify(mockManifest1);
                if (p.includes('MALFORMED')) return 'invalid json';
                return '{}';
            });

            const locators = await repository.list();
            expect(locators).toEqual([
                expect.objectContaining({ id: 'plugin1', verb: 'VERB1' }),
            ]);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Malformed manifest'));
        });

        it('should handle manifest missing required fields during list', async () => {
            const incompleteManifest = { id: 'incomplete', verb: 'INCOMPLETE', language: 'js' }; // Missing description
            mockFs.readdir.mockResolvedValueOnce(['VERB1', 'INCOMPLETE']);
            mockFs.readFile.mockImplementation((p) => {
                if (p.includes('VERB1')) return JSON.stringify(mockManifest1);
                if (p.includes('INCOMPLETE')) return JSON.stringify(incompleteManifest);
                return '{}';
            });

            const locators = await repository.list();
            expect(locators).toEqual([
                expect.objectContaining({ id: 'plugin1', verb: 'VERB1' }),
            ]);
            expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Manifest missing required fields'));
        });
    });
});
