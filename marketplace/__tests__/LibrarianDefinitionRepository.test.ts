import { LibrarianDefinitionRepository, LibrarianDefinitionRepositoryConfig } from '../src/repositories/LibrarianDefinitionRepository';
import { OpenAPITool, MCPTool, DefinitionManifest, DefinitionType, PluginParameterType, PluginLocator, createMcpDefinitionManifest, createOpenApiDefinitionManifest } from '@cktmcs/shared';

// Mock the AuthenticatedApiService and its authenticatedApi property
const mockAuthenticatedApi = {
    get: jest.fn(),
    post: jest.fn(),
    delete: jest.fn(),
};
const mockGetLibrarianUrl = jest.fn();

jest.mock('@cktmcs/shared', () => {
    const originalShared = jest.requireActual('@cktmcs/shared');
    return {
        ...originalShared,
        BaseEntity: class MockBaseEntity { // Mocking BaseEntity which AuthenticatedApiService extends
            authenticatedApi = mockAuthenticatedApi;
            librarianUrl = 'mocked-librarian-url';
            constructor(name: string, type: string, port: string) {}
            getLibrarianUrl = mockGetLibrarianUrl; // For AuthenticatedApiService to use
            // Add other necessary BaseEntity mocks if LibrarianDefinitionRepository's apiService uses them
        }
    };
});


