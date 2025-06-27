import {
    PluginManifest,
    PluginLocator,
    PluginRepository,
    RepositoryConfig,
    OpenAPITool,
    MCPTool,
    DefinitionManifest,
    DefinitionType,
    createOpenApiDefinitionManifest,
    createMcpDefinitionManifest,
    BaseEntity // For authenticatedApi
} from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler'; // Assuming errorhandler is accessible

// Minimal BaseEntity-like structure for authenticatedApi if not extending BaseEntity directly
// This is a simplified placeholder. In a real scenario, this would likely come from a shared
// library or be injected, and handle token management properly.
class AuthenticatedApiService extends BaseEntity {
    constructor(protected serviceName: string, protected serviceType: string, protected port: string, protected librarianUrl: string) {
        super(serviceName, serviceType, serviceType.toLowerCase(), port);
         // Initialize authenticatedApi if BaseEntity does this in its constructor
        // This is a simplified mock-up of how authenticatedApi might be initialized
        if (!(this as any).authenticatedApi) {
            (this as any).authenticatedApi = { // This is a mock; replace with actual axios instance setup
                get: async (url: string, config?: any) => { console.log(`MOCK GET: ${url}`); return { data: { data: null } }; },
                post: async (url: string, data?: any, config?: any) => { console.log(`MOCK POST: ${url}`); return { data: { data: null } }; },
                delete: async (url: string, config?: any) => { console.log(`MOCK DELETE: ${url}`); return { data: { success: true } }; },
            };
        }
    }
    // Expose librarianUrl for use
    getLibrarianUrl(): string {
        return this.librarianUrl;
    }
}


export interface LibrarianDefinitionRepositoryConfig extends RepositoryConfig {
    type: 'librarian-definition';
    librarianUrl: string;
    openApiToolsCollection?: string;
    mcpToolsCollection?: string;
    // If using a single collection for all handlers:
    actionHandlersCollection?: string;
}

export class LibrarianDefinitionRepository implements PluginRepository {
    public type: string = 'librarian-definition';
    private config: LibrarianDefinitionRepositoryConfig;
    private apiService: AuthenticatedApiService; // To use authenticatedApi
    private openApiCollectionName: string;
    private mcpCollectionName: string;
    private handlersCollectionName: string | undefined;


    constructor(config: RepositoryConfig) {
        this.config = config as LibrarianDefinitionRepositoryConfig;
        if (!this.config.librarianUrl) {
            throw new Error("Librarian URL is required for LibrarianDefinitionRepository.");
        }
        // Initialize a simplified BaseEntity or similar for API calls
        this.apiService = new AuthenticatedApiService('LibrarianDefRepo', 'Repository', '0', this.config.librarianUrl);


        this.openApiCollectionName = this.config.openApiToolsCollection || 'openApiTools';
        this.mcpCollectionName = this.config.mcpToolsCollection || 'mcpTools';
        this.handlersCollectionName = this.config.actionHandlersCollection;

        if (this.handlersCollectionName && (this.config.openApiToolsCollection || this.config.mcpToolsCollection)) {
            console.warn("LibrarianDefinitionRepository: Both single 'actionHandlersCollection' and specific tool collections are configured. Will prioritize specific collections if defined, then single collection.");
        }
        if (!this.handlersCollectionName && !this.config.openApiToolsCollection && !this.config.mcpToolsCollection) {
            console.warn("LibrarianDefinitionRepository: No collection names configured. Using defaults 'openApiTools' and 'mcpTools'.");
        }
    }

    private getCollectionForType(type: DefinitionType | 'openapi' | 'mcp'): string {
        if (this.handlersCollectionName) return this.handlersCollectionName;
        return type === DefinitionType.OPENAPI || type === 'openapi' ? this.openApiCollectionName : this.mcpCollectionName;
    }

