import { PluginPackager, PluginPackage, PackageMetadata, PluginDependency } from '../src/utils/pluginPackager';
import { PluginManifest } from '@cktmcs/shared';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import archiver from 'archiver';
import extract from 'extract-zip';
import { v4 as uuidv4 } from 'uuid';

// Mock external dependencies
jest.mock('fs');
jest.mock('path');
jest.mock('crypto');
jest.mock('archiver');
jest.mock('extract-zip');
jest.mock('uuid');

// Cast mocked functions/modules
const mockFs = fs as jest.Mocked<typeof fs>;
const mockPath = path as jest.Mocked<typeof path>;
const mockCrypto = crypto as jest.Mocked<typeof crypto>;
const mockArchiver = archiver as jest.MockedFunction<typeof archiver>;
const mockExtract = extract as jest.MockedFunction<typeof extract>;
const mockUuidv4 = uuidv4 as jest.Mock;

describe('PluginPackager', () => {
    let packager: PluginPackager;
    const MOCK_PACKAGES_DIR = '/mock/packages';
    const MOCK_TEMP_DIR = '/mock/temp';

    beforeEach(() => {
        jest.clearAllMocks();

        // Default mocks for fs
        mockFs.existsSync.mockReturnValue(true);
        mockFs.mkdirSync.mockReturnValue(undefined);
        mockFs.writeFileSync.mockReturnValue(undefined);
        mockFs.readFileSync.mockReturnValue('{}');
        mockFs.statSync.mockReturnValue({ isDirectory: () => true }); // Default to directory
        mockFs.readdirSync.mockReturnValue([]);
        mockFs.copyFileSync.mockReturnValue(undefined);
        mockFs.rmSync.mockReturnValue(undefined);

        // Default mocks for path
        mockPath.join.mockImplementation((...args) => args.join('/'));
        mockPath.resolve.mockImplementation((...args) => args.join('/'));

        // Default mocks for crypto
        const mockHash = { update: jest.fn(), digest: jest.fn().mockReturnValue('mock-hash') };
        mockCrypto.createHash.mockReturnValue(mockHash as any);

        // Default mocks for archiver
        const mockArchive = { pipe: jest.fn(), directory: jest.fn(), finalize: jest.fn(), on: jest.fn() };
        mockArchiver.mockReturnValue(mockArchive as any);
        mockArchive.on.mockImplementation((event, callback) => {
            if (event === 'close') callback();
        });

        // Default mocks for extract-zip
        mockExtract.mockResolvedValue(undefined);

        // Default mocks for uuid
        mockUuidv4.mockReturnValue('mock-uuid');

        // Suppress console logs
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});

        packager = new PluginPackager(MOCK_PACKAGES_DIR, MOCK_TEMP_DIR);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should ensure packages and temp directories exist', () => {
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(MOCK_PACKAGES_DIR, { recursive: true });
            expect(mockFs.mkdirSync).toHaveBeenCalledWith(MOCK_TEMP_DIR, { recursive: true });
        });
    });

    describe('packagePlugin', () => {
        const mockPluginPath = '/plugin/src';
        const mockManifest: PluginManifest = {
            id: 'test-plugin',
            verb: 'TEST_VERB',
            language: 'javascript',
            entryPoint: { main: 'index.js' },
            description: 'A test plugin',
            repository: { type: 'local' },
            metadata: { author: 'Test Author' }
        };
        const mockMetadata: PackageMetadata = {
            packageVersion: '1.0.0',
            stage7Version: '1.0.0',
            compatibility: ['1.0.0'],
            tags: ['test'],
            category: 'utility',
            license: 'MIT',
        };
        const expectedPackageName = 'test-plugin-undefined.s7pkg'; // Version is undefined in mockManifest
        const expectedPackagePath = '/mock/packages/test-plugin-undefined.s7pkg';
        const expectedTempPackageDir = '/mock/temp/mock-uuid';

        beforeEach(() => {
            // Mock copyPluginFiles to simulate copying files
            jest.spyOn(packager as any, 'copyPluginFiles').mockResolvedValue(undefined);
            // Mock analyzeDependencies to return empty array by default
            jest.spyOn(packager as any, 'analyzeDependencies').mockResolvedValue([]);
        });

        it('should package a plugin successfully', async () => {
            const pluginPackage = await packager.packagePlugin(mockPluginPath, mockManifest, mockMetadata);

            expect(mockFs.mkdirSync).toHaveBeenCalledWith(expectedTempPackageDir, { recursive: true });
            expect((packager as any).copyPluginFiles).toHaveBeenCalledWith(mockPluginPath, expectedTempPackageDir);
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(expectedTempPackageDir + '/package.json', expect.any(String));
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(expectedTempPackageDir + '/plugin.json', expect.any(String));
            expect((packager as any).analyzeDependencies).toHaveBeenCalledWith(expectedTempPackageDir, mockManifest);
            expect(mockFs.writeFileSync).toHaveBeenCalledWith(expectedTempPackageDir + '/dependencies.json', expect.any(String));
            expect(mockArchiver).toHaveBeenCalledTimes(1);
            expect(mockArchiver().directory).toHaveBeenCalledWith(expectedTempPackageDir, false);
            expect(mockArchiver().finalize).toHaveBeenCalledTimes(1);
            expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
            expect(mockCrypto.createHash().digest).toHaveBeenCalledWith('hex');
            expect(mockFs.rmSync).toHaveBeenCalledWith(expectedTempPackageDir, { recursive: true, force: true });

            expect(pluginPackage).toEqual(expect.objectContaining({
                id: 'mock-uuid',
                name: 'test-plugin',
                version: undefined,
                description: 'A test plugin',
                author: 'Test Author',
                packageHash: 'mock-hash',
                createdAt: expect.any(Date),
                manifest: mockManifest,
                dependencies: [],
            }));
        });

        it('should sign package if PLUGIN_SIGNING_KEY is available', async () => {
            process.env.PLUGIN_SIGNING_KEY = 'test-key';
            jest.spyOn(packager as any, 'signPackage').mockResolvedValueOnce('mock-signature');

            const pluginPackage = await packager.packagePlugin(mockPluginPath, mockManifest, mockMetadata);

            expect((packager as any).signPackage).toHaveBeenCalledWith(expectedPackagePath);
            expect(pluginPackage.signature).toBe('mock-signature');
        });

        it('should clean up temp directory even if packaging fails', async () => {
            (packager as any).copyPluginFiles.mockRejectedValueOnce(new Error('Copy failed'));

            await expect(packager.packagePlugin(mockPluginPath, mockManifest, mockMetadata)).rejects.toThrow('Copy failed');
            expect(mockFs.rmSync).toHaveBeenCalledWith(expectedTempPackageDir, { recursive: true, force: true });
        });
    });

    describe('unpackPlugin', () => {
        const mockPackagePath = '/path/to/package.s7pkg';
        const mockTargetDir = '/unpack/target';
        const mockManifest: PluginManifest = { id: 'unpacked-plugin', verb: 'UNPACK_VERB', language: 'js', repository: { type: 'local' } };

        beforeEach(() => {
            jest.spyOn(packager as any, 'verifyPackage').mockResolvedValue(undefined);
            mockExtract.mockResolvedValue(undefined);
            mockFs.existsSync.mockReturnValue(true); // plugin.json exists
            mockFs.readFileSync.mockReturnValue(JSON.stringify(mockManifest));
        });

        it('should unpack a plugin successfully', async () => {
            const manifest = await packager.unpackPlugin(mockPackagePath, mockTargetDir);

            expect((packager as any).verifyPackage).toHaveBeenCalledWith(mockPackagePath);
            expect(mockExtract).toHaveBeenCalledWith(mockPackagePath, { dir: mockTargetDir });
            expect(mockFs.existsSync).toHaveBeenCalledWith(mockTargetDir + '/plugin.json');
            expect(mockFs.readFileSync).toHaveBeenCalledWith(mockTargetDir + '/plugin.json', 'utf8');
            expect(manifest).toEqual(mockManifest);
        });

        it('should throw error if plugin manifest not found', async () => {
            mockFs.existsSync.mockReturnValueOnce(false); // plugin.json does not exist

            await expect(packager.unpackPlugin(mockPackagePath, mockTargetDir)).rejects.toThrow('Plugin manifest not found in package');
        });

        it('should throw error if package verification fails', async () => {
            jest.spyOn(packager as any, 'verifyPackage').mockRejectedValueOnce(new Error('Verification failed'));

            await expect(packager.unpackPlugin(mockPackagePath, mockTargetDir)).rejects.toThrow('Verification failed');
        });

        it('should throw error if archive extraction fails', async () => {
            mockExtract.mockRejectedValueOnce(new Error('Extraction failed'));

            await expect(packager.unpackPlugin(mockPackagePath, mockTargetDir)).rejects.toThrow('Failed to extract archive: Extraction failed');
        });
    });

    describe('installDependencies', () => {
        const mockPluginDir = '/plugin/install';

        beforeEach(() => {
            jest.spyOn(packager as any, 'installDependency').mockResolvedValue(undefined);
        });

        it('should install dependencies if dependencies.json exists', async () => {
            const mockDependencies: PluginDependency[] = [
                { name: 'dep1', version: '1.0.0', type: 'npm', optional: false },
                { name: 'dep2', version: '2.0.0', type: 'python', optional: true },
            ];
            mockFs.existsSync.mockReturnValueOnce(true); // dependencies.json exists
            mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(mockDependencies));

            await packager.installDependencies(mockPluginDir);

            expect((packager as any).installDependency).toHaveBeenCalledTimes(2);
            expect((packager as any).installDependency).toHaveBeenCalledWith(mockDependencies[0], mockPluginDir);
            expect((packager as any).installDependency).toHaveBeenCalledWith(mockDependencies[1], mockPluginDir);
        });

        it('should skip dependency installation if dependencies.json does not exist', async () => {
            mockFs.existsSync.mockReturnValueOnce(false); // dependencies.json does not exist

            await packager.installDependencies(mockPluginDir);

            expect((packager as any).installDependency).not.toHaveBeenCalled();
        });

        it('should log warning for optional dependency installation failure', async () => {
            const mockDependencies: PluginDependency[] = [
                { name: 'dep1', version: '1.0.0', type: 'npm', optional: true },
            ];
            mockFs.existsSync.mockReturnValueOnce(true);
            mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(mockDependencies));
            jest.spyOn(packager as any, 'installDependency').mockRejectedValueOnce(new Error('Optional install failed'));
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            await packager.installDependencies(mockPluginDir);

            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Optional dependency dep1 failed to install'), expect.any(Error));
            consoleWarnSpy.mockRestore();
        });

        it('should throw error for mandatory dependency installation failure', async () => {
            const mockDependencies: PluginDependency[] = [
                { name: 'dep1', version: '1.0.0', type: 'npm', optional: false },
            ];
            mockFs.existsSync.mockReturnValueOnce(true);
            mockFs.readFileSync.mockReturnValueOnce(JSON.stringify(mockDependencies));
            jest.spyOn(packager as any, 'installDependency').mockRejectedValueOnce(new Error('Mandatory install failed'));

            await expect(packager.installDependencies(mockPluginDir)).rejects.toThrow('Mandatory install failed');
        });
    });

    describe('Private Helper Methods', () => {
        describe('copyPluginFiles', () => {
            it('should copy a file', async () => {
                mockFs.statSync.mockReturnValueOnce({ isDirectory: () => false });
                await (packager as any).copyPluginFiles('/src/file.txt', '/dest/file.txt');
                expect(mockFs.copyFileSync).toHaveBeenCalledWith('/src/file.txt', '/dest/file.txt');
            });

            it('should recursively copy a directory', async () => {
                mockFs.statSync.mockReturnValueOnce({ isDirectory: () => true });
                mockFs.readdirSync.mockReturnValueOnce(['file1.txt', 'subdir']);
                mockFs.statSync.mockReturnValueOnce({ isDirectory: () => false }); // file1.txt
                mockFs.statSync.mockReturnValueOnce({ isDirectory: () => true }); // subdir
                mockFs.readdirSync.mockReturnValueOnce(['file2.txt']); // subdir content
                mockFs.statSync.mockReturnValueOnce({ isDirectory: () => false }); // file2.txt

                await (packager as any).copyPluginFiles('/src', '/dest');

                expect(mockFs.mkdirSync).toHaveBeenCalledWith('/dest', { recursive: true });
                expect(mockFs.copyFileSync).toHaveBeenCalledWith('/src/file1.txt', '/dest/file1.txt');
                expect(mockFs.mkdirSync).toHaveBeenCalledWith('/dest/subdir', { recursive: true });
                expect(mockFs.copyFileSync).toHaveBeenCalledWith('/src/subdir/file2.txt', '/dest/subdir/file2.txt');
            });

            it('should skip specified files/directories', async () => {
                mockFs.statSync.mockReturnValueOnce({ isDirectory: () => true });
                mockFs.readdirSync.mockReturnValueOnce(['node_modules', 'valid_file.txt', 'test.log']);
                mockFs.statSync.mockReturnValueOnce({ isDirectory: () => false }); // valid_file.txt

                await (packager as any).copyPluginFiles('/src', '/dest');

                expect(mockFs.copyFileSync).toHaveBeenCalledWith('/src/valid_file.txt', '/dest/valid_file.txt');
                expect(mockFs.copyFileSync).not.toHaveBeenCalledWith('/src/node_modules', expect.any(String));
                expect(mockFs.copyFileSync).not.toHaveBeenCalledWith('/src/test.log', expect.any(String));
            });
        });

        describe('analyzeDependencies', () => {
            it('should analyze Python requirements', async () => {
                mockFs.existsSync.mockImplementation((p) => p.includes('requirements.txt'));
                mockFs.readFileSync.mockImplementation((p) => {
                    if (p.includes('requirements.txt')) return 'requests==2.28.1\nflask';
                    return '{}';
                });
                const dependencies = await (packager as any).analyzeDependencies('/plugin', mockManifest);
                expect(dependencies).toEqual(expect.arrayContaining([
                    { name: 'requests', version: '2.28.1', type: 'python', optional: false },
                    { name: 'flask', version: '*', type: 'python', optional: false },
                ]));
            });

            it('should analyze Node.js dependencies', async () => {
                mockFs.existsSync.mockImplementation((p) => p.includes('package.json'));
                mockFs.readFileSync.mockImplementation((p) => {
                    if (p.includes('package.json')) return JSON.stringify({
                        dependencies: { express: '^4.18.2' },
                        optionalDependencies: { lodash: '^4.17.21' }
                    });
                    return '{}';
                });
                const dependencies = await (packager as any).analyzeDependencies('/plugin', mockManifest);
                expect(dependencies).toEqual(expect.arrayContaining([
                    { name: 'express', version: '^4.18.2', type: 'npm', optional: false },
                    { name: 'lodash', version: '^4.17.21', type: 'npm', optional: true },
                ]));
            });

            it('should add manifest-specified dependencies', async () => {
                const manifestWithDeps = { ...mockManifest, repository: { type: 'local', dependencies: { 'system-dep': '1.0' } } };
                const dependencies = await (packager as any).analyzeDependencies('/plugin', manifestWithDeps);
                expect(dependencies).toEqual(expect.arrayContaining([
                    { name: 'system-dep', version: '1.0', type: 'system', optional: false },
                ]));
            });
        });

        describe('createArchive', () => {
            it('should create a zip archive', async () => {
                const mockArchive = mockArchiver();
                await (packager as any).createArchive('/source', '/target.zip');
                expect(mockFs.createWriteStream).toHaveBeenCalledWith('/target.zip');
                expect(mockArchive.pipe).toHaveBeenCalled();
                expect(mockArchive.directory).toHaveBeenCalledWith('/source', false);
                expect(mockArchive.finalize).toHaveBeenCalled();
            });

            it('should reject if archiver emits error', async () => {
                const mockArchive = mockArchiver();
                mockArchive.on.mockImplementation((event, callback) => {
                    if (event === 'error') callback(new Error('Archiver error'));
                });
                await expect((packager as any).createArchive('/source', '/target.zip')).rejects.toThrow('Archiver error');
            });
        });

        describe('extractArchive', () => {
            it('should extract a zip archive', async () => {
                await (packager as any).extractArchive('/archive.zip', '/extract/dest');
                expect(mockExtract).toHaveBeenCalledWith('/archive.zip', { dir: '/extract/dest' });
            });

            it('should throw error if extraction fails', async () => {
                mockExtract.mockRejectedValueOnce(new Error('Extraction failed'));
                await expect((packager as any).extractArchive('/archive.zip', '/extract/dest')).rejects.toThrow('Failed to extract archive: Extraction failed');
            });
        });

        describe('calculateFileHash', () => {
            it('should calculate SHA256 hash of a file', async () => {
                const mockHash = mockCrypto.createHash('sha256');
                const mockStream = { on: jest.fn() };
                mockFs.createReadStream.mockReturnValue(mockStream as any);

                const promise = (packager as any).calculateFileHash('/file.txt');

                // Simulate stream events
                mockStream.on.mock.calls.find(call => call[0] === 'data')[1](Buffer.from('chunk1'));
                mockStream.on.mock.calls.find(call => call[0] === 'data')[1](Buffer.from('chunk2'));
                mockStream.on.mock.calls.find(call => call[0] === 'end')[1]();

                const hash = await promise;
                expect(mockCrypto.createHash).toHaveBeenCalledWith('sha256');
                expect(mockHash.update).toHaveBeenCalledWith(Buffer.from('chunk1'));
                expect(mockHash.update).toHaveBeenCalledWith(Buffer.from('chunk2'));
                expect(mockHash.digest).toHaveBeenCalledWith('hex');
                expect(hash).toBe('mock-hash');
            });

            it('should reject if stream emits error', async () => {
                const mockStream = { on: jest.fn() };
                mockFs.createReadStream.mockReturnValue(mockStream as any);

                const promise = (packager as any).calculateFileHash('/file.txt');

                mockStream.on.mock.calls.find(call => call[0] === 'error')[1](new Error('Stream error'));

                await expect(promise).rejects.toThrow('Stream error');
            });
        });

        describe('signPackage', () => {
            it('should return a mock signature', async () => {
                const signature = await (packager as any).signPackage('/package.s7pkg');
                expect(signature).toMatch(/^signature_mock-hash/);
            });
        });

        describe('installDependency', () => {
            it('should log for system dependency', async () => {
                const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
                const dep: PluginDependency = { name: 'git', version: '*', type: 'system', optional: false };
                await (packager as any).installDependency(dep, '/plugin');
                expect(consoleWarnSpy).toHaveBeenCalledWith('System dependency git must be installed manually');
                consoleWarnSpy.mockRestore();
            });

            // Add tests for python and npm cases if actual installation logic is implemented
        });
    });
});