describe('LibrarianDefinitionRepository', () => {
    let repository: LibrarianDefinitionRepository;
    const librarianUrl = 'http://librarian.test:5040';
    const openApiCollection = 'openApiToolsTest';
    const mcpCollection = 'mcpToolsTest';

    const sampleOpenAPITool: OpenAPITool = {
        id: 'weather-api',
        name: 'Weather API',
        description: 'Provides weather forecasts',
        version: '1.0',
        specUrl: 'http://example.com/openapi.json',
        baseUrl: 'http://api.example.com/weather',
        authentication: { type: 'none' },
        actionMappings: [
            { actionVerb: 'GET_FORECAST', operationId: 'getForecast', method: 'GET', path: '/forecast', inputs: [], outputs: [] },
            { actionVerb: 'GET_CURRENT', operationId: 'getCurrent', method: 'GET', path: '/current', inputs: [], outputs: [] },
        ],
        metadata: { created: new Date().toISOString(), tags: ['weather'], category: 'tools' }
    };

    const sampleMCPTool: MCPTool = {
        id: 'billing-system',
        name: 'Billing System MCP',
        description: 'Handles billing operations',
        version: '1.1',
        actionMappings: [
            {
                actionVerb: 'CREATE_INVOICE_MCP',
                mcpServiceTarget: { serviceName: 'billing', endpointOrCommand: '/invoices', method: 'POST' },
                inputs: [], outputs: []
            },
        ],
        metadata: { created: new Date().toISOString(), tags: ['billing'], category: 'finance' }
    };

    const config: LibrarianDefinitionRepositoryConfig = {
        type: 'librarian-definition',
        name: 'librarianDefs',
        librarianUrl: librarianUrl,
        openApiToolsCollection: openApiCollection,
        mcpToolsCollection: mcpCollection,
    };

    beforeEach(() => {
        jest.clearAllMocks();
        mockGetLibrarianUrl.mockReturnValue(librarianUrl); // Ensure apiService uses the correct URL
        repository = new LibrarianDefinitionRepository(config);
    });

    describe('list', () => {
        it('should list PluginLocators from both OpenAPI and MCP tool collections', async () => {
            mockAuthenticatedApi.post
                .mockResolvedValueOnce({ data: { data: [sampleOpenAPITool] } }) // OpenAPI tools
                .mockResolvedValueOnce({ data: { data: [sampleMCPTool] } });    // MCP tools

            const locators = await repository.list();

            expect(locators.length).toBe(3); // 2 from OpenAPI, 1 from MCP
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(
                `http://${librarianUrl}/queryData`,
                expect.objectContaining({ collection: openApiCollection })
            );
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(
                `http://${librarianUrl}/queryData`,
                expect.objectContaining({ collection: mcpCollection })
            );

            const forecastLocator = locators.find(l => l.verb === 'GET_FORECAST');
            expect(forecastLocator).toBeDefined();
            expect(forecastLocator?.id).toBe('weather-api-GET_FORECAST');
            expect(forecastLocator?.language).toBe(DefinitionType.OPENAPI);

            const invoiceLocator = locators.find(l => l.verb === 'CREATE_INVOICE_MCP');
            expect(invoiceLocator).toBeDefined();
            expect(invoiceLocator?.id).toBe('billing-system-CREATE_INVOICE_MCP');
            expect(invoiceLocator?.language).toBe(DefinitionType.MCP);
        });
         it('should handle empty collections', async () => {
            mockAuthenticatedApi.post.mockResolvedValue({ data: { data: [] } });
            const locators = await repository.list();
            expect(locators.length).toBe(0);
        });
    });

    describe('fetch', () => {
        it('should fetch an OpenAPI DefinitionManifest by composite ID', async () => {
            mockAuthenticatedApi.get.mockResolvedValue({ data: { data: sampleOpenAPITool } });
            const manifestId = 'weather-api-GET_FORECAST';
            const manifest = await repository.fetch(manifestId);

            expect(manifest).toBeDefined();
            expect(manifest?.id).toBe(manifestId);
            expect(manifest?.language).toBe(DefinitionType.OPENAPI);
            expect(manifest?.verb).toBe('GET_FORECAST');
            expect((manifest as DefinitionManifest)?.toolDefinition.id).toBe('weather-api');
            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
                `http://${librarianUrl}/loadData/weather-api`, // toolId part of composite ID
                expect.objectContaining({ params: { collection: openApiCollection } })
            );
        });

        it('should fetch an MCP DefinitionManifest by composite ID', async () => {
            // Reset GET mock for this specific test path if it was used above
            mockAuthenticatedApi.get
                .mockResolvedValueOnce({ data: { data: null } }) // Simulate not found in OpenAPI
                .mockResolvedValueOnce({ data: { data: sampleMCPTool } }); // Found in MCP

            const manifestId = 'billing-system-CREATE_INVOICE_MCP';
            const manifest = await repository.fetch(manifestId);

            expect(manifest).toBeDefined();
            expect(manifest?.id).toBe(manifestId);
            expect(manifest?.language).toBe(DefinitionType.MCP);
            expect(manifest?.verb).toBe('CREATE_INVOICE_MCP');
            expect((manifest as DefinitionManifest)?.toolDefinition.id).toBe('billing-system');
            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(
                `http://${librarianUrl}/loadData/billing-system`,
                expect.objectContaining({ params: { collection: mcpCollection } })
            );
        });

        it('should return undefined if tool definition not found for fetch', async () => {
            mockAuthenticatedApi.get.mockResolvedValue({ data: { data: null } });
            const manifest = await repository.fetch('nonexistent-tool-VERB');
            expect(manifest).toBeUndefined();
        });
    });

    describe('fetchByVerb', () => {
        it('should fetch an OpenAPI DefinitionManifest by verb', async () => {
            mockAuthenticatedApi.post.mockResolvedValueOnce({ data: { data: [sampleOpenAPITool] } });
            const manifest = await repository.fetchByVerb('GET_FORECAST');

            expect(manifest).toBeDefined();
            expect(manifest?.language).toBe(DefinitionType.OPENAPI);
            expect(manifest?.verb).toBe('GET_FORECAST');
            expect((manifest as DefinitionManifest).toolDefinition.id).toBe('weather-api');
            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(
                `http://${librarianUrl}/queryData`,
                expect.objectContaining({ collection: openApiCollection, query: { 'actionMappings.actionVerb': 'GET_FORECAST' } })
            );
        });

        it('should return undefined if no tool found for verb', async () => {
            mockAuthenticatedApi.post.mockResolvedValue({ data: { data: [] } }); // Empty from both
            const manifest = await repository.fetchByVerb('NON_EXISTENT_VERB');
            expect(manifest).toBeUndefined();
        });
    });

    describe('store', () => {
        it('should store an OpenAPI tool definition from a DefinitionManifest', async () => {
            const manifest = createOpenApiDefinitionManifest(sampleOpenAPITool, 'GET_FORECAST');
            mockAuthenticatedApi.post.mockResolvedValue({ data: { success: true } });

            await repository.store(manifest);

            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(
                `http://${librarianUrl}/storeData`,
                {
                    collection: openApiCollection,
                    id: sampleOpenAPITool.id,
                    data: sampleOpenAPITool,
                    storageType: 'mongo',
                }
            );
        });

        it('should store an MCP tool definition from a DefinitionManifest', async () => {
            const manifest = createMcpDefinitionManifest(sampleMCPTool, 'CREATE_INVOICE_MCP');
            mockAuthenticatedApi.post.mockResolvedValue({ data: { success: true } });

            await repository.store(manifest);

            expect(mockAuthenticatedApi.post).toHaveBeenCalledWith(
                `http://${librarianUrl}/storeData`,
                {
                    collection: mcpCollection,
                    id: sampleMCPTool.id,
                    data: sampleMCPTool,
                    storageType: 'mongo',
                }
            );
        });
    });

    describe('delete', () => {
        it('should delete an OpenAPI tool definition by composite ID', async () => {
            mockAuthenticatedApi.get.mockResolvedValueOnce({ data: { data: sampleOpenAPITool } }); // Simulate found
            mockAuthenticatedApi.delete.mockResolvedValue({ data: { success: true } });

            await repository.delete('weather-api-GET_FORECAST');

            expect(mockAuthenticatedApi.delete).toHaveBeenCalledWith(
                `http://${librarianUrl}/deleteData/weather-api`,
                expect.objectContaining({ params: { collection: openApiCollection } })
            );
        });

         it('should attempt delete from all relevant collections if toolId not found in first', async () => {
            mockAuthenticatedApi.get
                .mockResolvedValueOnce({ data: null }) // Not in openAPI collection
                .mockResolvedValueOnce({ data: { data: sampleMCPTool } }); // Found in MCP collection
            mockAuthenticatedApi.delete.mockResolvedValue({ data: { success: true } });

            await repository.delete('billing-system-CREATE_INVOICE_MCP');

            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(expect.stringContaining(openApiCollection), expect.anything());
            expect(mockAuthenticatedApi.get).toHaveBeenCalledWith(expect.stringContaining(mcpCollection), expect.anything());
            expect(mockAuthenticatedApi.delete).toHaveBeenCalledWith(
                `http://${librarianUrl}/deleteData/billing-system`,
                expect.objectContaining({ params: { collection: mcpCollection } })
            );
        });

        it('should warn if tool definition not found for deletion', async () => {
            mockAuthenticatedApi.get.mockResolvedValue({ data: { data: null } }); // Not found in any
            const consoleWarnSpy = jest.spyOn(console, 'warn');

            await repository.delete('nonexistent-tool-VERB');

            expect(mockAuthenticatedApi.delete).not.toHaveBeenCalled();
            expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("Tool definition nonexistent-tool not found in any configured collection for deletion."));
            consoleWarnSpy.mockRestore();
        });
    });
});