    private getAuthenticatedApi() {
        // Access the authenticatedApi from the apiService instance
        // This relies on BaseEntity initializing authenticatedApi correctly.
        // Add proper error handling if apiService or authenticatedApi is undefined.
        if (!this.apiService || !(this.apiService as any).authenticatedApi) {
            console.error("LibrarianDefinitionRepository: authenticatedApi is not initialized.");
            throw new Error("LibrarianDefinitionRepository: authenticatedApi is not available.");
        }
        return (this.apiService as any).authenticatedApi;
    }


    async list(): Promise<PluginLocator[]> {
        const locators: PluginLocator[] = [];
        try {
            // Fetch OpenAPI tools
            if (!this.handlersCollectionName || this.config.openApiToolsCollection) {
                const openApiTools = await this.fetchAllFromCollection(this.openApiCollectionName, DefinitionType.OPENAPI);
                locators.push(...openApiTools);
            }

            // Fetch MCP tools
            if (!this.handlersCollectionName || this.config.mcpToolsCollection) {
                const mcpTools = await this.fetchAllFromCollection(this.mcpCollectionName, DefinitionType.MCP);
                locators.push(...mcpTools);
            }

            // If using a single handlersCollection, fetch all and filter by a 'handlerType' field
            if (this.handlersCollectionName) {
                 const allHandlers = await this.fetchAllFromCollection(this.handlersCollectionName, undefined); // Pass undefined or a generic type
                 locators.push(...allHandlers); // Assuming fetchAllFromCollection can handle filtering or returns all types
            }


        } catch (error) {
            analyzeError(error as Error);
            console.error('LibrarianDefinitionRepository: Error listing definitions from Librarian:', error);
            // Depending on policy, might return empty or throw
        }
        return locators;
    }

    private async fetchAllFromCollection(collectionName: string, definitionType?: DefinitionType): Promise<PluginLocator[]> {
        const locators: PluginLocator[] = [];
        try {
            const response = await this.getAuthenticatedApi().post(`http://${this.apiService.getLibrarianUrl()}/queryData`, {
                collection: collectionName,
                query: definitionType && this.handlersCollectionName ? { handlerType: definitionType } : {}, // Filter if single collection
                limit: 1000, // Adjust as needed
            });

            const tools: Array<OpenAPITool | MCPTool> = response.data?.data || [];

            for (const tool of tools) {
                const actualDefinitionType = (tool as any).definitionType || // if it's already a DefinitionManifest like structure
                                           (tool.hasOwnProperty('specUrl') ? DefinitionType.OPENAPI : DefinitionType.MCP); // Infer if raw

                if (definitionType && this.handlersCollectionName && actualDefinitionType !== definitionType) {
                    continue; // Skip if type doesn't match when querying a general collection
                }

                // Each actionVerb in a tool definition can be a separate locator/manifest
                for (const mapping of tool.actionMappings) {
                    locators.push({
                        id: `${tool.id}-${mapping.actionVerb}`, // Unique ID for this specific verb-handler
                        verb: mapping.actionVerb,
                        name: tool.name, // Name of the parent tool
                        version: tool.version,
                        description: mapping.description || tool.description,
                        language: actualDefinitionType, // 'openapi' or 'mcp'
                        repository: { type: this.type, url: this.config.librarianUrl },
                    });
                }
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`LibrarianDefinitionRepository: Error fetching from collection ${collectionName}:`, error);
        }
        return locators;
    }

