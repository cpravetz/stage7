import { PluginParameterType } from './Plugin';

/**
 * Parameter definition for plan templates
 */
export interface ParameterDefinition {
    name: string;
    type: PluginParameterType;
    description: string;
    required?: boolean;
    default?: any;
}

/**
 * Reference to a parameter from another task or input
 */
export interface ParameterReference {
    source: string; // e.g., "inputs.topic", "tasks.search.outputs.results"
    transform?: string; // Optional transformation expression
}

/**
 * Retry policy for task execution
 */
export interface RetryPolicy {
    maxAttempts: number;
    backoffMs: number;
    backoffMultiplier?: number;
}

/**
 * A task definition within a plan template
 */
export interface PlanTask {
    id: string;
    actionVerb: string;
    description?: string;
    inputs: { [key: string]: string | ParameterReference };
    outputs: ParameterDefinition[];
    dependsOn?: string[];
    condition?: string; // Optional condition expression
    retry?: RetryPolicy;
    timeout?: number; // Timeout in milliseconds
}

/**
 * Plan template metadata
 */
export interface PlanTemplateMetadata {
    author: string;
    created: Date;
    updated?: Date;
    tags: string[];
    category: string;
    version: string;
    compatibility?: {
        minSystemVersion?: string;
        requiredCapabilities?: string[];
    };
}

/**
 * Complete plan template definition
 */
export interface PlanTemplate {
    id: string;
    name: string;
    description: string;
    version: string;
    inputs: ParameterDefinition[];
    outputs: ParameterDefinition[];
    tasks: PlanTask[];
    metadata: PlanTemplateMetadata;
}

/**
 * Execution status for individual steps
 */
export type StepExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped' | 'paused';

/**
 * Execution status for the entire plan
 */
export type PlanExecutionStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

/**
 * Step execution instance
 */
export interface StepExecution {
    taskId: string;  // References the task ID from the plan template
    stepId: string;  // Unique execution instance ID
    status: StepExecutionStatus;
    inputs: { [key: string]: any };
    outputs: { [key: string]: any };
    startTime?: Date;
    endTime?: Date;
    error?: string;
    retryCount: number;
    logs?: string[];
}

/**
 * Complete execution context for a plan template instance
 */
export interface ExecutionContext {
    id: string;
    planTemplateId: string;
    planTemplateVersion: string;
    status: PlanExecutionStatus;
    inputs: { [key: string]: any };
    steps: StepExecution[];
    outputs: { [key: string]: any };
    metadata: {
        startTime: Date;
        endTime?: Date;
        userId: string;
        parentExecutionId?: string;
        executionMode?: 'automatic' | 'interactive' | 'debug';
    };
    variables?: { [key: string]: any }; // Runtime variables
    checkpoints?: { [stepId: string]: any }; // Checkpoint data for resumption
}

/**
 * Plan template validation result
 */
export interface PlanTemplateValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Plan template search criteria
 */
export interface PlanTemplateSearchCriteria {
    query?: string;
    category?: string;
    tags?: string[];
    author?: string;
    minVersion?: string;
    maxVersion?: string;
    requiredCapabilities?: string[];
}

/**
 * Plan template execution request
 */
export interface PlanExecutionRequest {
    templateId: string;
    templateVersion?: string; // If not specified, uses latest
    inputs: { [key: string]: any };
    executionMode?: 'automatic' | 'interactive' | 'debug';
    userId: string;
    parentExecutionId?: string;
}

/**
 * Plan template creation request
 */
export interface PlanTemplateCreateRequest {
    template: Omit<PlanTemplate, 'metadata'>;
    metadata: Omit<PlanTemplateMetadata, 'created' | 'version'>;
}

/**
 * Plan template update request
 */
export interface PlanTemplateUpdateRequest {
    id: string;
    template: Partial<PlanTemplate>;
    versionBump?: 'major' | 'minor' | 'patch';
}
