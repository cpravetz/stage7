import { PluginMarketplace } from '../src/PluginMarketplace';
import { LibrarianDefinitionRepository, LibrarianDefinitionRepositoryConfig } from '../src/repositories/LibrarianDefinitionRepository';
import { MongoRepository } from '../src/repositories/MongoRepository';
import { LocalRepository } from '../src/repositories/LocalRepository';
import { GitHubRepository } from '../src/repositories/GitHubRepository';
import { repositoryConfig as originalRepositoryConfig } from '../src/config/repositoryConfig';
import { PluginManifest, PluginLocator, DefinitionType, OpenAPITool, MCPTool, createOpenApiDefinitionManifest, createMcpDefinitionManifest, PluginRepositoryType } from '@cktmcs/shared';
import axios from 'axios';

// Mock individual repository constructors
jest.mock('../src/repositories/LibrarianDefinitionRepository');
jest.mock('../src/repositories/MongoRepository');
jest.mock('../src/repositories/LocalRepository');
jest.mock('../src/repositories/GitHubRepository');
jest.mock('axios'); // Mock axios for any internal calls by repos if not already mocked

// Cast mocked classes
const MockedLibrarianDefinitionRepository = LibrarianDefinitionRepository as jest.MockedClass<typeof LibrarianDefinitionRepository>;
const MockedMongoRepository = MongoRepository as jest.MockedClass<typeof MongoRepository>;
const MockedLocalRepository = LocalRepository as jest.MockedClass<typeof LocalRepository>;
const MockedGitHubRepository = GitHubRepository as jest.MockedClass<typeof GitHubRepository>;

// Mock repositoryConfig module
jest.mock('../src/config/repositoryConfig', () => ({
    repositoryConfig: {
        defaultRepository: 'local',
        Repositories: [
            { type: 'local', name: 'Local Repo', path: '/tmp/plugins' },
            { type: 'mongo', name: 'Mongo Repo', url: 'mongodb://test', options: { collection: 'plugins' } },
            { type: 'github', name: 'GitHub Repo', owner: 'test', repo: 'test', token: 'test', branch: 'main' },
            { type: 'librarian-definition', name: 'Librarian Defs', librarianUrl: 'http://librarian.test', openApiToolsCollection: 'openApiTools', mcpToolsCollection: 'mcpTools' },
        ]
    }
}));

