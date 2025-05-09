export enum PluginParameterType {
    STRING = 'string',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
    ARRAY = 'array',
    OBJECT = 'object',
    PLAN = 'plan',
    PLUGIN = 'plugin',
    ERROR = 'error',
    ANY = 'any'
}

export enum ConfigItemType {
    CREDENTIAL = 'credential',  // Sensitive data like passwords
    SETTING = 'setting',       // Regular configuration
    SECRET = 'secret',         // Encrypted values
    ENVIRONMENT = 'environment' // Environment variables
}

export interface ConfigItem {
    key: string;
    type: ConfigItemType;
    description: string;
    required: boolean;
    default?: string;
    validation?: {
        pattern?: string;
        minLength?: number;
        maxLength?: number;
        options?: string[];
    };
    value?: string;
}

export type environmentType = {
    env: NodeJS.ProcessEnv;
    credentials: ConfigItem[];
};

export interface EntryPointType {
    main: string;
    files: Record<string,string>;
    test: Record<string,string>;
}

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

export interface MetadataType {
    category: string[];
    tags: string[];
    complexity: number;
    dependencies: string[];
    version: string;
    lastUsed?: Date;
    usageCount?: number;
}

export interface PluginDefinition {
    id: string;
    verb: string;
    description?: string;
    explanation?: string;
    inputDefinitions: PluginParameter[];
    outputDefinitions: PluginParameter[];
    entryPoint?: EntryPointType;
    language: 'javascript' | 'python' | 'typescript';
    version : string;
    configuration?: ConfigItem[];
    metadata?: MetadataType;
    security: {
        permissions: string[];        // Required permissions like 'fs.read', 'net.fetch'
        sandboxOptions: {            // VM sandbox configuration
            allowEval: boolean;
            timeout: number;
            memory: number;
            allowedModules: string[];
            allowedAPIs: string[];
        };
        trust: {                     // Trust and verification
            signature?: string;      // Code signature
            publisher?: string;      // Verified publisher
            certificateHash?: string;// Certificate hash for verification
        };
    };
}

export interface PluginParameter {
    name: string;
    required: boolean;
    type: PluginParameterType;
    description: string;
    mimeType?: string;
}

export interface PluginInput {
    inputName: string;
    inputValue: any;
    inputSource?: string;
    args: Record<string, any>;
}

export interface PluginOutput {
    success: boolean;
    name: string;
    resultType: PluginParameterType;
    result: any;
    resultDescription: string,
    error?: string,
    mimeType?: string,
    console?: any[]
}

export interface StepDependency {
    inputName: string;      // The input variable that needs the value
    sourceStepId: string;   // The step that provides the value
    outputName: string;     // The specific output to use from the source step
}

export interface PlanDependency {
    inputName: string;
    sourceStepNo: number;  // Using step number instead of ID during planning
    sourceStepId?: string;
    outputName: string;
}

export type PluginChangeEvent = {
    type: 'PUBLISHED' | 'UPDATED' | 'DELETED';
    plugin: PluginDefinition;
    signature?: string;
};

export interface ActionVerbTask {
    id?: string;
    verb: string;
    inputs: Map<string, PluginInput>;
    expectedOutputs?: Map<string, string>;
    description?: string;
    dependencies?: PlanDependency[];
    recommendedRole?: string;
}