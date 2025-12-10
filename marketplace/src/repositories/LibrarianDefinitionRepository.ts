import {
    PluginManifest,
    PluginLocator,
    PluginRepository,
    PluginStatus,
    RepositoryConfig,
    OpenAPITool,
    MCPTool,
    DefinitionManifest,
    DefinitionType,
    createOpenApiDefinitionManifest,
    createMcpDefinitionManifest,
    createAuthenticatedAxios
} from '@cktmcs/shared';
import { AxiosInstance } from 'axios';
import { analyzeError } from '@cktmcs/errorhandler';

export interface LibrarianDefinitionRepositoryConfig extends RepositoryConfig {
    type: 'librarian-definition';
    librarianUrl: string;
    securityManagerUrl: string;
    openApiToolsCollection?: string;
    mcpToolsCollection?: string;
    actionHandlersCollection?: string;
}

export class LibrarianDefinitionRepository implements PluginRepository {
    type: 'librarian-definition' = 'librarian-definition';
    private config: LibrarianDefinitionRepositoryConfig;
    private authenticatedApi: AxiosInstance;
    private openApiCollectionName: string;
    private mcpCollectionName: string;
    private handlersCollectionName: string | undefined;
    private circuitState: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
    private failureCount = 0;
    private lastFailureTime = 0;
    private readonly failureThreshold = 3;
    private readonly openTimeout = 300000; // 5 minutes


    constructor(config: RepositoryConfig) {
        this.config = config as LibrarianDefinitionRepositoryConfig;
        
        this.authenticatedApi = createAuthenticatedAxios({
            serviceId: 'LibrarianDefinitionRepository',
            securityManagerUrl: this.config.securityManagerUrl,
            clientSecret: process.env.CLIENT_SECRET || 'stage7AuthSecret'
        });
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

    private async makeRequest<T>(request: () => Promise<T>): Promise<T> {
        if (this.circuitState === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.openTimeout) {
                this.circuitState = 'HALF_OPEN';
            } else {
                throw new Error('Circuit is open. Librarian service is temporarily unavailable.');
            }
        }

        try {
            const response = await request();
            this.failureCount = 0;
            this.circuitState = 'CLOSED';
            return response;
        } catch (error) {
            this.failureCount++;
            this.lastFailureTime = Date.now();
            if (this.circuitState === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
                this.circuitState = 'OPEN';
                console.error(`Circuit is now OPEN for LibrarianDefinitionRepository.`);
            }
            throw error;
        }
    }

    private getCollectionForType(type: DefinitionType | 'openapi' | 'mcp'): string {
        if (this.handlersCollectionName) return this.handlersCollectionName;
        if (String(type) === DefinitionType.OPENAPI) return this.openApiCollectionName;
        return this.mcpCollectionName;
    }

