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

export interface EntryPointType {
    main: string;
    files: Record<string,string>[];
}

export interface Step {
    id: string;
    stepNo: number;
    actionVerb: string;
    description?: string;
    inputs: Map<string, PluginInput>;
    dependencies: Map<string, number>;
    status: 'pending' | 'running' | 'completed' | 'error';
    result?: PluginOutput;
    timeout?: number;
}


export interface Plugin {
    id: string;
    verb: string;
    description?: string;
    explanation?: string;
    inputs: PluginParameter[];
    outputs: PluginParameter[];
    entryPoint?: EntryPointType;
    language: 'javascript' | 'python';
}

export interface PluginParameter {
    name: string;
    type: PluginParameterType;
    description: string;
    mimeType?: string;
}

export interface PluginInput {
    inputName: string;
    inputValue: any;
    args: Record<string, any>;
}

export interface PluginOutput {
    success: boolean;
    resultType: PluginParameterType;
    result: any;
    resultDescription: string,
    error?: string,
    mimeType?: string
}

export interface ActionVerbTask {
    verb: string;
    inputs: Map<string, PluginInput>;
    expectedOutputs?: Map<string, string>;
    description?: string;
    dependencies?: Map<string, number>;
}