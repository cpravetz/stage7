import { PluginRepositoryManager, RepositoryConfig, PluginRegistryEntry, PluginPackage, PackageMetadata } from '../src/utils/pluginRepositoryManager';
import { PluginPackager } from '../src/utils/pluginPackager';
import { PluginManifest } from '@cktmcs/shared';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
jest.mock('axios');
jest.mock('fs');
jest.mock('path');
jest.mock('uuid');
jest.mock('../src/utils/pluginPackager');

// Cast mocked functions/modules
const mockAxios = axios as jest.MockedFunction<typeof axios>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockUuidv4 = uuidv4 as jest.Mock;
const mockPluginPackager = PluginPackager as jest.MockedClass<typeof PluginPackager>;

describe('PluginRepositoryManager', () => {
    let manager: PluginRepositoryManager;
    let mockPackagerInstance: jest.Mocked<PluginPackager>;

    const mockConfig: RepositoryConfig = {
        owner: 'test-owner',
        repo: 'test-repo',
        token: 'test-token',
        branch: 'main',
    };

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock PluginPackager instance
        mockPackagerInstance = {
            packagePlugin: jest.fn(),
            unpackPlugin: jest.fn(),
            installDependencies: jest.fn(),
            // Add other methods if they are called
        } as any;
        mockPluginPackager.mockImplementation(() => mockPackagerInstance);

        // Default mocks for fs
        mockFs.readFileSync.mockReturnValue('{}');
        mockFs.unlinkSync.mockReturnValue(undefined);
        mockFs.createWriteStream.mockReturnValue({ on: jest.fn((event, cb) => { if (event === 'finish') cb(); }) });

        // Default mocks for path
        mockPath.join.mockImplementation((...args) => args.join('/'));

        // Default mocks for uuid
        mockUuidv4.mockReturnValue('mock-uuid');

        // Default mocks for axios
        mockAxios.get.mockResolvedValue({ data: {} });
        mockAxios.post.mockResolvedValue({ data: {} });
        mockAxios.put.mockResolvedValue({ data: {} });

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        manager = new PluginRepositoryManager(mockConfig, mockPackagerInstance);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize with provided config and packager', () => {
            expect((manager as any).config).toBe(mockConfig);
            expect((manager as any).packager).toBe(mockPackagerInstance);
            expect((manager as any).baseUrl).toBe(`https://api.github.com/repos/${mockConfig.owner}/${mockConfig.repo}`);
        });
    });

    describe('publishPlugin', () => {
        const mockPluginPath = '/mock/plugin/src';
        const mockManifest: PluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'javascript',
            description: 'A test plugin',
            repository: { type: 'local' },
        };
        const mockMetadata: PackageMetadata = {
            packageVersion: '1.0.0',
            stage7Version: '1.0.0',
            compatibility: ['1.0.0'],
            tags: ['test'],
            category: 'utility',
            license: 'MIT',
        };
        const mockPluginPackage: PluginPackage = {
            id: 'pkg-uuid',
            name: 'test-plugin',
            version: '1.0.0',
            description: 'A test plugin',
            author: 'Test Author',
            packageHash: 'mock-hash',
            createdAt: new Date(),
            manifest: mockManifest,
            dependencies: [],
        };

        beforeEach(() => {
            mockPackagerInstance.packagePlugin.mockResolvedValue(mockPluginPackage);
            jest.spyOn(manager as any, 'uploadPackageToGitHub').mockResolvedValue('http://download.url/package.s7pkg');
            jest.spyOn(manager as any, 'updatePluginRegistry').mockResolvedValue(undefined);
        });

        it('should publish a plugin successfully', async () => {
            const result = await manager.publishPlugin(mockPluginPath, mockManifest, mockMetadata);

            expect(mockPackagerInstance.packagePlugin).toHaveBeenCalledWith(mockPluginPath, mockManifest, mockMetadata);
            expect((manager as any).uploadPackageToGitHub).toHaveBeenCalledWith(mockPluginPackage);
            expect((manager as any).updatePluginRegistry).toHaveBeenCalledWith(expect.objectContaining({
                id: mockManifest.id,
                version: mockManifest.version,
                downloadUrl: 'http://download.url/package.s7pkg',
                packageHash: mockPluginPackage.packageHash,
            }));
            expect(result).toEqual(expect.objectContaining({
                id: mockManifest.id,
                version: mockManifest.version,
                downloadUrl: 'http://download.url/package.s7pkg',
            }));
        });

        it('should handle errors during publishing', async () => {
            mockPackagerInstance.packagePlugin.mockRejectedValueOnce(new Error('Packaging failed'));

            await expect(manager.publishPlugin(mockPluginPath, mockManifest, mockMetadata)).rejects.toThrow('Packaging failed');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to publish plugin'), expect.any(Error));
        });
    });

    describe('installPlugin', () => {
        const mockPluginId = 'test-plugin';
        const mockPluginVersion = '1.0.0';
        const mockRegistryEntry: PluginRegistryEntry = {
            id: mockPluginId,
            name: 'Test Plugin',
            version: mockPluginVersion,
            description: 'Desc',
            author: 'Author',
            category: 'Cat',
            tags: [],
            downloadUrl: 'http://download.url/test-plugin-1.0.0.s7pkg',
            packageHash: 'hash',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            compatibility: [],
            verified: true,
        };
        const mockManifest: PluginManifest = { id: mockPluginId, verb: 'TEST', language: 'js', repository: { type: 'local' } };

        beforeEach(() => {
            jest.spyOn(manager as any, 'getPluginRegistry').mockResolvedValue([mockRegistryEntry]);
            jest.spyOn(manager as any, 'downloadPackage').mockResolvedValue('/tmp/test-plugin-1.0.0.s7pkg');
            mockPackagerInstance.unpackPlugin.mockResolvedValue(mockManifest);
            mockPackagerInstance.installDependencies.mockResolvedValue(undefined);
        });

        it('should install a plugin successfully', async () => {
            const result = await manager.installPlugin(mockPluginId, mockPluginVersion);

            expect((manager as any).getPluginRegistry).toHaveBeenCalledTimes(1);
            expect((manager as any).downloadPackage).toHaveBeenCalledWith(mockRegistryEntry);
            expect(mockPackagerInstance.unpackPlugin).toHaveBeenCalledWith('/tmp/test-plugin-1.0.0.s7pkg', expect.stringContaining('/plugins/test-plugin'));
            expect(mockPackagerInstance.installDependencies).toHaveBeenCalledWith(expect.stringContaining('/plugins/test-plugin'));
            expect(mockFs.unlinkSync).toHaveBeenCalledWith('/tmp/test-plugin-1.0.0.s7pkg');
            expect(result).toEqual(mockManifest);
        });

        it('should install the latest version if no version specified', async () => {
            const oldEntry = { ...mockRegistryEntry, version: '0.9.0', updatedAt: new Date(0).toISOString() };
            jest.spyOn(manager as any, 'getPluginRegistry').mockResolvedValue([oldEntry, mockRegistryEntry]);

            await manager.installPlugin(mockPluginId);

            expect((manager as any).downloadPackage).toHaveBeenCalledWith(mockRegistryEntry); // Should pick 1.0.0
        });

        it('should use provided target directory', async () => {
            const customTargetDir = '/custom/install/path';
            await manager.installPlugin(mockPluginId, mockPluginVersion, customTargetDir);
            expect(mockPackagerInstance.unpackPlugin).toHaveBeenCalledWith(expect.any(String), customTargetDir);
            expect(mockPackagerInstance.installDependencies).toHaveBeenCalledWith(customTargetDir);
        });

        it('should throw error if plugin not found', async () => {
            jest.spyOn(manager as any, 'getPluginRegistry').mockResolvedValue([]);
            await expect(manager.installPlugin('non-existent')).rejects.toThrow('Plugin not found: non-existent');
        });

        it('should throw error if plugin version not found', async () => {
            await expect(manager.installPlugin(mockPluginId, '9.9.9')).rejects.toThrow('Plugin version not found: test-plugin v9.9.9');
        });

        it('should handle errors during installation', async () => {
            mockPackagerInstance.unpackPlugin.mockRejectedValueOnce(new Error('Unpack failed'));
            await expect(manager.installPlugin(mockPluginId, mockPluginVersion)).rejects.toThrow('Unpack failed');
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to install plugin'), expect.any(Error));
        });
    });

    describe('listPlugins', () => {
        const mockRegistry: PluginRegistryEntry[] = [
            { id: 'p1', name: 'Plugin A', category: 'cat1', tags: ['tag1'], version: '1.0.0', downloadUrl: '', packageHash: '', createdAt: '', updatedAt: '', author: '', description: '', compatibility: [], verified: false },
            { id: 'p2', name: 'Plugin B', category: 'cat2', tags: ['tag2'], version: '1.0.0', downloadUrl: '', packageHash: '', createdAt: '', updatedAt: '', author: '', description: '', compatibility: [], verified: false },
            { id: 'p3', name: 'Plugin C', category: 'cat1', tags: ['tag2', 'tag3'], version: '1.0.0', downloadUrl: '', packageHash: '', createdAt: '', updatedAt: '', author: '', description: '', compatibility: [], verified: false },
        ];

        beforeEach(() => {
            jest.spyOn(manager as any, 'getPluginRegistry').mockResolvedValue(mockRegistry);
        });

        it('should list all plugins if no filters', async () => {
            const result = await manager.listPlugins();
            expect(result).toEqual(mockRegistry);
        });

        it('should filter by category', async () => {
            const result = await manager.listPlugins('cat1');
            expect(result).toEqual([mockRegistry[0], mockRegistry[2]]);
        });

        it('should filter by tags', async () => {
            const result = await manager.listPlugins(undefined, ['tag2']);
            expect(result).toEqual([mockRegistry[1], mockRegistry[2]]);
        });

        it('should filter by category and tags', async () => {
            const result = await manager.listPlugins('cat1', ['tag2']);
            expect(result).toEqual([mockRegistry[2]]);
        });
    });

    describe('searchPlugins', () => {
        const mockRegistry: PluginRegistryEntry[] = [
            { id: 'p1', name: 'Searchable Plugin A', description: 'Does A things', tags: ['search', 'utility'], version: '1.0.0', downloadUrl: '', packageHash: '', createdAt: '', updatedAt: '', author: '', category: '', compatibility: [], verified: false },
            { id: 'p2', name: 'Another Plugin B', description: 'Does B things', tags: ['data'], version: '1.0.0', downloadUrl: '', packageHash: '', createdAt: '', updatedAt: '', author: '', category: '', compatibility: [], verified: false },
            { id: 'p3', name: 'Utility C', description: 'For searching', tags: ['tool'], version: '1.0.0', downloadUrl: '', packageHash: '', createdAt: '', updatedAt: '', author: '', category: '', compatibility: [], verified: false },
        ];

        beforeEach(() => {
            jest.spyOn(manager as any, 'getPluginRegistry').mockResolvedValue(mockRegistry);
        });

        it('should search by name', async () => {
            const result = await manager.searchPlugins('searchable');
            expect(result).toEqual([mockRegistry[0]]);
        });

        it('should search by description', async () => {
            const result = await manager.searchPlugins('things');
            expect(result).toEqual([mockRegistry[0], mockRegistry[1]]);
        });

        it('should search by tags', async () => {
            const result = await manager.searchPlugins('data');
            expect(result).toEqual([mockRegistry[1]]);
        });

        it('should return empty array if no match', async () => {
            const result = await manager.searchPlugins('nonexistent');
            expect(result).toEqual([]);
        });
    });

    describe('getPluginInfo', () => {
        const mockRegistry: PluginRegistryEntry[] = [
            { id: 'p1', name: 'Plugin A', version: '1.0.0', updatedAt: new Date(2023, 0, 1).toISOString(), downloadUrl: '', packageHash: '', createdAt: '', author: '', category: '', description: '', tags: [], compatibility: [], verified: false },
            { id: 'p1', name: 'Plugin A', version: '1.1.0', updatedAt: new Date(2023, 0, 15).toISOString(), downloadUrl: '', packageHash: '', createdAt: '', author: '', category: '', description: '', tags: [], compatibility: [], verified: false },
            { id: 'p2', name: 'Plugin B', version: '2.0.0', updatedAt: new Date(2023, 1, 1).toISOString(), downloadUrl: '', packageHash: '', createdAt: '', author: '', category: '', description: '', tags: [], compatibility: [], verified: false },
        ];

        beforeEach(() => {
            jest.spyOn(manager as any, 'getPluginRegistry').mockResolvedValue(mockRegistry);
        });

        it('should return null if plugin not found', async () => {
            const result = await manager.getPluginInfo('nonexistent');
            expect(result).toBeNull();
        });

        it('should return specific version if provided', async () => {
            const result = await manager.getPluginInfo('p1', '1.0.0');
            expect(result).toEqual(mockRegistry[0]);
        });

        it('should return latest version if no version provided', async () => {
            const result = await manager.getPluginInfo('p1');
            expect(result).toEqual(mockRegistry[1]); // 1.1.0 is latest
        });
    });

    describe('checkForUpdates', () => {
        const mockRegistry: PluginRegistryEntry[] = [
            { id: 'p1', version: '1.1.0', updatedAt: new Date(2023, 0, 15).toISOString(), downloadUrl: '', packageHash: '', createdAt: '', author: '', category: '', description: '', tags: [], compatibility: [], verified: false },
            { id: 'p2', version: '2.0.0', updatedAt: new Date(2023, 1, 1).toISOString(), downloadUrl: '', packageHash: '', createdAt: '', author: '', category: '', description: '', tags: [], compatibility: [], verified: false },
            { id: 'p3', version: '3.0.0', updatedAt: new Date(2023, 2, 1).toISOString(), downloadUrl: '', packageHash: '', createdAt: '', author: '', category: '', description: '', tags: [], compatibility: [], verified: false },
        ];

        beforeEach(() => {
            jest.spyOn(manager as any, 'getPluginRegistry').mockResolvedValue(mockRegistry);
        });

        it('should identify available updates', async () => {
            const installedPlugins = [
                { id: 'p1', currentVersion: '1.0.0' },
                { id: 'p2', currentVersion: '2.0.0' },
                { id: 'p3', currentVersion: '2.5.0' },
                { id: 'p4', currentVersion: '1.0.0' }, // Not in registry
            ];

            const updates = await manager.checkForUpdates(installedPlugins);

            expect(updates).toEqual([
                { id: 'p1', currentVersion: '1.0.0', latestVersion: '1.1.0', updateAvailable: true },
                { id: 'p3', currentVersion: '2.5.0', latestVersion: '3.0.0', updateAvailable: true },
            ]);
        });

        it('should identify no updates available', async () => {
            const installedPlugins = [
                { id: 'p1', currentVersion: '1.1.0' },
                { id: 'p2', currentVersion: '2.0.0' },
            ];

            const updates = await manager.checkForUpdates(installedPlugins);

            expect(updates).toEqual([
                { id: 'p1', currentVersion: '1.1.0', latestVersion: '1.1.0', updateAvailable: false },
                { id: 'p2', currentVersion: '2.0.0', latestVersion: '2.0.0', updateAvailable: false },
            ]);
        });
    });

    describe('Private Helper Methods', () => {
        describe('uploadPackageToGitHub', () => {
            const mockPluginPackage: PluginPackage = {
                id: 'pkg-uuid',
                name: 'test-plugin',
                version: '1.0.0',
                description: 'A test plugin',
                author: 'Test Author',
                packageHash: 'mock-hash',
                createdAt: new Date(),
                manifest: {} as PluginManifest,
                dependencies: [],
            };
            const expectedPackageName = 'test-plugin-1.0.0.s7pkg';
            const expectedPackagePath = '/packages/test-plugin-1.0.0.s7pkg';

            beforeEach(() => {
                mockFs.readFileSync.mockReturnValue(Buffer.from('package data'));
                mockAxios.post.mockResolvedValueOnce({ data: { id: 123, upload_url: 'https://uploads.github.com/repos/test-owner/test-repo/releases/123/assets{?name,label}' } }); // Create release
                mockAxios.post.mockResolvedValueOnce({ data: { browser_download_url: 'http://download.url/asset.s7pkg' } }); // Upload asset
            });

            it('should create a release and upload package as asset', async () => {
                const downloadUrl = await (manager as any).uploadPackageToGitHub(mockPluginPackage);

                expect(mockAxios.post).toHaveBeenCalledWith(
                    `https://api.github.com/repos/test-owner/test-repo/releases`,
                    expect.objectContaining({ tag_name: 'test-plugin-v1.0.0', name: 'test-plugin v1.0.0' }),
                    expect.any(Object)
                );
                expect(mockAxios.post).toHaveBeenCalledWith(
                    `https://uploads.github.com/repos/test-owner/test-repo/releases/123/assets?name=${expectedPackageName}`,
                    Buffer.from('package data'),
                    expect.any(Object)
                );
                expect(downloadUrl).toBe('http://download.url/asset.s7pkg');
            });
        });

        describe('updatePluginRegistry', () => {
            const mockEntry: PluginRegistryEntry = {
                id: 'new-plugin',
                name: 'New Plugin',
                version: '1.0.0',
                description: '',
                author: '',
                category: '',
                tags: [],
                downloadUrl: '',
                packageHash: '',
                createdAt: '',
                updatedAt: '',
                compatibility: [],
                verified: false,
            };

            beforeEach(() => {
                jest.spyOn(manager as any, 'getPluginRegistry').mockResolvedValue([]);
                jest.spyOn(manager as any, 'uploadFileToGitHub').mockResolvedValue(undefined);
            });

            it('should add a new entry to the registry', async () => {
                await (manager as any).updatePluginRegistry(mockEntry);
                expect((manager as any).uploadFileToGitHub).toHaveBeenCalledWith('registry.json', JSON.stringify([mockEntry], null, 2));
            });

            it('should update an existing entry in the registry', async () => {
                const existingEntry = { ...mockEntry, description: 'Old description' };
                jest.spyOn(manager as any, 'getPluginRegistry').mockResolvedValue([existingEntry]);

                const updatedEntry = { ...mockEntry, description: 'New description' };
                await (manager as any).updatePluginRegistry(updatedEntry);

                expect((manager as any).uploadFileToGitHub).toHaveBeenCalledWith('registry.json', JSON.stringify([updatedEntry], null, 2));
            });
        });

        describe('getPluginRegistry', () => {
            it('should fetch and parse registry.json', async () => {
                const mockContent = JSON.stringify([{ id: 'p1' }]);
                mockAxios.get.mockResolvedValueOnce({ data: { content: Buffer.from(mockContent).toString('base64') } });

                const registry = await (manager as any).getPluginRegistry();
                expect(registry).toEqual([{ id: 'p1' }]);
                expect(mockAxios.get).toHaveBeenCalledWith(expect.stringContaining('/contents/registry.json'), expect.any(Object));
            });

            it('should return empty array if registry.json not found (404)', async () => {
                mockAxios.get.mockRejectedValueOnce({ response: { status: 404 } });

                const registry = await (manager as any).getPluginRegistry();
                expect(registry).toEqual([]);
            });

            it('should throw error for other fetch failures', async () => {
                mockAxios.get.mockRejectedValueOnce(new Error('Network error'));

                await expect((manager as any).getPluginRegistry()).rejects.toThrow('Network error');
            });
        });

        describe('uploadFileToGitHub', () => {
            const mockFilename = 'test-file.txt';
            const mockContent = 'file content';
            const encodedContent = Buffer.from(mockContent).toString('base64');

            it('should upload a new file', async () => {
                mockAxios.get.mockRejectedValueOnce({ response: { status: 404 } }); // File does not exist
                mockAxios.put.mockResolvedValueOnce({});

                await (manager as any).uploadFileToGitHub(mockFilename, mockContent);

                expect(mockAxios.put).toHaveBeenCalledWith(
                    `https://api.github.com/repos/test-owner/test-repo/contents/${mockFilename}`,
                    expect.objectContaining({
                        message: `Update ${mockFilename}`,
                        content: encodedContent,
                        branch: 'main',
                        sha: undefined,
                    }),
                    expect.any(Object)
                );
            });

            it('should update an existing file with SHA', async () => {
                mockAxios.get.mockResolvedValueOnce({ data: { sha: 'existing-sha' } });
                mockAxios.put.mockResolvedValueOnce({});

                await (manager as any).uploadFileToGitHub(mockFilename, mockContent);

                expect(mockAxios.put).toHaveBeenCalledWith(
                    `https://api.github.com/repos/test-owner/test-repo/contents/${mockFilename}`,
                    expect.objectContaining({
                        sha: 'existing-sha',
                    }),
                    expect.any(Object)
                );
            });
        });

        describe('downloadPackage', () => {
            const mockEntry: PluginRegistryEntry = {
                id: 'p1', name: 'p1', version: '1.0.0', downloadUrl: 'http://download.url/package.s7pkg', packageHash: '', createdAt: '', updatedAt: '', author: '', category: '', description: '', tags: [], compatibility: [], verified: false
            };
            const mockPackagePath = '/temp/p1-1.0.0.s7pkg';

            it('should download package and write to file', async () => {
                const mockStream = { pipe: jest.fn() };
                mockAxios.get.mockResolvedValueOnce({ data: mockStream, responseType: 'stream' });

                const result = await (manager as any).downloadPackage(mockEntry);

                expect(mockAxios.get).toHaveBeenCalledWith(mockEntry.downloadUrl, { responseType: 'stream' });
                expect(mockFs.createWriteStream).toHaveBeenCalledWith(mockPackagePath);
                expect(mockStream.pipe).toHaveBeenCalledWith(mockFs.createWriteStream());
                expect(result).toBe(mockPackagePath);
            });

            it('should reject if writer emits error', async () => {
                const mockStream = { pipe: jest.fn() };
                mockAxios.get.mockResolvedValueOnce({ data: mockStream, responseType: 'stream' });
                mockFs.createWriteStream.mockReturnValueOnce({ on: jest.fn((event, cb) => { if (event === 'error') cb(new Error('Write error')); }) });

                await expect((manager as any).downloadPackage(mockEntry)).rejects.toThrow('Write error');
            });
        });

        describe('isNewerVersion', () => {
            it('should return true for newer major version', () => {
                expect((manager as any).isNewerVersion('2.0.0', '1.0.0')).toBe(true);
            });

            it('should return true for newer minor version', () => {
                expect((manager as any).isNewerVersion('1.1.0', '1.0.0')).toBe(true);
            });

            it('should return true for newer patch version', () => {
                expect((manager as any).isNewerVersion('1.0.1', '1.0.0')).toBe(true);
            });

            it('should return false for older version', () => {
                expect((manager as any).isNewerVersion('1.0.0', '1.1.0')).toBe(false);
            });

            it('should return false for same version', () => {
                expect((manager as any).isNewerVersion('1.0.0', '1.0.0')).toBe(false);
            });

            it('should handle different part lengths', () => {
                expect((manager as any).isNewerVersion('1.0.0', '1.0')).toBe(false);
                expect((manager as any).isNewerVersion('1.0', '1.0.0')).toBe(false);
                expect((manager as any).isNewerVersion('1.1', '1.0.0')).toBe(true);
            });
        });
    });
});