    private getLibrarianUrl(): string {
        const url = this.config.librarianUrl;
        if (!url) {
            return '';
        }
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return url;
        }
        return `http://${url}`;
    }

    async list(): Promise<PluginLocator[]> {
        const locators: PluginLocator[] = [];
        try {
            if (this.handlersCollectionName) {
                const allHandlers = await this.fetchAllFromCollection(this.handlersCollectionName);
                locators.push(...allHandlers);
            } else {
                const openApiTools = await this.fetchAllFromCollection(this.openApiCollectionName, DefinitionType.OPENAPI);
                locators.push(...openApiTools);

                const mcpTools = await this.fetchAllFromCollection(this.mcpCollectionName, DefinitionType.MCP);
                locators.push(...mcpTools);
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
            const response = await this.makeRequest(() => this.authenticatedApi.post(`${this.getLibrarianUrl()}/queryData`, {
                collection: collectionName,
                query: definitionType && this.handlersCollectionName ? { handlerType: definitionType } : {},
                limit: 1000,
            }));

            const tools: Array<OpenAPITool | MCPTool> = response.data?.data || [];

            for (const tool of tools) {
                const actualDefinitionType = (tool as any).definitionType ||
                                           (tool.hasOwnProperty('specUrl') ? DefinitionType.OPENAPI : DefinitionType.MCP);
                if (definitionType && this.handlersCollectionName && actualDefinitionType !== definitionType) {
                    continue;
                }
                for (const mapping of tool.actionMappings) {
                    locators.push({
                        id: `${tool.id}-${mapping.actionVerb}`,
                        verb: mapping.actionVerb,
                        version: tool.version,
                        repository: { type: this.type, url: this.config.librarianUrl },
                        language: actualDefinitionType,
                    });
                }
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`LibrarianDefinitionRepository: Error fetching from collection ${collectionName}:`, error);
        }
        return locators;
    }

    async fetch(id: string, version?: string): Promise<PluginManifest | undefined> {
        // ID here is expected to be toolId-actionVerb
        const parts = id.split('-');
        const actionVerb = parts.pop();
        const toolId = parts.join('-');

        if (!actionVerb || !toolId) {
            console.error(`LibrarianDefinitionRepository: Invalid ID format for fetch: ${id}. Expected 'toolId-actionVerb'.`);
            return undefined;
        }

        try {
            if (this.handlersCollectionName) {
                const toolDef = await this.fetchToolDefinitionById(toolId, this.handlersCollectionName);
                if (toolDef) {
                    if (toolDef.hasOwnProperty('specUrl') && (toolDef as OpenAPITool).actionMappings.some(m => m.actionVerb === actionVerb)) {
                        return createOpenApiDefinitionManifest(toolDef as OpenAPITool, actionVerb) as unknown as PluginManifest;
                    } else if (!(toolDef as any).specUrl && (toolDef as MCPTool).actionMappings.some(m => m.actionVerb === actionVerb)) {
                        return createMcpDefinitionManifest(toolDef as MCPTool, actionVerb) as unknown as PluginManifest;
                    }
                }
            } else {
                // Try fetching from OpenAPI collection
                let toolDef = await this.fetchToolDefinitionById(toolId, this.openApiCollectionName);
                if (toolDef && toolDef.hasOwnProperty('specUrl') && (toolDef as OpenAPITool).actionMappings.some(m => m.actionVerb === actionVerb)) {
                    return createOpenApiDefinitionManifest(toolDef as OpenAPITool, actionVerb) as unknown as PluginManifest;
                }

                // Try fetching from MCP collection
                toolDef = await this.fetchToolDefinitionById(toolId, this.mcpCollectionName);
                if (toolDef && !(toolDef as any).specUrl && (toolDef as MCPTool).actionMappings.some(m => m.actionVerb === actionVerb)) {
                    return createMcpDefinitionManifest(toolDef as MCPTool, actionVerb) as unknown as PluginManifest;
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
            const response = await this.makeRequest(() => this.authenticatedApi.get(`${this.getLibrarianUrl()}/loadData/${toolId}`, {
                params: { collection: collectionName, storageType: 'mongo' },
            }));
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


        async fetchByVerb(verb: string, version?: string): Promise<PluginManifest | undefined> {
        try {
            if (this.handlersCollectionName) {
                const queryResponse = await this.makeRequest(() => this.authenticatedApi.post(`${this.getLibrarianUrl()}/queryData`, {
                    collection: this.handlersCollectionName,
                    query: { 'actionMappings.actionVerb': verb },
                    limit: 1,
                }));
                const tool = queryResponse.data?.data?.[0];
                if (tool) {
                    if (tool.hasOwnProperty('specUrl')) return createOpenApiDefinitionManifest(tool as OpenAPITool, verb) as unknown as PluginManifest;
                    return createMcpDefinitionManifest(tool as MCPTool, verb) as unknown as PluginManifest;
                }
            } else {
                // Query OpenAPI tools
                let queryResponse = await this.makeRequest(() => this.authenticatedApi.post(`${this.getLibrarianUrl()}/queryData`, {
                    collection: this.openApiCollectionName,
                    query: { 'actionMappings.actionVerb': verb },
                    limit: 1,
                }));
                let tool = queryResponse.data?.data?.[0];
                if (tool && tool.hasOwnProperty('specUrl')) {
                    return createOpenApiDefinitionManifest(tool as OpenAPITool, verb) as unknown as PluginManifest;
                }

                // Query MCP tools
                queryResponse = await this.makeRequest(() => this.authenticatedApi.post(`${this.getLibrarianUrl()}/queryData`, {
                    collection: this.mcpCollectionName,
                    query: { 'actionMappings.actionVerb': verb },
                    limit: 1,
                }));
                tool = queryResponse.data?.data?.[0];
                if (tool && !tool.hasOwnProperty('specUrl')) {
                    return createMcpDefinitionManifest(tool as MCPTool, verb) as unknown as PluginManifest;
                }
            }
        } catch (error) {
            analyzeError(error as Error);
            console.error(`LibrarianDefinitionRepository: Error fetching definition by verb ${verb}:`, error);
        }
        return undefined;
    }

    async store(manifest: PluginManifest): Promise<void> {
        const defManifest = manifest as unknown as DefinitionManifest;
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
            await this.makeRequest(() => this.authenticatedApi.post(`${this.getLibrarianUrl()}/storeData`, {
                collection: collectionName,
                id: toolDefinition.id, // The ID of the raw OpenAPITool or MCPTool
                data: dataToStore,
                storageType: 'mongo',
            }));
            console.log(`LibrarianDefinitionRepository: Stored ${defManifest.definitionType} tool definition ${toolDefinition.id} in ${collectionName}.`);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`LibrarianDefinitionRepository: Error storing definition ${toolDefinition.id}:`, error);
            throw error;
        }

        // After storing, index for discovery
        try {
            await this.indexForDiscovery(manifest);
        } catch (error) {
            console.warn(`LibrarianDefinitionRepository: Failed to index verb '${manifest.verb}' for discovery after storing. This might need manual re-indexing.`, error);
            // We don't re-throw here, as the primary store operation succeeded.
        }
    }

    async indexForDiscovery(manifest: PluginManifest): Promise<void> {
        const { verb, description, semanticDescription, capabilityKeywords, usageExamples, id } = manifest;
    
        if (!verb) {
            console.warn('LibrarianDefinitionRepository: Manifest must have a verb to be indexed for discovery.');
            return;
        }
    
        const discoveryData = {
            id: id,
            verb,
            description,
            semanticDescription,
            capabilityKeywords,
            usageExamples,
        };
    
        try {
            await this.makeRequest(() => this.authenticatedApi.post(`${this.getLibrarianUrl()}/verbs/register`, 
                discoveryData
            ));
            console.log(`LibrarianDefinitionRepository: Indexed verb '${verb}' for discovery.`);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`LibrarianDefinitionRepository: Error indexing verb '${verb}' for discovery:`, error);
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
                    await this.makeRequest(() => this.authenticatedApi.delete(`${this.getLibrarianUrl()}/deleteData/${toolId}`, {
                        params: { collection: collectionName, storageType: 'mongo' },
                    }));
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

    async updateToolStatus(toolId: string, status: PluginStatus, reason?: string): Promise<void> {
        try {
            await this.makeRequest(() => this.authenticatedApi.put(`${this.getLibrarianUrl()}/tools/${toolId}/status`, {
                status,
                reason,
            }));
            console.log(`LibrarianDefinitionRepository: Updated status for tool ${toolId} to ${status}.`);
        } catch (error) {
            analyzeError(error as Error);
            console.error(`LibrarianDefinitionRepository: Error updating status for tool ${toolId}:`, error);
            throw error;
        }
    }
}
