import { PluginParameterType } from './Plugin';


/**
 * OpenAPI authentication configuration
 */
export interface OpenAPIAuthentication {
    type: 'none' | 'apiKey' | 'bearer' | 'oauth2' | 'basic';
    // For API Key authentication
    apiKey?: {
        in: 'header' | 'query' | 'cookie';
        name: string;
        credentialSource: string; // Reference to credential storage
    };
    // For Bearer token authentication
    bearer?: {
        credentialSource: string;
    };
    // For OAuth2 authentication
    oauth2?: {
        authorizationUrl?: string;
        tokenUrl?: string;
        scopes?: string[];
        credentialSource: string;
    };
    // For Basic authentication
    basic?: {
        credentialSource: string; // Should contain username:password
    };
}

/**
 * Parameter mapping for OpenAPI operations
 */
export interface OpenAPIParameterMapping {
    name: string;
    in: 'path' | 'query' | 'header' | 'body';
    type: PluginParameterType;
    required: boolean;
    description?: string;
    default?: any;
    schema?: any; // JSON Schema for complex types
}

/**
 * Response mapping for OpenAPI operations
 */
export interface OpenAPIResponseMapping {
    name: string;
    type: PluginParameterType;
    description?: string;
    schema?: any; // JSON Schema for complex types
    statusCode?: number; // HTTP status code this response maps to
}

/**
 * Action verb mapping to OpenAPI operation
 */
export interface OpenAPIActionMapping {
    actionVerb: string;
    operationId: string;
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
    path: string;
    description?: string;
    inputs: OpenAPIParameterMapping[];
    outputs: OpenAPIResponseMapping[];
    timeout?: number; // Operation timeout in milliseconds
}

/**
 * OpenAPI tool definition
 */
export interface OpenAPITool {
    id: string;
    name: string;
    description: string;
    version: string;
    specUrl: string; // URL to the OpenAPI specification
    specVersion: '2.0' | '3.0' | '3.1'; // OpenAPI/Swagger version
    baseUrl: string; // Base URL for API calls
    authentication: OpenAPIAuthentication;
    actionMappings: OpenAPIActionMapping[];
    metadata: {
        author?: string;
        created: Date;
        updated?: Date;
        tags: string[];
        category: string;
        rateLimit?: {
            requestsPerSecond?: number;
            requestsPerMinute?: number;
            requestsPerHour?: number;
        };
        reliability?: {
            uptime?: number; // Percentage
            averageResponseTime?: number; // Milliseconds
        };
    };
}

/**
 * OpenAPI tool registration request
 */
export interface OpenAPIToolRegistrationRequest {
    name: string;
    description: string;
    specUrl: string;
    authentication: OpenAPIAuthentication;
    baseUrl?: string; // If different from spec
    actionMappings?: Partial<OpenAPIActionMapping>[]; // Optional custom mappings
    metadata?: {
        author?: string;
        tags?: string[];
        category?: string;
    };
}

/**
 * OpenAPI specification parsing result
 */
export interface OpenAPIParsingResult {
    success: boolean;
    tool?: OpenAPITool;
    errors?: string[];
    warnings?: string[];
    discoveredOperations?: {
        operationId: string;
        method: string;
        path: string;
        summary?: string;
        description?: string;
        parameters: any[];
        responses: any;
    }[];
}

/**
 * OpenAPI tool execution request
 */
export interface OpenAPIExecutionRequest {
    toolId: string;
    actionVerb: string;
    inputs: { [key: string]: any };
    timeout?: number;
    retries?: number;
}

/**
 * OpenAPI tool execution result
 */
export interface OpenAPIExecutionResult {
    success: boolean;
    outputs?: { [key: string]: any };
    error?: string;
    statusCode?: number;
    responseTime?: number; // Milliseconds
    retryCount?: number;
}

/**
 * OpenAPI tool validation result
 */
export interface OpenAPIToolValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
    specValidation?: {
        valid: boolean;
        errors: string[];
    };
    authValidation?: {
        valid: boolean;
        errors: string[];
    };
    connectivityTest?: {
        success: boolean;
        responseTime?: number;
        error?: string;
    };
}

/**
 * OpenAPI tool search criteria
 */
export interface OpenAPIToolSearchCriteria {
    query?: string;
    category?: string;
    tags?: string[];
    author?: string;
    hasAuthentication?: boolean;
    specVersion?: string;
    baseUrl?: string;
}

/**
 * Composed tool definition - combines multiple tools/capabilities
 */
export interface ComposedTool {
    id: string;
    name: string;
    description: string;
    version: string;
    actionVerb: string;
    inputs: OpenAPIParameterMapping[];
    outputs: OpenAPIResponseMapping[];
    workflow: {
        steps: {
            id: string;
            toolId: string; // Reference to plugin, OpenAPI tool, or another composed tool
            actionVerb: string;
            inputs: { [key: string]: string | any }; // Can reference previous step outputs
            condition?: string; // Optional execution condition
        }[];
        errorHandling?: {
            retryPolicy?: {
                maxAttempts: number;
                backoffMs: number;
            };
            fallbackSteps?: string[]; // Alternative steps to execute on failure
        };
    };
    metadata: {
        author: string;
        created: Date;
        updated?: Date;
        tags: string[];
        category: string;
        dependencies: string[]; // IDs of tools this composed tool depends on
    };
}
