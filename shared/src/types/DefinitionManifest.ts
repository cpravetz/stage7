import { PluginManifest } from './PluginManifest'; // Assuming PluginParameterType might be useful for common parts
import { OpenAPITool } from './OpenAPITool';
import { MCPTool } from './MCPTool';
import { PluginParameter } from './Plugin';

/**
 * Represents the type of definition held by the manifest.
 */
export enum DefinitionType {
    OPENAPI = 'openapi',
    MCP = 'mcp',
    // Future definition-based tools can be added here
}

/**
 * A specialized PluginManifest for tools that are primarily definition-based (like OpenAPI, MCP tools)
 * rather than code-based.
 *
 * The `language` field from PluginManifest should be set to a value from DefinitionType.
 * The `entryPoint` and `packageSource` fields from PluginManifest might be less relevant or unused.
 * The `verb` field in PluginManifest would typically be the primary or most common actionVerb this definition handles,
 * or a general verb representing the tool itself if it has multiple actionVerbs.
 * Individual actionVerbs are defined within the toolDefinition's actionMappings.
 */
export interface DefinitionManifest extends PluginManifest {
    /**
     * Specifies the type of the tool definition.
     * This should align with the `language` field in the base PluginManifest.
     * e.g., language: 'openapi', definitionType: DefinitionType.OPENAPI
     */
    definitionType: DefinitionType;

    /**
     * The actual tool definition object (either OpenAPITool or MCPTool).
     */
    toolDefinition: OpenAPITool | MCPTool;

    /**
     * The primary action verb this manifest is registered for.
     * While OpenAPITool/MCPTool can have multiple actionMappings,
     * the manifest itself is often indexed or fetched via one primary verb.
     * This might be redundant if PluginManifest.verb is always used and sufficient.
     */
    primaryActionVerb: string;
}

/**
 * Helper function to create a DefinitionManifest for an OpenAPITool.
 * @param tool - The OpenAPITool definition.
 * @param primaryVerb - The main actionVerb this manifest will be associated with.
 *                      This should be one of the actionVerbs defined in the tool's actionMappings.
 * @returns DefinitionManifest
 */
export function createOpenApiDefinitionManifest(tool: OpenAPITool, primaryVerb: string): DefinitionManifest {
    const primaryActionMapping = tool.actionMappings.find(m => m.actionVerb === primaryVerb);

    return {
        id: `${tool.id}-${primaryVerb}`,
        verb: primaryVerb,
        description: primaryActionMapping?.description || tool.description,
        explanation: tool.description,
        inputDefinitions: mapOpenApiInputsToPluginParameters(primaryActionMapping?.inputs || []),
        outputDefinitions: mapOpenApiOutputsToPluginParameters(primaryActionMapping?.outputs || []),
        language: DefinitionType.OPENAPI,
        version: tool.version,
        metadata: {
            ...(tool.metadata as any),
            sourceToolId: tool.id,
        },
        security: {
            permissions: [],
            sandboxOptions: { allowEval: false, timeout: 5000, memory: 128, allowedModules: [], allowedAPIs: [] },
            trust: {},
        },
        definitionType: DefinitionType.OPENAPI,
        toolDefinition: tool,
        primaryActionVerb: primaryVerb,
        repository: {
            type: 'librarian-definition' as any,
            url: '',
        }
    };
}

/**
 * Helper function to create a DefinitionManifest for an MCPTool.
 * @param tool - The MCPTool definition.
 * @param primaryVerb - The main actionVerb this manifest will be associated with.
 *                      This should be one of the actionVerbs defined in the tool's actionMappings.
 * @returns DefinitionManifest
 */
export function createMcpDefinitionManifest(tool: MCPTool, primaryVerb: string): DefinitionManifest {
    const primaryActionMapping = tool.actionMappings.find(m => m.actionVerb === primaryVerb);

    return {
        id: `${tool.id}-${primaryVerb}`, // Manifest ID could be toolID + primary verb
        verb: primaryVerb,
        description: primaryActionMapping?.description || tool.description,
        explanation: tool.description,
        inputDefinitions: primaryActionMapping?.inputs || [],
        outputDefinitions: primaryActionMapping?.outputs || [],
        language: DefinitionType.MCP, // Set language to 'mcp'
        version: tool.version,
        metadata: {
            ...(tool.metadata as any),
            sourceToolId: tool.id,
        },
        security: {
            permissions: [],
            sandboxOptions: { allowEval: false, timeout: 5000, memory: 128, allowedModules: [], allowedAPIs: [] },
            trust: {},
        },
        definitionType: DefinitionType.MCP,
        toolDefinition: tool,
        primaryActionVerb: primaryVerb,
        repository: { // Placeholder
            type: 'librarian-definition' as any,
            url: '',
        }
    };
}

/**
 * Utility to map OpenAPIActionMapping outputs to PluginParameter[]
 * Ensures compatibility between OpenAPI outputs and PluginParameter[] for manifest creation.
 * @param outputs Array of OpenAPIResponseMapping
 * @returns PluginParameter[]
 */
function mapOpenApiOutputsToPluginParameters(outputs: any[]): PluginParameter[] {
    return outputs.map(o => ({
        name: o.name,
        type: o.type,
        description: o.description || '',
        required: true, // OpenAPI outputs are assumed required for manifest
        // Add more fields if needed for PluginParameter compatibility
    }));
}

/**
 * Utility to map OpenAPIActionMapping inputs to PluginParameter[]
 * Ensures compatibility between OpenAPI inputs and PluginParameter[] for manifest creation.
 * @param inputs Array of OpenAPIRequestMapping
 * @returns PluginParameter[]
 */
function mapOpenApiInputsToPluginParameters(inputs: any[]): PluginParameter[] {
    return (inputs || []).map(i => ({
        name: i.name,
        type: i.type,
        description: i.description || '',
        required: !!i.required,
        defaultValue: i.default,
        // Add more fields if needed for PluginParameter compatibility
    }));
}