describe('PluginMarketplace', () => {
    let marketplace: PluginMarketplace;
    let mockLibrarianRepoInstance: jest.Mocked<LibrarianDefinitionRepository>;
    let mockMongoRepoInstance: jest.Mocked<MongoRepository>;
    let mockLocalRepoInstance: jest.Mocked<LocalRepository>;
    let mockGitHubRepoInstance: jest.Mocked<GitHubRepository>;
    
    const sampleOpenAPITool: OpenAPITool = { id: 'oa1', name: 'oa name', description: 'desc', version: '1', specUrl: 'url', baseUrl: 'base', authentication: { type: 'none' }, actionMappings: [{ actionVerb: 'VERB_OA', operationId: 'op1', method: 'GET', path: '/', inputs: [], outputs: [] }], metadata: { created: new Date().toISOString() } };
    const sampleMCPTool: MCPTool = { id: 'mcp1', name: 'mcp name', description: 'desc', version: '1', actionMappings: [{ actionVerb: 'VERB_MCP', mcpServiceTarget: { serviceName: 's', endpointOrCommand: 'e', method: 'm' }, inputs: [], outputs: [] }], metadata: { created: new Date().toISOString() } };

    const openApiManifest = createOpenApiDefinitionManifest(sampleOpenAPITool, 'VERB_OA');
    const mcpManifest = createMcpDefinitionManifest(sampleMCPTool, 'VERB_MCP');

    beforeEach(() => {
        jest.clearAllMocks();
        jest.resetModules(); // Important to reset modules to clear mocks affecting constructors

        // Mock instances for each repository type
        mockLibrarianRepoInstance = {
            list: jest.fn().mockResolvedValue([]),
            fetch: jest.fn().mockResolvedValue(undefined),
            fetchByVerb: jest.fn().mockResolvedValue(undefined),
            fetchAllVersionsOfPlugin: jest.fn().mockResolvedValue(undefined),
            store: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined),
        } as any;
        mockMongoRepoInstance = { ...mockLibrarianRepoInstance } as any;
        mockLocalRepoInstance = { ...mockLibrarianRepoInstance } as any;
        mockGitHubRepoInstance = { ...mockLibrarianRepoInstance } as any;

        // Make the mocked constructors return our mock instances
        MockedLibrarianDefinitionRepository.mockImplementation(() => mockLibrarianRepoInstance);
        MockedMongoRepository.mockImplementation(() => mockMongoRepoInstance);
        MockedLocalRepository.mockImplementation(() => mockLocalRepoInstance);
        MockedGitHubRepository.mockImplementation(() => mockGitHubRepoInstance);

        // Set default environment variables
        process.env.DEFAULT_PLUGIN_REPOSITORY = 'local';
        process.env.ENABLE_GITHUB = 'true';
        process.env.GITHUB_TOKEN = 'test-token';
        process.env.GITHUB_USERNAME = 'test-user';
        process.env.GIT_REPOSITORY_URL = 'https://github.com/test/repo';

        // Re-require PluginMarketplace to use the mocked config and env vars
        const { PluginMarketplace: PatchedPluginMarketplace } = require('../src/PluginMarketplace');
        marketplace = new PatchedPluginMarketplace();

        // Suppress console logs for cleaner test output
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should initialize all configured repositories', () => {
            expect(MockedLocalRepository).toHaveBeenCalledTimes(1);
            expect(MockedMongoRepository).toHaveBeenCalledTimes(1);
            expect(MockedGitHubRepository).toHaveBeenCalledTimes(1);
            expect(MockedLibrarianDefinitionRepository).toHaveBeenCalledTimes(1);

            expect(marketplace.getRepositories().size).toBe(5);
            expect(marketplace.getRepositories().get('local')).toBe(mockLocalRepoInstance);
            expect(marketplace.getRepositories().get('mongo')).toBe(mockMongoRepoInstance);
            expect(marketplace.getRepositories().get('github')).toBe(mockGitHubRepoInstance);
            expect(marketplace.getRepositories().get('librarian-definition')).toBe(mockLibrarianRepoInstance);
        });

        it('should skip GitHub repository initialization if ENABLE_GITHUB is not true', () => {
            process.env.ENABLE_GITHUB = 'false';
            jest.resetModules();
            const { PluginMarketplace: PatchedPluginMarketplace } = require('../src/PluginMarketplace');
            marketplace = new PatchedPluginMarketplace();

            expect(MockedGitHubRepository).not.toHaveBeenCalled();
            expect(marketplace.getRepositories().has('github')).toBe(false);
            expect(console.log).toHaveBeenCalledWith('Skipping GitHub repository initialization as ENABLE_GITHUB is not set to true');
        });

        it('should skip GitHub repository initialization if GITHUB_TOKEN is missing', () => {
            delete process.env.GITHUB_TOKEN;
            jest.resetModules();
            const { PluginMarketplace: PatchedPluginMarketplace } = require('../src/PluginMarketplace');
            marketplace = new PatchedPluginMarketplace();

            expect(MockedGitHubRepository).not.toHaveBeenCalled();
            expect(marketplace.getRepositories().has('github')).toBe(false);
            expect(console.warn).toHaveBeenCalledWith('GitHub TOKEN is missing.');
        });

        it('should skip GitHub repository initialization if GITHUB_USERNAME is missing', () => {
            delete process.env.GITHUB_USERNAME;
            jest.resetModules();
            const { PluginMarketplace: PatchedPluginMarketplace } = require('../src/PluginMarketplace');
            marketplace = new PatchedPluginMarketplace();

            expect(MockedGitHubRepository).not.toHaveBeenCalled();
            expect(marketplace.getRepositories().has('github')).toBe(false);
            expect(console.warn).toHaveBeenCalledWith('GitHub USERNAME is missing.');
        });

        it('should skip GitHub repository initialization if GIT_REPOSITORY_URL is missing', () => {
            delete process.env.GIT_REPOSITORY_URL;
            jest.resetModules();
            const { PluginMarketplace: PatchedPluginMarketplace } = require('../src/PluginMarketplace');
            marketplace = new PatchedPluginMarketplace();

            expect(MockedGitHubRepository).not.toHaveBeenCalled();
            expect(marketplace.getRepositories().has('github')).toBe(false);
            expect(console.warn).toHaveBeenCalledWith('GitHub REPOSITORY_URL is missing.');
        });

        it('should log error if repository creation fails', () => {
            MockedMongoRepository.mockImplementationOnce(() => { throw new Error('Mongo init failed'); });
            jest.resetModules();
            const { PluginMarketplace: PatchedPluginMarketplace } = require('../src/PluginMarketplace');
            marketplace = new PatchedPluginMarketplace();

            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error initializing repository of type mongo'), expect.any(Error));
            expect(marketplace.getRepositories().has('mongo')).toBe(false);
        });

        it('should log warning for unknown repository type', () => {
            jest.doMock('../src/config/repositoryConfig', () => ({
                repositoryConfig: {
                    defaultRepository: 'local',
                    Repositories: [
                        { type: 'unknown-type', name: 'Unknown Repo' },
                    ]
                }
            }));
            jest.resetModules();
            const { PluginMarketplace: PatchedPluginMarketplace } = require('../src/PluginMarketplace');
            marketplace = new PatchedPluginMarketplace();

            expect(console.warn).toHaveBeenCalledWith('Unknown repository type: unknown-type');
            expect(marketplace.getRepositories().size).toBe(0);
            jest.unmock('../src/config/repositoryConfig');
        });
    });

    describe('list', () => {
        const mockPluginLocator: PluginLocator = { id: 'p1', verb: 'V1', language: 'js', name: 'P1', version: '1', description: 'desc', repository: { type: 'local' } };
        const mockContainerPluginLocator: PluginLocator = { id: 'c1', verb: 'C1', language: 'container', name: 'C1', version: '1', description: 'desc', repository: { type: 'local' } };
        const mockContainerPluginManifest: PluginManifest = { id: 'c1', verb: 'C1', language: 'container', repository: { type: 'local' } };

        beforeEach(() => {
            mockLocalRepoInstance.list.mockResolvedValue([mockPluginLocator, mockContainerPluginLocator]);
            mockLocalRepoInstance.fetch.mockImplementation((id) => {
                if (id === 'c1') return Promise.resolve(mockContainerPluginManifest);
                return Promise.resolve({ id, language: 'js' } as PluginManifest);
            });
        });

        it('should list all plugins from default repository', async () => {
            const plugins = await marketplace.list();
            expect(plugins).toEqual([mockPluginLocator, mockContainerPluginLocator]);
            expect(mockLocalRepoInstance.list).toHaveBeenCalledTimes(1);
        });

        it('should list plugins from specified repository', async () => {
            const plugins = await marketplace.list('local' as PluginRepositoryType);
            expect(plugins).toEqual([mockPluginLocator, mockContainerPluginLocator]);
            expect(mockLocalRepoInstance.list).toHaveBeenCalledTimes(1);
        });

        it('should filter out container plugins if includeContainerPlugins is false', async () => {
            const plugins = await marketplace.list('local' as PluginRepositoryType, false);
            expect(plugins).toEqual([mockPluginLocator]);
            expect(mockLocalRepoInstance.list).toHaveBeenCalledTimes(1);
            expect(mockLocalRepoInstance.fetch).toHaveBeenCalledWith('p1', undefined);
            expect(mockLocalRepoInstance.fetch).toHaveBeenCalledWith('c1', undefined);
        });

        it('should log warning and return empty array if repository not found', async () => {
            const plugins = await marketplace.list('nonexistent' as PluginRepositoryType);
            expect(plugins).toEqual([]);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Repository nonexistent not found (list)'));
        });

        it('should log warning and return empty array if list fails', async () => {
            mockLocalRepoInstance.list.mockRejectedValueOnce(new Error('List error'));
            const plugins = await marketplace.list('local' as PluginRepositoryType);
            expect(plugins).toEqual([]);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Error listing plugins from repository local'), expect.any(Error));
        });

        it('should log warning if fetching manifest fails during container filtering', async () => {
            mockLocalRepoInstance.fetch.mockRejectedValueOnce(new Error('Fetch error'));
            const plugins = await marketplace.list('local' as PluginRepositoryType, false);
            // Should still return the original locators if fetch fails
            expect(plugins).toEqual([mockPluginLocator, mockContainerPluginLocator]);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Error fetching manifest for plugin'), expect.any(Error));
        });
    });

    describe('fetchOne', () => {
        const mockManifest: PluginManifest = { id: 'p1', verb: 'V1', language: 'js', repository: { type: 'local' } };

        beforeEach(() => {
            mockLocalRepoInstance.fetch.mockResolvedValue(mockManifest);
        });

        it('should fetch a plugin from default repository', async () => {
            const plugin = await marketplace.fetchOne('p1');
            expect(plugin).toEqual(mockManifest);
            expect(mockLocalRepoInstance.fetch).toHaveBeenCalledWith('p1', undefined);
        });

        it('should fetch a plugin from specified repository', async () => {
            const plugin = await marketplace.fetchOne('p1', undefined, 'local' as PluginRepositoryType);
            expect(plugin).toEqual(mockManifest);
            expect(mockLocalRepoInstance.fetch).toHaveBeenCalledWith('p1', undefined);
        });

        it('should log warning and return undefined if repository not found', async () => {
            const plugin = await marketplace.fetchOne('p1', undefined, 'nonexistent' as PluginRepositoryType);
            expect(plugin).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Repository nonexistent not found (fetchOne)'));
        });

        it('should log warning and return undefined if fetch fails', async () => {
            mockLocalRepoInstance.fetch.mockRejectedValueOnce(new Error('Fetch error'));
            const plugin = await marketplace.fetchOne('p1', undefined, 'local' as PluginRepositoryType);
            expect(plugin).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Error fetching plugin p1 from repository local'), expect.any(Error));
        });
    });

    describe('fetchOneByVerb', () => {
        const mockManifest: PluginManifest = { id: 'p1', verb: 'V1', language: 'js', repository: { type: 'local' } };

        it('should fetch a plugin by verb from any repository', async () => {
            mockLocalRepoInstance.fetchByVerb.mockResolvedValueOnce(undefined); // Not found in local
            mockMongoRepoInstance.fetchByVerb.mockResolvedValueOnce(mockManifest); // Found in mongo

            const plugin = await marketplace.fetchOneByVerb('V1');
            expect(plugin).toEqual(mockManifest);
            expect(mockLocalRepoInstance.fetchByVerb).toHaveBeenCalledWith('V1', undefined);
            expect(mockMongoRepoInstance.fetchByVerb).toHaveBeenCalledWith('V1', undefined);
        });

        it('should return undefined if plugin not found by verb in any repository', async () => {
            mockLocalRepoInstance.fetchByVerb.mockResolvedValueOnce(undefined);
            mockMongoRepoInstance.fetchByVerb.mockResolvedValueOnce(undefined);
            mockGitHubRepoInstance.fetchByVerb.mockResolvedValueOnce(undefined);
            mockLibrarianRepoInstance.fetchByVerb.mockResolvedValueOnce(undefined);

            const plugin = await marketplace.fetchOneByVerb('NON_EXISTENT_VERB');
            expect(plugin).toBeUndefined();
        });

        it('should log warning and continue if fetchByVerb fails for a repository', async () => {
            mockLocalRepoInstance.fetchByVerb.mockRejectedValueOnce(new Error('Local fetch error'));
            mockMongoRepoInstance.fetchByVerb.mockResolvedValueOnce(mockManifest);

            const plugin = await marketplace.fetchOneByVerb('V1');
            expect(plugin).toEqual(mockManifest);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Error fetching from repository'), expect.any(Error));
        });
    });

    describe('fetchAllVersionsOfPlugin', () => {
        const mockManifests: PluginManifest[] = [
            { id: 'p1', verb: 'V1', language: 'js', version: '1.0.0', repository: { type: 'local' } },
            { id: 'p1', verb: 'V1', language: 'js', version: '1.1.0', repository: { type: 'local' } },
        ];

        it('should fetch all versions from default repository if supported', async () => {
            mockLocalRepoInstance.fetchAllVersionsOfPlugin.mockResolvedValueOnce(mockManifests);
            const versions = await marketplace.fetchAllVersionsOfPlugin('p1');
            expect(versions).toEqual(mockManifests);
            expect(mockLocalRepoInstance.fetchAllVersionsOfPlugin).toHaveBeenCalledWith('p1');
        });

        it('should fetch all versions from specified repository if supported', async () => {
            mockMongoRepoInstance.fetchAllVersionsOfPlugin.mockResolvedValueOnce(mockManifests);
            const versions = await marketplace.fetchAllVersionsOfPlugin('p1', 'mongo' as PluginRepositoryType);
            expect(versions).toEqual(mockManifests);
            expect(mockMongoRepoInstance.fetchAllVersionsOfPlugin).toHaveBeenCalledWith('p1');
        });

        it('should return undefined if repository does not support fetchAllVersionsOfPlugin', async () => {
            mockLocalRepoInstance.fetchAllVersionsOfPlugin = undefined; // Simulate no support
            const versions = await marketplace.fetchAllVersionsOfPlugin('p1', 'local' as PluginRepositoryType);
            expect(versions).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Repository type local does not support fetchAllVersionsOfPlugin.'));
        });

        it('should log warning and return undefined if fetchAllVersionsOfPlugin fails', async () => {
            mockLocalRepoInstance.fetchAllVersionsOfPlugin.mockRejectedValueOnce(new Error('Fetch all versions error'));
            const versions = await marketplace.fetchAllVersionsOfPlugin('p1', 'local' as PluginRepositoryType);
            expect(versions).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Error fetching all versions for plugin p1 from repository local'), expect.any(Error));
        });

        it('should return undefined if repository not found', async () => {
            const versions = await marketplace.fetchAllVersionsOfPlugin('p1', 'nonexistent' as PluginRepositoryType);
            expect(versions).toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Repository nonexistent not found (fetchAllVersionsOfPlugin)'));
        });
    });

    describe('store', () => {
        const mockPluginManifest: PluginManifest = { id: 'new-plugin', verb: 'NEW_VERB', language: 'js', repository: { type: 'local' } };
        const mockContainerManifest: PluginManifest = {
            id: 'container-plugin', verb: 'CONTAINER_VERB', language: 'container',
            repository: { type: 'local' },
            container: { dockerfile: 'Dockerfile', buildContext: '.', image: 'img', ports: [{ container: 8080 }] },
            api: { endpoint: '/', method: 'get' }
        };

        it('should store a plugin in the specified repository', async () => {
            await marketplace.store(mockPluginManifest);
            expect(mockLocalRepoInstance.store).toHaveBeenCalledWith(mockPluginManifest);
        });

        it('should store a plugin in the default repository if none specified in manifest', async () => {
            const pluginWithoutRepo = { ...mockPluginManifest, repository: { type: undefined as any } };
            await marketplace.store(pluginWithoutRepo);
            expect(mockLocalRepoInstance.store).toHaveBeenCalledWith(pluginWithoutRepo);
        });

        it('should update existing plugin if found by verb', async () => {
            const existingPlugin = { ...mockPluginManifest, id: 'existing-plugin', repository: { type: 'mongo' } };
            mockLocalRepoInstance.fetchByVerb.mockResolvedValueOnce(undefined);
            mockMongoRepoInstance.fetchByVerb.mockResolvedValueOnce(existingPlugin);

            const updatedPlugin = { ...mockPluginManifest, description: 'Updated desc' };
            await marketplace.store(updatedPlugin);

            expect(mockMongoRepoInstance.store).toHaveBeenCalledWith(updatedPlugin);
            expect(mockLocalRepoInstance.store).not.toHaveBeenCalled();
        });

        it('should validate container plugin manifest before storing', async () => {
            await marketplace.store(mockContainerManifest);
            expect(mockLocalRepoInstance.store).toHaveBeenCalledWith(mockContainerManifest);
        });

        it('should not store container plugin if validation fails', async () => {
            const invalidContainerManifest = { ...mockContainerManifest, container: { dockerfile: 'Dockerfile' } }; // Missing buildContext, image, ports
            await marketplace.store(invalidContainerManifest);
            expect(mockLocalRepoInstance.store).not.toHaveBeenCalled();
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Container configuration missing required field: buildContext'));
        });

        it('should log warning if repository not found for storing', async () => {
            const pluginWithNonExistentRepo = { ...mockPluginManifest, repository: { type: 'nonexistent' as any } };
            await marketplace.store(pluginWithNonExistentRepo);
            expect(mockLocalRepoInstance.store).not.toHaveBeenCalled();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Repository nonexistent not found (store)'));
        });

        it('should log error if store operation fails', async () => {
            mockLocalRepoInstance.store.mockRejectedValueOnce(new Error('Store failed'));
            await marketplace.store(mockPluginManifest);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Failed to store plugin'), expect.any(Error));
        });
    });

    describe('delete', () => {
        const mockPluginId = 'plugin-to-delete';
        const mockPluginVersion = '1.0.0';

        it('should delete a plugin from specified repository', async () => {
            await marketplace.delete(mockPluginId, mockPluginVersion, 'local' as PluginRepositoryType);
            expect(mockLocalRepoInstance.delete).toHaveBeenCalledWith(mockPluginId, mockPluginVersion);
        });

        it('should delete a plugin from default repository if none specified', async () => {
            await marketplace.delete(mockPluginId, mockPluginVersion);
            expect(mockLocalRepoInstance.delete).toHaveBeenCalledWith(mockPluginId, mockPluginVersion);
        });

        it('should log warning if repository not found for deleting', async () => {
            await marketplace.delete(mockPluginId, mockPluginVersion, 'nonexistent' as PluginRepositoryType);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Repository nonexistent not found (delete)'));
        });

        it('should log warning if delete operation fails', async () => {
            mockLocalRepoInstance.delete.mockRejectedValueOnce(new Error('Delete failed'));
            await marketplace.delete(mockPluginId, mockPluginVersion, 'local' as PluginRepositoryType);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('Error deleting plugin'), expect.any(Error));
        });
    });

    describe('validateContainerPlugin', () => {
        it('should return true for a valid container plugin manifest', () => {
            const validManifest: PluginManifest = {
                id: 'valid-container', verb: 'VALID_CONTAINER', language: 'container',
                repository: { type: 'local' },
                container: {
                    dockerfile: 'Dockerfile',
                    buildContext: '.',
                    image: 'my-image',
                    ports: [{ container: 8080, host: 8080 }],
                    healthCheck: { path: '/health' }
                },
                api: { endpoint: '/api', method: 'post' }
            };
            expect((marketplace as any).validateContainerPlugin(validManifest)).toBe(true);
        });

        it('should return false if container config is missing', () => {
            const manifest = { ...mockContainerManifest, container: undefined };
            expect((marketplace as any).validateContainerPlugin(manifest as any)).toBe(false);
            expect(console.error).toHaveBeenCalledWith('Container plugin missing container configuration');
        });

        it('should return false if API config is missing', () => {
            const manifest = { ...mockContainerManifest, api: undefined };
            expect((marketplace as any).validateContainerPlugin(manifest as any)).toBe(false);
            expect(console.error).toHaveBeenCalledWith('Container plugin missing API configuration');
        });

        it('should return false if required container fields are missing', () => {
            const manifest = { ...mockContainerManifest, container: { dockerfile: 'Dockerfile' } }; // Missing buildContext, image, ports
            expect((marketplace as any).validateContainerPlugin(manifest as any)).toBe(false);
            expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Container configuration missing required field: buildContext'));
        });

        it('should return false if API endpoint or method is missing', () => {
            const manifest = { ...mockContainerManifest, api: { endpoint: '/' } }; // Missing method
            expect((marketplace as any).validateContainerPlugin(manifest as any)).toBe(false);
            expect(console.error).toHaveBeenCalledWith('Container API configuration missing endpoint or method');
        });

        it('should return false if ports configuration is missing or empty', () => {
            const manifest1 = { ...mockContainerManifest, container: { ...mockContainerManifest.container, ports: undefined } };
            const manifest2 = { ...mockContainerManifest, container: { ...mockContainerManifest.container, ports: [] } };
            expect((marketplace as any).validateContainerPlugin(manifest1 as any)).toBe(false);
            expect((marketplace as any).validateContainerPlugin(manifest2 as any)).toBe(false);
            expect(console.error).toHaveBeenCalledWith('Container configuration must specify at least one port mapping');
        });

        it('should return false if health check path is missing when healthCheck is present', () => {
            const manifest = { ...mockContainerManifest, container: { ...mockContainerManifest.container, healthCheck: { timeout: '10s' } } }; // Missing path
            expect((marketplace as any).validateContainerPlugin(manifest as any)).toBe(false);
            expect(console.error).toHaveBeenCalledWith('Container health check configuration missing path');
        });
    });
});
