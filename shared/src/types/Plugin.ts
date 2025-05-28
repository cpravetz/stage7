export enum PluginParameterType {
    STRING = 'string',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
    ARRAY = 'array',
    OBJECT = 'object',
    PLAN = 'plan',
    PLUGIN = 'plugin',
    ERROR = 'error',
    ANY = 'any' // Retained from a previous version, useful for flexibility
}

export interface PluginParameter {
    name: string;
    required: boolean;
    type: PluginParameterType;
    description: string;
    mimeType?: string;
    defaultValue?: any;
    args?: Record<string, any>; // Added field
}

export interface EntryPointType {
    main: string;
    files?: Record<string, string>;
}

export interface PluginPackage {
    type: 'git' | 'archive' | 'inline';
    url?: string;
    commitHash?: string;
    branch?: string;
    subPath?: string;
}

export interface PluginSecurity {
    permissions: string[];
    sandboxOptions: {
        allowEval: boolean;
        timeout: number;
        memory: number;
        allowedModules: string[];
        allowedAPIs: string[];
    };
    trust: {
        signature?: string;
        publisher?: string;
        certificateHash?: string;
    };
}

// Updated PluginConfigurationItem
export interface PluginConfigurationItem {
    key: string;
    value?: string | number | boolean | null; // Made value optional and can be null
    description: string;
    required: boolean; // If true, 'value' must be provided (not undefined, though null might be acceptable if type allows)
    type: 'string' | 'number' | 'boolean' | 'secret';
}

// This is the standard, replacing MetadataType
export interface PluginMetadata {
    author?: string;
    website?: string;
    license?: string;
    category?: string[];
    tags?: string[];
    versionScheme?: 'semver' | 'custom';
    dependencies?: Record<string, string>;
    compatibility?: {
        minHostVersion?: string;
    };
    [key: string]: any;
}

export interface PluginDefinition {
    id: string;
    verb: string;
    description: string;
    explanation?: string;
    inputDefinitions: PluginParameter[];
    outputDefinitions: PluginParameter[];
    language: 'javascript' | 'python' | 'openapi' | 'container' | string;
    entryPoint?: EntryPointType;
    packageSource?: PluginPackage;
    security: PluginSecurity;
    configuration?: PluginConfigurationItem[]; // Uses the updated PluginConfigurationItem
    version: string;
    metadata?: PluginMetadata; // Uses PluginMetadata
    createdAt?: string;
    updatedAt?: string;
    // Container-specific configuration for containerized plugins
    container?: {
        dockerfile: string;
        buildContext: string;
        image: string;
        ports: Array<{ container: number; host: number }>;
        environment: { [key: string]: string };
        resources: {
            memory: string;
            cpu: string;
        };
        healthCheck: {
            path: string;
            interval: string;
            timeout: string;
            retries: number;
        };
    };
    // API configuration for container communication
    api?: {
        endpoint: string;
        method: 'GET' | 'POST' | 'PUT' | 'DELETE';
        timeout: number;
    };
}

// Types confirmed by user as needed and previously defined here
export interface StepDependency {
    inputName: string;
    sourceStepId: string;
    outputName: string;
}

export interface PlanDependency {
    inputName: string;
    sourceStepNo: number;
    sourceStepId?: string;
    outputName: string;
}

export interface ActionVerbTask {
    id?: string;
    verb: string;
    inputs: Map<string, PluginInput>; // Assuming PluginInput is defined/imported
    expectedOutputs?: Map<string, string>;
    description?: string;
    dependencies?: PlanDependency[];
    recommendedRole?: string;
}

// Assuming PluginInput is also defined in this file or another commonly imported one
// If not, it needs to be defined or imported. For now, I'll add its definition here
// based on previous context if it was missed.
export interface PluginInput {
    inputName: string;
    inputValue: any;
    inputSource?: string; // Optional: to trace where an input value came from (e.g., stepId.outputName)
    args: Record<string, any>; // Optional: any additional arguments relevant to this input
}

// Assuming PluginOutput is also needed here for completeness
export interface PluginOutput {
    success: boolean;
    name: string;
    resultType: PluginParameterType;
    result: any;
    resultDescription: string,
    error?: string,
    mimeType?: string,
    fileName?: string, // Optional suggested filename for the result
    console?: any[]
}

// For environmentType, ensure ConfigItem is also defined or imported if it's distinct
// For now, assuming ConfigItem from original Plugin.ts was meant to be PluginConfigurationItem
export enum ConfigItemType { // Re-adding if it was part of an old ConfigItem that PluginConfigurationItem replaces
    CREDENTIAL = 'credential',
    SETTING = 'setting',
    SECRET = 'secret',
    ENVIRONMENT = 'environment'
}
export type environmentType = {
    env: NodeJS.ProcessEnv; // or Record<string, string | undefined>
    credentials: PluginConfigurationItem[]; // Using the updated one
};

export interface Step {
    id: string;
    stepNo: number;
    actionVerb: string;
    description?: string;
    inputs: Map<string, PluginInput>;
    dependencies: StepDependency[];
    status: 'pending' | 'running' | 'completed' | 'error';
    result?: PluginOutput[];
    timeout?: number;

}