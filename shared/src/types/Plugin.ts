export enum PluginParameterType {
    STRING = 'string',
    NUMBER = 'number',
    BOOLEAN = 'boolean',
    ARRAY = 'array',
    OBJECT = 'object',
    PLAN = 'plan',
    PLUGIN = 'plugin',
    ERROR = 'error'
}

export interface PluginParameter {
    name: string;
    required: boolean;
    type: PluginParameterType;
    description: string;
    mimeType?: string; // Optional: Specify MIME type for inputs/outputs if relevant (e.g., 'application/json', 'text/plain', 'image/png')
    defaultValue?: any; // Optional: A default value for an input if not provided
}

export interface EntryPointType {
    main: string; // Name of entry point file (e.g., 'main.py', 'index.js')
    files?: Record<string, string>; // Code content as filename: filecontent. Optional if using packageSource.
}

// New interface for defining plugin package source
export interface PluginPackage {
    type: 'git' | 'archive' | 'inline'; // 'inline' refers to current entryPoint.files model
    url?: string;       // For 'git' (repo URL) or 'archive' (URL to .zip/.tar.gz)
    commitHash?: string; // For 'git' to pin to a specific commit
    branch?: string;    // For 'git' to pin to a specific branch/tag (defaults to repo default if not set)
    subPath?: string;   // Optional sub-directory within the repo/archive where the plugin's main entrypoint and files reside
}

export interface PluginSecurity {
    permissions: string[]; // e.g., 'fs.read', 'net.fetch', 'llm.query'
    sandboxOptions: {
        allowEval: boolean;
        timeout: number; // in milliseconds
        memory: number; // in MB
        allowedModules: string[]; // for JS sandbox
        allowedAPIs: string[]; // specific external APIs plugin can call
    };
    trust: {
        signature?: string;
        publisher?: string; // ID or name of the publisher
        certificateHash?: string; // Hash of a code-signing certificate
    };
}

export interface PluginConfigurationItem {
    key: string;
    value: string | number | boolean | null;
    description: string;
    required: boolean;
    type: 'string' | 'number' | 'boolean' | 'secret'; // 'secret' for sensitive values
}

export interface PluginMetadata {
    author?: string;
    website?: string;
    license?: string;
    category?: string[]; // e.g., 'text_generation', 'file_processing', 'communication'
    tags?: string[];
    versionScheme?: 'semver' | 'custom'; // How versioning is handled
    dependencies?: Record<string, string>; // e.g., other plugins or library versions like {"python": ">=3.8"}
    compatibility?: {
        minHostVersion?: string; // Minimum version of the host system/CapabilitiesManager
    };
    [key: string]: any; // For other custom metadata
}

export interface PluginDefinition {
    id: string; // Unique identifier for the plugin (e.g., "plugin-text-summarizer-v1")
    verb: string; // The action verb this plugin handles (e.g., "SUMMARIZE_TEXT")
    description: string;
    explanation?: string; // More detailed explanation of what the plugin does, its inputs, outputs, and how it works.
    inputDefinitions: PluginParameter[];
    outputDefinitions: PluginParameter[];
    language: 'javascript' | 'python' | 'openapi' | string; // Allow string for future extensibility
    entryPoint?: EntryPointType; // Optional if language is 'openapi' or if code comes purely from packageSource
    packageSource?: PluginPackage; // New field for defining package source
    security: PluginSecurity;
    configuration?: PluginConfigurationItem[]; // Configuration needed by the plugin
    version: string; // e.g., "1.0.0"
    metadata?: PluginMetadata;
    createdAt?: string; // ISO 8601 date string
    updatedAt?: string; // ISO 8601 date string
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

export type environmentType = {
    env: NodeJS.ProcessEnv;
    credentials: ConfigItem[];
};

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

