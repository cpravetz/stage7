import { PluginParameter } from './Plugin';

/**
 * Defines how to connect to and invoke an MCP service.
 */
export interface MCPServiceTarget {
    // Example: 'mcp-billing-service', 'mcp-user-management'
    // This could be a logical name resolved via service discovery
    // or a direct hostname/URL part.
    serviceName: string;

    // Example: '/api/v1/performAction', 'PerformBillingAction'
    // The specific endpoint, RPC method, or command on the target MCP service.
    endpointOrCommand: string;

    // Standard HTTP methods, or could be 'RPC', 'MESSAGE_QUEUE', etc.
    // to indicate the interaction pattern.
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'RPC' | 'MESSAGE_QUEUE' | string;

    // Any additional static parameters or configuration needed for this target.
    // For example, specific headers, queue names, etc.
    // Dynamic parameters will come from the Step's inputs.
    additionalConfig?: Record<string, any>;
}

/**
 * MCP Tool authentication configuration.
 * Similar to OpenAPIAuthentication but potentially with MCP-specific schemes.
 */
export interface MCPAuthentication {
    type: 'none' | 'apiKey' | 'oauth2' | 'customToken' | string; // Extensible for MCP-specific auth

    // For API Key authentication
    apiKey?: {
        in: 'header' | 'query' | 'body';
        name: string;
        // Could be a direct value (less secure, for dev) or a reference to a secret/credential store.
        value?: string;
        credentialSource?: string; // Preferred: Reference to credential storage
    };

    // For OAuth2 authentication (if MCP services use it)
    oauth2?: {
        tokenUrl?: string;
        clientId?: string;
        clientSecret?: string; // Or credentialSource for secret
        scopes?: string[];
        credentialSource?: string; // For fetching existing tokens or refresh tokens
    };

    // For custom token-based authentication
    customToken?: {
        headerName: string;
        tokenPrefix?: string; // e.g., "Bearer "
        credentialSource: string; // Source to get the custom token
    };

    // Other auth-specific fields as needed
    [key: string]: any;
}

/**
 * Defines mapping from an actionVerb to a specific MCP service invocation.
 */
export interface MCPActionMapping {
    actionVerb: string;
    description?: string;

    // Defines the target MCP service and how to call it
    mcpServiceTarget: MCPServiceTarget;

    // Defines the inputs this actionVerb expects, using PluginParameter structure
    inputs: PluginParameter[];

    // Defines the outputs this actionVerb produces, using PluginParameter structure
    outputs: PluginParameter[];

    // Optional: Specific timeout for this action in milliseconds.
    // Overrides any default timeout in CapabilitiesManager.
    timeout?: number;

    // Optional: Default values for inputs, if not provided in the step.
    defaultInputValues?: Record<string, any>;
}

/**
 * MCP Tool definition.
 * Represents a tool or capability provided by an external MCP system.
 */
export interface MCPTool {
    id: string; // Unique ID, e.g., "mcp-billing-tool"
    name: string; // Human-readable name, e.g., "MCP Billing Operations"
    description: string;
    version: string; // Semantic version of this tool definition

    // Defines how CapabilitiesManager should authenticate with the MCP services
    // targeted by this tool (if not specified per action mapping).
    // ActionMapping-level authentication can override this.
    authentication?: MCPAuthentication;

    // Array of action mappings provided by this tool
    actionMappings: MCPActionMapping[];

    // Standard metadata
    metadata: {
        author?: string;
        created: string; // ISO Date string
        updated?: string; // ISO Date string
        tags?: string[];
        category?: string; // e.g., "finance", "user_management"
        // Link to documentation for this MCP tool/service
        documentationUrl?: string;
    };
}

/**
 * Request to register or update an MCP Tool.
 */
export interface MCPToolRegistrationRequest {
    toolDefinition: MCPTool;
}

/**
 * MCP Tool execution request (internal to CapabilitiesManager, for clarity)
 */
export interface MCPExecutionRequest {
    tool: MCPTool;
    actionMapping: MCPActionMapping;
    inputs: { [key: string]: any }; // Resolved inputs for the specific action
    trace_id: string;
}

/**
 * MCP Tool execution result (internal to CapabilitiesManager, for clarity)
 */
export interface MCPExecutionResult {
    success: boolean;
    outputs?: { [key: string]: any };
    error?: string;
    statusCode?: number; // If applicable (e.g., from HTTP calls)
    rawResponse?: any; // For debugging or complex responses
}