    async fetch(id: string, version?: string): Promise<DefinitionManifest | undefined> {
        // ID here is expected to be toolId-actionVerb
        const parts = id.split('-');
        const actionVerb = parts.pop();
        const toolId = parts.join('-');

        if (!actionVerb || !toolId) {
            console.error(`LibrarianDefinitionRepository: Invalid ID format for fetch: ${id}. Expected 'toolId-actionVerb'.`);
            return undefined;
        }

        try {
            // Try fetching from OpenAPI collection
            let toolDef = await this.fetchToolDefinitionById(toolId, this.openApiCollectionName) as OpenAPITool;
            if (toolDef) {
                if (toolDef.actionMappings.some(m => m.actionVerb === actionVerb)) {
                    return createOpenApiDefinitionManifest(toolDef, actionVerb);
                }
            }

            // Try fetching from MCP collection
            toolDef = await this.fetchToolDefinitionById(toolId, this.mcpCollectionName) as MCPTool;
            if (toolDef) {
                 if (toolDef.actionMappings.some(m => m.actionVerb === actionVerb)) {
                    return createMcpDefinitionManifest(toolDef as MCPTool, actionVerb);
                }
            }

            // If using single collection
            if (this.handlersCollectionName) {
                toolDef = await this.fetchToolDefinitionById(toolId, this.handlersCollectionName);
                if (toolDef) {
                    if (toolDef.hasOwnProperty('specUrl') && (toolDef as OpenAPITool).actionMappings.some(m => m.actionVerb === actionVerb)) {
                         return createOpenApiDefinitionManifest(toolDef as OpenAPITool, actionVerb);
                    } else if ((toolDef as MCPTool).actionMappings.some(m => m.actionVerb === actionVerb)) {
                         return createMcpDefinitionManifest(toolDef as MCPTool, actionVerb);
                    }
                }
            }

        } catch (error) {
            analyzeError(error as Error);
            console.error(`LibrarianDefinitionRepository: Error fetching definition for ID ${id} (toolId: ${toolId}, verb: ${actionVerb}):`, error);
        }
        return undefined;
    }

    private async fetchToolDefinitionById(toolId: string, collectionName: string): Promise<OpenAPITool | MCPTool | undefined> {
        try {
            const response = await this.getAuthenticatedApi().get(`http://${this.apiService.getLibrarianUrl()}/loadData/${toolId}`, {
                params: { collection: collectionName, storageType: 'mongo' },
            });
            return response.data?.data;
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                return undefined; // Not found in this collection
            }
            analyzeError(error);
            console.error(`LibrarianDefinitionRepository: Error fetching tool definition ${toolId} from ${collectionName}:`, error);
            throw error; // Re-throw to be handled by caller
        }
    }


    async fetchByVerb(verb: string, version?: string): Promise<DefinitionManifest | undefined> {
        // This needs to query Librarian for a tool definition that has an actionMapping for this verb.
        // Then, construct the DefinitionManifest.
        try {
            // Query OpenAPI tools
            let queryResponse = await this.getAuthenticatedApi().post(`http://${this.apiService.getLibrarianUrl()}/queryData`, {
                collection: this.openApiCollectionName,
                query: { 'actionMappings.actionVerb': verb },
                limit: 1,
            });
            let tool = queryResponse.data?.data?.[0] as OpenAPITool;
            if (tool) {
                return createOpenApiDefinitionManifest(tool, verb);
            }

            // Query MCP tools
            queryResponse = await this.getAuthenticatedApi().post(`http://${this.apiService.getLibrarianUrl()}/queryData`, {
                collection: this.mcpCollectionName,
                query: { 'actionMappings.actionVerb': verb },
                limit: 1,
            });
            tool = queryResponse.data?.data?.[0] as MCPTool;
            if (tool) {
                return createMcpDefinitionManifest(tool, verb);
            }

            // Query handlersCollection if defined
            if (this.handlersCollectionName) {
                 queryResponse = await this.getAuthenticatedApi().post(`http://${this.apiService.getLibrarianUrl()}/queryData`, {
                    collection: this.handlersCollectionName,
                    query: { 'actionMappings.actionVerb': verb }, // Assuming a common structure or need to check type
                    limit: 1,
                });
                tool = queryResponse.data?.data?.[0];
                if (tool) {
                    if (tool.hasOwnProperty('specUrl')) return createOpenApiDefinitionManifest(tool as OpenAPITool, verb);
                    return createMcpDefinitionManifest(tool as MCPTool, verb);
                }
            }

        } catch (error) {
            analyzeError(error as Error);
            console.error(`LibrarianDefinitionRepository: Error fetching definition by verb ${verb}:`, error);
        }
        return undefined;
    }

    async store(manifest: PluginManifest): Promise<void> {
        const defManifest = manifest as DefinitionManifest;
        if (!defManifest.toolDefinition || !defManifest.definitionType) {
            throw new Error('LibrarianDefinitionRepository: Manifest is not a valid DefinitionManifest for store operation.');
        }

        const toolDefinition = defManifest.toolDefinition;
        const collectionName = this.getCollectionForType(defManifest.definitionType);

        // If storing in a single handlers collection, add a type discriminator
        const dataToStore: any = { ...toolDefinition };
        if (this.handlersCollectionName) {
            dataToStore.handlerType = defManifest.definitionType;
        }

        try {
            await this.getAuthenticatedApi().post(`http://${this.apiService.getLibrarianUrl()}/storeData`, {
                collection: collectionName,
                id: toolDefinition.id, // The ID of the raw OpenAPITool or MCPTool
                data: dataToStore,
                storageType: 'mongo',
            });
            console.log(`LibrarianDefinitionRepository: Stored ${defManifest.definitionType} tool definition ${toolDefinition.id} in ${collectionName}.`);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`LibrarianDefinitionRepository: Error storing definition ${toolDefinition.id}:`, error);
            throw error;
        }
    }

    async delete(id: string, version?: string): Promise<void> {
        // ID here is toolId-actionVerb. We need to delete the parent tool definition.
        const parts = id.split('-');
        parts.pop(); // remove actionVerb part
        const toolId = parts.join('-');

        if (!toolId) {
            console.error(`LibrarianDefinitionRepository: Invalid ID format for delete: ${id}. Could not extract toolId.`);
            throw new Error(`Invalid ID format for delete: ${id}.`);
        }

        let deleted = false;
        const collectionsToTry = this.handlersCollectionName ? [this.handlersCollectionName] : [this.openApiCollectionName, this.mcpCollectionName];

        for (const collectionName of collectionsToTry) {
            try {
                 // Check if exists before deleting to avoid error if not in this specific collection
                const existing = await this.fetchToolDefinitionById(toolId, collectionName);
                if (existing) {
                    await this.getAuthenticatedApi().delete(`http://${this.apiService.getLibrarianUrl()}/deleteData/${toolId}`, {
                        params: { collection: collectionName, storageType: 'mongo' },
                    });
                    console.log(`LibrarianDefinitionRepository: Deleted tool definition ${toolId} from ${collectionName}.`);
                    deleted = true;
                    break; // Found and deleted
                }
            } catch (error: any) {
                 // If error is not 404, then it's a real issue
                if (!error.response || error.response.status !== 404) {
                    analyzeError(error);
                    console.error(`LibrarianDefinitionRepository: Error deleting definition ${toolId} from ${collectionName}:`, error);
                    throw error; // Re-throw if it's a significant error
                }
                // If 404, it just means it wasn't in this collection, try next.
            }
        }
        if (!deleted && !this.handlersCollectionName) { // If using separate collections and not found in either
             console.warn(`LibrarianDefinitionRepository: Tool definition ${toolId} not found in any configured collection for deletion.`);
        } else if (!deleted && this.handlersCollectionName) {
            console.warn(`LibrarianDefinitionRepository: Tool definition ${toolId} not found in ${this.handlersCollectionName} for deletion.`);
        }
    }

    // Optional methods from PluginRepository interface if needed
    async fetchAllVersionsOfPlugin?(pluginId: string): Promise<PluginManifest[] | undefined> {
        // Versioning of definitions in Librarian needs a strategy.
        // For now, assume one version or version is part of the ID.
        const manifest = await this.fetch(pluginId);
        return manifest ? [manifest] : undefined;
    }
}
