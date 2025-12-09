import { v4 as uuidv4 } from 'uuid';
import { PluginParameterType, PluginOutput, InputReference, InputValue, StepDependency, ActionVerbTask as ActionVerbTaskShared, ExecutionContext as PlanExecutionContext, PlanTemplate, OutputType, PredefinedRoles } from '@cktmcs/shared'; // Added ActionVerbTask and OutputType
import { MapSerializer } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared'; // Ensured MessageType is here, assuming it's separate or also from shared index
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { RuntimeForeachDetector, ForeachModification } from '../utils/RuntimeForeachDetector.js';
import { DelegationRecord } from '../types/DelegationTypes';
import { CrossAgentDependencyResolver } from '../utils/CrossAgentDependencyResolver';
import { Agent } from './Agent.js';

//FIXME: This is a temporary fix for the typescript error
interface ActionVerbTask extends ActionVerbTaskShared {
    inputs: any;
}

export enum StepStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    ERROR = 'error',
    PAUSED = 'paused',
    CANCELLED = 'cancelled',
    WAITING = 'waiting',
    REPLACED = 'replaced',
 
}

export interface StepModification {
    description?: string;
    inputValues: Map<string, InputValue>; // For complete replacement of inputs
    updateInputs?: Map<string, InputValue>; // For merging/updating specific inputs
    status?: StepStatus;
    actionVerb?: string;
    recommendedRole?: string;

}

interface ErrorContext {
    message: string;
    stack?: string;
    type: string;
    timestamp: string;
    recoveryAttempts: number;
}

export class Step {
    readonly parentStepId?: string;
    readonly id: string;
    readonly templateId?: string;
    readonly scope_id?: string;
    readonly missionId: string;
    readonly actionVerb: string;
    ownerAgentId: string;
    public delegatedToAgentId?: string;
    inputReferences: Map<string, InputReference>;
    inputValues: Map<string, InputValue>; 
    description?: string;
    dependencies: StepDependency[];
    outputs: Map<string, string>;
    originalOutputDefinitions?: Map<string, any>; // Store original plan output definitions for deliverable metadata
    status: StepStatus;
    result?: PluginOutput[];
    timeout?: number;
    recommendedRole?: string;
    awaitsSignal: string;
    retryCount: number;
    maxRetries: number;
    recoverableRetryCount: number;
    maxRecoverableRetries: number;
    lastError: any | null;
    errorContext: ErrorContext | null = null;
    currentIndex?: number; // For stateful FOREACH batching
    private tempData: Map<string, any> = new Map();
    private persistenceManager: AgentPersistenceManager;
    private backoffTime: number = 1000; // Initial backoff time in ms
    private crossAgentResolver: CrossAgentDependencyResolver;

    // Ownership and Delegation
    currentOwnerAgentId: string;
    originalOwnerAgentId: string;
    delegationHistory: DelegationRecord[];
    isRemotelyOwned: boolean;
    lastOwnershipChange: string;

    // Phase 2: Runtime FOREACH detection
    private static runtimeForeachDetector?: RuntimeForeachDetector;

    /**
     * Initialize the runtime FOREACH detector
     */
    static initializeRuntimeForeachDetector(capabilitiesManagerUrl?: string, authToken?: string): void {
        if (!Step.runtimeForeachDetector) {
            const url = capabilitiesManagerUrl || process.env.CAPABILITIES_MANAGER_URL || 'http://capabilitiesmanager:5060';
            Step.runtimeForeachDetector = new RuntimeForeachDetector(url, authToken);
            console.log('[Step] Runtime FOREACH detector initialized');
        }
    }

    /**
     * Phase 2: Detect if upcoming steps need FOREACH wrapping based on step outputs
     */
    static async detectRuntimeForeachNeeds(
        executedStep: Step,
        stepOutputs: Record<string, any>,
        upcomingSteps: Step[]
    ): Promise<ForeachModification[]> {
        if (!Step.runtimeForeachDetector) {
            Step.initializeRuntimeForeachDetector();
        }

        if (!Step.runtimeForeachDetector) {
            console.warn('[Step] Runtime FOREACH detector not available');
            return [];
        }

        // Convert Step objects to plain objects for the detector
        const executedStepData = {
            id: executedStep.id,
            actionVerb: executedStep.actionVerb,
            outputs: Object.fromEntries(executedStep.outputs)
        };

        const upcomingStepsData = upcomingSteps.map(step => ({
            id: step.id,
            actionVerb: step.actionVerb,
            inputs: Step.convertInputsToPlainObject(step)
        }));

        return await Step.runtimeForeachDetector.detectForeachNeeds(
            executedStepData,
            stepOutputs,
            upcomingStepsData
        );
    }

    private truncateLargeStrings(obj: any, maxLength: number = 500): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.truncateLargeStrings(item, maxLength));
        }

        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                if (typeof value === 'string' && value.length > maxLength) {
                    newObj[key] = `[Truncated string, length: ${value.length}]`;
                } else if (typeof value === 'object') {
                    newObj[key] = this.truncateLargeStrings(value, maxLength);
                } else {
                    newObj[key] = value;
                }
            }
        }
        return newObj;
    }


    /**
     * Convert Step inputs to plain object format for the detector
     */
    private static convertInputsToPlainObject(step: Step): Record<string, any> {
        const inputs: Record<string, any> = {};

        // Convert input references
        for (const [name, ref] of step.inputReferences) {
            // InputReference uses sourceId, but we need sourceStep for plan format
            // We'll need to extract the step number from sourceId or use a different approach
            if (ref.outputName) {
                inputs[name] = {
                    sourceStep: ref.sourceId,
                    outputName: ref.outputName
                };
            } else if (ref.value !== undefined) {
                inputs[name] = {
                    value: ref.value,
                    valueType: ref.valueType
                };
            }
        }

        // Convert input values (these are literal values, not references)
        for (const [name, value] of step.inputValues) {
            if (!inputs[name]) { // Don't override references
                inputs[name] = {
                    value: value.value,
                    valueType: value.valueType
                };
            }
        }

        return inputs;
    }

    /**
     * Utility method to parse and validate steps input from various formats
     */
    private parseStepsInput(stepsInput: InputValue): ActionVerbTask[] {
        if (!stepsInput) {
            throw new Error('Missing required input: steps');
        }

        let steps: ActionVerbTask[];

        if (typeof stepsInput.value === 'string') {
            try {
                steps = JSON.parse(stepsInput.value);
            } catch (e) {
                throw new Error('Invalid JSON format for steps');
            }
        } else if (Array.isArray(stepsInput.value)) {
            steps = stepsInput.value as ActionVerbTask[];
        }
        else {
            throw new Error('steps must be an array or JSON string');
        }

        if (!Array.isArray(steps)) {
            throw new Error('steps must be an array');
        }

        return steps;
    }

    /**
     * Utility method to create standardized error responses
     */
    private createErrorResponse(message: string, description?: string, errorDetails?: string): PluginOutput[] {
        return [{
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            resultDescription: description || `[Step]Error in ${this.actionVerb} step`,
            result: message,
            error: errorDetails || message
        }];
    }

    /**
     * Utility method to normalize outputs from various formats to Map<string, string>
     */
    static normalizeOutputs(rawOutputs: any): Map<string, string> | undefined {
        try {
            if (!rawOutputs) {
                return undefined;
            } else if (rawOutputs instanceof Map) {
                return rawOutputs as Map<string, string>;
            } else if (typeof rawOutputs === 'string') {
                // JSON string — try parse; support either object or serialized Map shape
                try {
                    const parsed = JSON.parse(rawOutputs);
                    if (parsed && parsed._type === 'Map' && Array.isArray(parsed.entries)) {
                        return new Map(parsed.entries);
                    } else if (parsed && typeof parsed === 'object') {
                        return new Map(Object.entries(parsed));
                    } else {
                        return new Map();
                    }
                } catch (e) {
                    console.warn(`[Step.normalizeOutputs] Unable to parse outputs string:`, e instanceof Error ? e.message : e);
                    return new Map();
                }
            }
            else if (rawOutputs && rawOutputs._type === 'Map' && Array.isArray(rawOutputs.entries)) {
                return new Map(rawOutputs.entries);
            } else if (typeof rawOutputs === 'object') {
                return new Map(Object.entries(rawOutputs));
            } else {
                return new Map();
            }
        } catch (e) {
            console.error(`[Step.normalizeOutputs] Error normalizing outputs:`, e instanceof Error ? e.message : e);
            return new Map();
        }
    }

    constructor(params: {
        parentStepId?: string,
        id?: string,
        templateId?: string,
        scope_id?: string,
        missionId?: string,
        ownerAgentId?: string,
        actionVerb: string,
        inputReferences?: Map<string, InputReference>,
        inputValues?: Map<string, InputValue>,
        description?: string,
        dependencies?: StepDependency[],
        outputs?: Map<string, string>,
        originalOutputDefinitions?: Map<string, any>, // Store original plan output definitions for deliverable metadata
        status?: StepStatus,
        result?: PluginOutput[],
        recommendedRole?: string,
        persistenceManager: AgentPersistenceManager,
        maxRetries?: number,
        maxRecoverableRetries?: number
        // Ownership and Delegation
        currentOwnerAgentId?: string;
        delegationHistory?: DelegationRecord[];
        lastOwnershipChange?: string;
        crossAgentResolver: CrossAgentDependencyResolver;
    }) {
    
        console.log(`[Step constructor] params.outputs =`, params.outputs);
        
        // Enforce non-null actionVerb: this is a fundamental requirement
        if (!params.actionVerb || typeof params.actionVerb !== 'string' || params.actionVerb.trim().length === 0) {
            throw new Error(`[Step constructor] actionVerb is required and must be a non-empty string. Provided: ${JSON.stringify(params.actionVerb)}`);
        }
        
        this.parentStepId = params.parentStepId;
        this.id = params.id || uuidv4();
        this.templateId = params.templateId;
        this.scope_id = params.scope_id;
        this.missionId = params.missionId || 'unknown_mission';
        this.ownerAgentId = params.ownerAgentId || 'unknown_agent'; // Default to unknown agent if not provided
        this.actionVerb = params.actionVerb;
        this.inputReferences = params.inputReferences || new Map();
        this.inputValues = params.inputValues || new Map();
        this.description = params.description;
        this.dependencies = params.dependencies || [];

        // Defensive normalization: ensure outputs is always a Map<string, string>
        try {
            this.outputs = Step.normalizeOutputs(params.outputs) || new Map();        
        } catch (e) {
            console.error(`[Step constructor] Error normalizing outputs for step ${this.id}:`, e instanceof Error ? e.message : e);
            this.outputs = new Map();
        }

        // Store original output definitions for deliverable metadata
        this.originalOutputDefinitions = params.originalOutputDefinitions;

        this.status = params.status || StepStatus.PENDING;
        if (params.result) {
            this.result = params.result;
        }
        this.recommendedRole = params.recommendedRole;
        this.retryCount = 0;
        this.maxRetries = params.maxRetries || 3;
        this.recoverableRetryCount = 0;
        this.maxRecoverableRetries = params.maxRecoverableRetries || 5;
        this.lastError = null;

        this.persistenceManager = params.persistenceManager;
        this.crossAgentResolver = params.crossAgentResolver;
        this.awaitsSignal = '';

        // Initialize ownership and delegation fields
        this.originalOwnerAgentId = params.ownerAgentId || 'unknown_agent';
        this.currentOwnerAgentId = params.currentOwnerAgentId || this.originalOwnerAgentId;
        this.delegationHistory = params.delegationHistory || [];
        this.isRemotelyOwned = this.currentOwnerAgentId !== this.ownerAgentId;
        this.lastOwnershipChange = params.lastOwnershipChange || new Date().toISOString();

        // Log step creation event (only if persistenceManager is available)
        if (this.persistenceManager) {
            this.logEvent({
                eventType: 'step_created',
                stepId: this.id,
                missionId: this.missionId,
                actionVerb: this.actionVerb,
                inputValues:MapSerializer.transformForSerialization(this.inputValues),
                inputReferences: MapSerializer.transformForSerialization(this.inputReferences),
                dependencies: this.dependencies,
                outputs: MapSerializer.transformForSerialization(this.outputs),
                status: this.status,
                description: this.description,
                recommendedRole: this.recommendedRole,
                timestamp: new Date().toISOString()
            });
        }
    }

    async logEvent(event: any): Promise<void> {
        if (!event) {
            console.error('Step logEvent called with empty event');
            return;
        }
        if (!this.persistenceManager) {
            console.warn('Step logEvent called but persistenceManager is undefined');
            return;
        }
        try {
            await this.persistenceManager.logEvent(event);
        } catch (error) {
            console.error('Step logEvent error:', error instanceof Error ? error.message : error);
        }
    }

    public async dereferenceInputsForExecution(allSteps: Step[], missionId: string): Promise<Map<string, InputValue>> {
        console.log(`[Step ${this.id}] dereferenceInputsForExecution: Starting consolidated input preparation...`);
        const resolved = new Map<string, InputValue>();

        // Ensure missionId is always present in resolved from the start.
        resolved.set('missionId', {
            inputName: 'missionId',
            value: missionId,
            valueType: PluginParameterType.STRING,
            args: {}
        });

        // NEW PHASE 0: Copy existing inputValues (e.g., from FOREACH injection)
        this.inputValues.forEach((inputValue, key) => {
            resolved.set(key, { ...inputValue }); // Create a shallow copy
        });

        // Phase 1: Populate with all literal values defined in the plan.
        this.inputReferences.forEach((inputRef, key) => {
            if (inputRef.value !== undefined) {
                resolved.set(key, {
                    inputName: key,
                    value: inputRef.value,
                    valueType: inputRef.valueType,
                    args: inputRef.args || {}
                });
            }
        });

        // Phase 2: Resolve dependencies and overwrite literals if necessary.
        for (const dep of this.dependencies) {
            if (dep.sourceStepId === '0') {
                continue; // Skip parent-provided dependencies in this loop; they are injected, not resolved from another step's output.
            }
            try {
                if (!dep.sourceStepId) {
                    console.warn(`[Step ${this.id}] Dependency '${dep.inputName}' has no sourceStepId. Skipping resolution.`);
                    continue;
                }

                let sourceStep: Step | null | undefined = allSteps.find(s => s.id === dep.sourceStepId);

                if (!sourceStep) {
                    const remoteOutput = await this.crossAgentResolver.getStepOutput(dep.sourceStepId, dep.outputName);
                    if (remoteOutput) {
                        const value = remoteOutput.result;
                        if (value === undefined || value === null) {
                            console.warn(`[Step ${this.id}] Input '${dep.inputName}' resolved to ${value}. Reference: sourceStep=${dep.sourceStepId}, output=${dep.outputName}`);
                        } else {
                            console.debug(`[Step ${this.id}] Input '${dep.inputName}' resolved to: ${JSON.stringify(value).substring(0, 100)}`);
                        }
                        resolved.set(dep.inputName, {
                            inputName: dep.inputName,
                            value: value,
                            valueType: remoteOutput.resultType,
                            args: {}
                        });
                        continue;
                    }
                    try {
                        const stepData = await this.persistenceManager.loadStep(dep.sourceStepId);
                        if (stepData) {
                            sourceStep = new Step({ ...stepData, persistenceManager: this.persistenceManager, crossAgentResolver: this.crossAgentResolver });
                        }
                    } catch (e) {
                         console.warn(`[Step ${this.id}]   - Error attempting to load source step ${dep.sourceStepId} from persistence:`, e instanceof Error ? e.message : e);
                    }
                }

                if (sourceStep && (!sourceStep.result || sourceStep.result.length === 0)) {
                     try {
                        const possibleAgentId = sourceStep.ownerAgentId;
                        const persisted = await this.persistenceManager.loadStepWorkProduct(possibleAgentId, sourceStep.id);
                        if (persisted) {
                            const persistedData = (persisted && (persisted.data !== undefined)) ? persisted.data : persisted;
                            try {
                                const transformed = MapSerializer.transformFromSerialization(persistedData) as PluginOutput[];
                                if (Array.isArray(transformed) && transformed.length > 0) {
                                    sourceStep.result = transformed;
                                }
                            } catch (e) {
                                console.warn(`[Step ${this.id}]   - Failed to transform persisted work product for step ${sourceStep.id}:`, e instanceof Error ? e.message : e);
                            }
                        }
                    } catch (e) {
                        console.warn(`[Step ${this.id}]   - Error attempting to hydrate source step ${dep.sourceStepId} from persistence:`, e instanceof Error ? e.message : e);
                    }
                }

                if (sourceStep?.result) {
                    const output = sourceStep.result.find(r => r.name === dep.outputName);

                    if (output && output.result !== undefined && output.result !== null) {
                        let value = output.result;
                         if (value === undefined || value === null) {
                            console.warn(`[Step ${this.id}] Input '${dep.inputName}' resolved to ${value}. Reference: sourceStep=${dep.sourceStepId}, output=${dep.outputName}`);
                        } else {
                            console.debug(`[Step ${this.id}] Input '${dep.inputName}' resolved to: ${JSON.stringify(value).substring(0, 100)}`);
                        }
                        
                        value = await this.recursivelyResolveInputReferences(value, allSteps, resolved, this.inputReferences.get(dep.inputName)?.valueType, dep.inputName);

                        resolved.set(dep.inputName, {
                            inputName: dep.inputName,
                            value: value,
                            valueType: output.resultType,
                            args: {}
                        });
                    } else {
                        throw new Error(`Dependency '${dep.sourceStepId}.${dep.outputName}' not satisfied.`);
                    }
                } else {
                     throw new Error(`Source step '${dep.sourceStepId}' not found or had no result.`);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[Step ${this.id}] Failed to resolve input '${dep.inputName}': ${errorMessage}`);
                resolved.set(`__failed_${dep.inputName}`, { inputName: `__failed_${dep.inputName}`, value: undefined, valueType: PluginParameterType.ERROR });
            }
        }

        // Phase 3: Recursively resolve references within inputValues that might contain nested references
        for (const [key, inputValue] of resolved.entries()) {
            if (inputValue.value !== undefined) {
                inputValue.value = await this.recursivelyResolveInputReferences(inputValue.value, allSteps, resolved, inputValue.valueType);
                resolved.set(key, inputValue);
            }
        }

        // Phase 4: Resolve placeholders (must be last).
        const findOutputFromSteps = (outputName: string): any | null => {
            for (const step of allSteps.slice().reverse()) {
                if (step.status === StepStatus.COMPLETED && step.result) {
                    const output = step.result.find(o => o.name === outputName);
                    if (output && output.result !== undefined && output.result !== null) {
                        return output.result;
                    }
                }
            }
            return null;
        };
        this.resolvePlaceholdersInInputRunValues(resolved, findOutputFromSteps);
        
        // NEW: Check if we're missing required inputs
        for (const [inputName, value] of resolved.entries()) {
            if (value.value === undefined && !inputName.startsWith('__')) {
                console.warn(`[Step ${this.id}] Required input '${inputName}' is undefined after resolution.`);
            }
        }

        console.log(`[Step ${this.id}] dereferenceInputsForExecution: Completed. Final inputs:`, Array.from(resolved.keys()));
        return resolved;
    }

    /**
     * Recursively resolves nested input references within a given value.
     * This is crucial for complex inputs like script_parameters that might contain
     * references to outputs of other steps.
     */
    private async recursivelyResolveInputReferences(value: any, allSteps: Step[], inputRunValues: Map<string, InputValue>, expectedValueType?: PluginParameterType, currentInputName?: string): Promise<any> {


        if (value === null || typeof value !== 'object') {
    
            return value; // Base case: primitive value
        }

        if (Array.isArray(value)) {
            console.debug(`[Step ${this.id}]   - Value is an array. Recursing into each element.`);
            return Promise.all(value.map(item => this.recursivelyResolveInputReferences(item, allSteps, inputRunValues, expectedValueType, currentInputName)));
        }

        // If it's an object, check if it's an InputReference structure
        if (value.outputName !== undefined && value.sourceStep !== undefined) {
            const sourceStepId = value.sourceStep;
            const outputName = value.outputName;
            console.debug(`[Step ${this.id}]   - Value is an InputReference structure: sourceStepId='${sourceStepId}', outputName='${outputName}'`);


            // Special handling for sourceStep: '0' which refers to the current item from a parent control step (e.g., FOREACH, DELEGATE)
            if (sourceStepId === '0') {
                console.debug(`[Step ${this.id}] DEBUG: Resolving sourceStep: '0' reference for outputName: '${outputName}' from current step's inputRunValues.`);
                const injectedValue = inputRunValues.get(outputName);
                if (injectedValue && injectedValue.value !== undefined) {
                    console.debug(`[Step ${this.id}] DEBUG: Successfully resolved sourceStep: '0' reference. Value: ${JSON.stringify(this.truncateLargeStrings(injectedValue.value))}`);
                    return injectedValue.value;
                } else {
                    console.warn(`[Step ${this.id}] WARN: Could not find injected value for outputName: '${outputName}' in inputRunValues for sourceStep: '0'. Returning original reference.`);
                    return value; // Return original reference if not found
                }
            }

            let sourceStep = allSteps.find(s => s.id === sourceStepId);
            console.debug(`[Step ${this.id}]   - Source step found locally: ${!!sourceStep}`);

            if (!sourceStep) {
                console.debug(`[Step ${this.id}]   - Source step not found locally. Attempting remote resolution.`);
                const remoteOutput = await this.crossAgentResolver.getStepOutput(sourceStepId, outputName);
                if (remoteOutput) {
                    console.debug(`[Step ${this.id}]   - Resolved remotely. Value: ${JSON.stringify(this.truncateLargeStrings(remoteOutput.result))}`);
                    return remoteOutput.result;
                }
                console.debug(`[Step ${this.id}]   - Remote resolution failed. Attempting to load source step from persistence.`);

                try {
                    const stepData = await this.persistenceManager.loadStep(sourceStepId);
                    if (stepData) {
                        sourceStep = new Step({ ...stepData, persistenceManager: this.persistenceManager, crossAgentResolver: this.crossAgentResolver });
                        console.debug(`[Step ${this.id}]   - Source step loaded from persistence.`);
                    }
                } catch (e) {
                    console.warn(`[Step ${this.id}]   - Error attempting to load source step ${sourceStepId} from persistence during recursive resolution:`, e instanceof Error ? e.message : e);
                }
            }

            if (sourceStep && (!sourceStep.result || sourceStep.result.length === 0)) {
                console.debug(`[Step ${this.id}]   - Source step found, but result missing. Attempting to hydrate result from persistence.`);
                try {
                    const possibleAgentId = sourceStep.ownerAgentId;
                    const persisted = await this.persistenceManager.loadStepWorkProduct(possibleAgentId, sourceStep.id);
                    if (persisted) {
                        const persistedData = (persisted && (persisted.data !== undefined)) ? persisted.data : persisted;
                        try {
                            const transformed = MapSerializer.transformFromSerialization(persistedData) as PluginOutput[];
                            if (Array.isArray(transformed) && transformed.length > 0) {
                                sourceStep.result = transformed;
                                console.debug(`[Step ${this.id}]   - Hydrated source step ${sourceStep.id} result from persistence. Keys: ${sourceStep.result.map(r => r.name).join(', ')}`);
                            }
                        } catch (e) {
                            console.warn(`[Step ${this.id}]   - Failed to transform persisted work product for step ${sourceStep.id} during recursive resolution:`, e instanceof Error ? e.message : e);
                        }
                    }
                } catch (e) {
                    console.warn(`[Step ${this.id}]   - Error attempting to hydrate source step ${sourceStepId} from persistence during recursive resolution:`, e instanceof Error ? e.message : e);
                }
            }

            if (sourceStep?.result) {
                const output = sourceStep.result.find(r => r.name === outputName);
                if (output && output.result !== undefined && output.result !== null) {
                    let resolvedValue = output.result;
                    console.debug(`[Step ${this.id}]   - Found output '${outputName}' from source step '${sourceStepId}'. Original resolvedValue type: ${typeof resolvedValue}, isArray: ${Array.isArray(resolvedValue)}, value: ${JSON.stringify(this.truncateLargeStrings(resolvedValue))}`);

                    // If the expected type is an object or array but we got a string, try to parse it.
                    if ((output.resultType === PluginParameterType.OBJECT || output.resultType === PluginParameterType.ARRAY) && typeof resolvedValue === 'string') {
                        console.debug(`[Step ${this.id}]   - Attempting to parse string resolvedValue for dependency '${sourceStepId}.${outputName}'.`);
                        try {
                            resolvedValue = JSON.parse(resolvedValue);
                            console.debug(`[Step ${this.id}]   - Successfully parsed resolvedValue. Parsed type: ${typeof resolvedValue}, isArray: ${Array.isArray(resolvedValue)}`);
                        } catch (e) {
                            console.warn(`[Step ${this.id}]   - Failed to parse string to object/array for recursively resolved dependency '${sourceStepId}.${outputName}'. Error: ${e instanceof Error ? e.message : e}. Passing as string.`);
                        }
                    }

                    // NEW LOGIC: If the target input expects a string but the resolved value is an object/array
                    // Use currentInputName if provided, otherwise fallback to outputName
                    const propertyToExtract = currentInputName || outputName;
                    if (expectedValueType === PluginParameterType.STRING && (typeof resolvedValue === 'object' || Array.isArray(resolvedValue))) {
                        console.debug(`[Step ${this.id}]   - Recursively resolved value for '${outputName}' expects a string, but received object/array. currentInputName: ${currentInputName}, propertyToExtract: ${propertyToExtract}`);
                        
                        // Check if the object/array has a property with the same name as the inputName (which acts as the input name here)
                        if (typeof resolvedValue === 'object' && resolvedValue !== null && !Array.isArray(resolvedValue) && Object.prototype.hasOwnProperty.call(resolvedValue, propertyToExtract)) {
                            let propertyValue = (resolvedValue as any)[propertyToExtract];
                            console.debug(`[Step ${this.id}]   - Found matching property '${propertyToExtract}' in the object. Using its value.`);
                            if (typeof propertyValue !== 'string') {
                                try {
                                    resolvedValue = JSON.stringify(propertyValue);
                                    console.debug(`[Step ${this.id}]   - Stringified property value for '${propertyToExtract}'.`);
                                } catch (e) {
                                    console.warn(`[Step ${this.id}]   - Failed to stringify property value for '${propertyToExtract}'. Error: ${e instanceof Error ? e.message : e}. Using original property value.`);
                                    resolvedValue = propertyValue; // Fallback to original property value if stringification fails
                                }
                            } else {
                                resolvedValue = propertyValue;
                            }
                        } else {
                            // No matching property, stringify the entire object/array
                            console.debug(`[Step ${this.id}]   - No matching property '${propertyToExtract}' found. Stringifying the entire object/array.`);
                            try {
                                resolvedValue = JSON.stringify(resolvedValue);
                            } catch (e) {
                                console.warn(`[Step ${this.id}]   - Failed to stringify object/array for recursively resolved dependency '${sourceStepId}.${outputName}'. Error: ${e instanceof Error ? e.message : e}. Passing original value.`);
                            }
                        }
                    }
                    console.debug(`[Step ${this.id}]   - Recursively resolved reference to '${sourceStepId}.${outputName}'. Final resolvedValue: ${JSON.stringify(this.truncateLargeStrings(resolvedValue))}`);
                    return resolvedValue;
                } else {
                    console.warn(`[Step ${this.id}]   - Recursively resolved dependency '${sourceStepId}.${outputName}' not satisfied. Named output not found.`);
                }
            } else {
                console.warn(`[Step ${this.id}]   - Source step '${sourceStepId}' not found or has no result during recursive resolution.`);
            }
            console.debug(`[Step ${this.id}]   - Resolution failed for reference. Returning original value.`);
            return value; // Return original value if resolution fails
        }

        // Recursively process properties of the object
        const newObject: { [key: string]: any } = {};
        for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
                newObject[key] = await this.recursivelyResolveInputReferences(value[key], allSteps, inputRunValues, undefined, key);
            }
        }
        console.debug(`[Step ${this.id}] recursivelyResolveInputReferences: Exiting with newObject: ${JSON.stringify(this.truncateLargeStrings(newObject))}`);
        return newObject;
    }

    async areDependenciesSatisfied(allSteps: Step[]): Promise<boolean> {
        let parentChecked = false;
        let parentSatisfied = false;

        for (const dep of this.dependencies) {
            if (dep.sourceStepId === '0') {
                if (!parentChecked) {
                    const parentStep = this.parentStepId ? allSteps.find(s => s.id === this.parentStepId) : undefined;
                    if (!parentStep) {
                        console.log(`[areDependenciesSatisfied] Step ${this.id} dependency on parent is not satisfied: parent step not found.`);
                        return false; // Parent not found
                    }
                    parentSatisfied = await parentStep.areDependenciesSatisfied(allSteps);
                    parentChecked = true;
                }
                if (!parentSatisfied) {
                    //console.log(`[areDependenciesSatisfied] Step ${this.id} dependency on parent is not satisfied: parent is not ready.`);
                    return false;
                }
                continue; // This dependency is conceptually satisfied if parent is ready.
            }

            if (!dep.sourceStepId) {
                console.warn(`[areDependenciesSatisfied] Step ${this.id} dependency '${dep.inputName}' has no sourceStepId. Skipping check.`);
                continue; // Skip dependencies without a sourceStepId
            }

            let sourceStep: Step | null | undefined = allSteps.find(s => s.id === dep.sourceStepId);

            // If sourceStep not found locally, try to get it from crossAgentResolver
            if (!sourceStep) {
                sourceStep = await this.crossAgentResolver.getStepDetails(dep.sourceStepId);
                if (!sourceStep) {
                    // If still not found, or crossAgentResolver returns null, dependency is not satisfied
                    //console.log(`[areDependenciesSatisfied] Step ${this.id} dependency on ${dep.sourceStepId} (output: ${dep.outputName}) is not satisfied: source step not found.`);
                    return false;
                }
            }

            // Source step must exist and be completed.
            if (sourceStep.status !== StepStatus.COMPLETED) {
                //console.log(`[areDependenciesSatisfied] Step ${this.id} dependency on ${dep.sourceStepId} (output: ${dep.outputName}) is not satisfied: source step status is ${sourceStep.status}.`);
                return false;
            }

            // If dependency is just a signal (like for control flow), we don't need to check for a named output.
            if (dep.inputName.startsWith('__')) {
                continue; // Move to next dependency
            }

            // For regular dependencies, the named output must exist in the source step's result.
            const outputExists = sourceStep.result?.some(r => r.name === dep.outputName && r.result !== null && r.result !== undefined);
            if (!outputExists) {
                console.warn(`[areDependenciesSatisfied] Step ${this.id} dependency on output '${dep.outputName}' from step ${sourceStep.id} is not met because the output is not in the result or is null/undefined.`);
                return false;
            }
        }
        return true; // All dependencies are satisfied        
    }

    async areDependenciesPermanentlyUnsatisfied(allSteps: Step[]): Promise<boolean> {
        let parentChecked = false;
        let parentPermanentlyUnsatisfied = false;

        for (const dep of this.dependencies) {
            if (dep.sourceStepId === '0') {
                if (!parentChecked) {
                    const parentStep = this.parentStepId ? allSteps.find(s => s.id === this.parentStepId) : undefined;
                    // If parent doesn't exist, we can't determine its status, so we don't consider this permanently unsatisfied yet.
                    if (parentStep) { 
                        parentPermanentlyUnsatisfied = await parentStep.areDependenciesPermanentlyUnsatisfied(allSteps);
                    }
                    parentChecked = true;
                }
                if (parentPermanentlyUnsatisfied) {
                    console.warn(`[areDependenciesPermanentlyUnsatisfied] Step ${this.id} is permanently unsatisfied because its parent ${this.parentStepId} is.`);
                    return true;
                }
                continue;
            }

            if (!dep.sourceStepId) {
                continue; // Skip dependencies without a sourceStepId, not permanently unsatisfied
            }

            let sourceStep: Step | null | undefined = allSteps.find(s => s.id === dep.sourceStepId);

            // If sourceStep not found locally, try to get it from crossAgentResolver
            if (!sourceStep) {
                //console.log(`[areDependenciesPermanentlyUnsatisfied] Source step ${dep.sourceStepId} not found locally for dependency '${dep.inputName}'. Attempting remote resolution.`);
                sourceStep = await this.crossAgentResolver.getStepDetails(dep.sourceStepId);
                if (!sourceStep) {
                    //console.debug(`[areDependenciesPermanentlyUnsatisfied] Source step ${dep.sourceStepId} not found locally or remotely for dependency '${dep.inputName}'. This might be a timing issue - NOT marking as permanently unsatisfied.`);
                    continue; // Don't mark as permanently unsatisfied, give it more time
                }
            }

            // Check if the source step is in a terminal error state
            if (sourceStep.status === StepStatus.ERROR || sourceStep.status === StepStatus.CANCELLED) {
                console.warn(`[areDependenciesPermanentlyUnsatisfied] Step ${this.id} dependency on ${dep.sourceStepId} (output: ${dep.outputName}) is permanently unsatisfied: source step terminated with status ${sourceStep.status}.`);
                return true;
            }

            // If the source step is COMPLETED, check if the required output exists
            if (sourceStep.status === StepStatus.COMPLETED) {
                // If dep.inputName starts with '__', it's a signal, no output check needed.
                if (dep.inputName.startsWith('__')) {
                    continue; // Signal dependency, considered satisfied if sourceStep is completed
                }

                const outputExists = sourceStep.result?.some(r => r.name === dep.outputName && r.result !== null && r.result !== undefined);
                if (!outputExists) {
                    console.warn(`[areDependenciesPermanentlyUnsatisfied] Step ${this.id} dependency on output '${dep.outputName}' from step ${sourceStep.id} is permanently unsatisfied because the output is not in the result or is null/undefined even after completion.`);
                    return true;
                }
            }

            // If the source step is PENDING, RUNNING, WAITING, or REPLACED, the dependency is NOT permanently unsatisfied
            // It's just not satisfied YET - give it more time
        }
        return false; // No permanently unsatisfied dependencies found
    }

    isEndpoint(allSteps: Step[]): boolean {
        const dependents = allSteps.filter(s =>
            s.dependencies.some(dep => dep.sourceStepId === this.id)
        );
        return dependents.length === 0;
    }

    getOutputType(allSteps: Step[]): OutputType {
        if (this.result?.some(r => r.resultType === PluginParameterType.PLAN)) {
            return OutputType.PLAN;
        }
        if (this.isEndpoint(allSteps)) {
            return OutputType.FINAL;
        }
        return OutputType.INTERIM;
    }
    
    public storeTempData(key: string, value: any): void {
        this.tempData.set(key, value);
    }
    
    public getTempData(key: string): any {
        return this.tempData.get(key);
    }

    public clearTempData(): void {
        this.tempData.clear();
    }

    public toJSON() {
        return {
            parentStepId: this.parentStepId,
            id: this.id,
            templateId: this.templateId,
            scope_id: this.scope_id,
            missionId: this.missionId,
            actionVerb: this.actionVerb,
            ownerAgentId: this.ownerAgentId,
            delegatedToAgentId: this.delegatedToAgentId,
            inputReferences: MapSerializer.transformForSerialization(this.inputReferences),
            inputValues: MapSerializer.transformForSerialization(this.inputValues),
            description: this.description,
            dependencies: this.dependencies,
            outputs: MapSerializer.transformForSerialization(this.outputs),
            originalOutputDefinitions: this.originalOutputDefinitions,
            status: this.status,
            result: this.result,
            timeout: this.timeout,
            recommendedRole: this.recommendedRole,
            awaitsSignal: this.awaitsSignal,
            retryCount: this.retryCount,
            maxRetries: this.maxRetries,
            recoverableRetryCount: this.recoverableRetryCount,
            maxRecoverableRetries: this.maxRecoverableRetries,
            lastError: this.lastError,
            errorContext: this.errorContext,
            currentIndex: this.currentIndex,
            currentOwnerAgentId: this.currentOwnerAgentId,
            originalOwnerAgentId: this.originalOwnerAgentId,
            delegationHistory: this.delegationHistory,
            isRemotelyOwned: this.isRemotelyOwned,
            lastOwnershipChange: this.lastOwnershipChange,
        };
    }

    public async execute(
        executeAction: (step: Step) => Promise<PluginOutput[]>,
        thinkAction: (inputValues: Map<string, InputValue>, actionVerb: string) => Promise<PluginOutput[]>,
        delegateAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        askAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        allSteps: Step[],
        agent: Agent,
    ): Promise<PluginOutput[]> {
        this.status = StepStatus.RUNNING;
        this.logEvent({
            eventType: 'step_execution_start',
            stepId: this.id,
            actionVerb: this.actionVerb,
            timestamp: new Date().toISOString()
        });

        try {
            let result: PluginOutput[];

            switch (this.actionVerb) {
                // Internal Control Flow Verbs
                case 'DECIDE':
                    result = await this.handleDecide(agent);
                    break;
                case 'REPEAT':
                    result = await this.handleRepeat(agent);
                    break;
                case 'WHILE':
                    result = await this.handleWhile(agent);
                    break;
                case 'UNTIL':
                    result = await this.handleUntil(agent);
                    break;
                case 'SEQUENCE':
                    result = await this.handleSequence(agent);
                    break;
                case 'FOREACH':
                    console.debug(`[Step ${this.id}] execute: Handling FOREACH verb internally.`);
                    result = await this.handleForeach(agent);
                    break;
                case 'REGROUP':
                    result = await this.handleRegroup(allSteps);
                    break;
                case 'TIMEOUT':
                    result = await this.handleTimeout(agent);
                    break;
                
                // Verbs handled by Agent methods
                case 'THINK':
                case 'GENERATE':
                    result = await thinkAction(this.inputValues, this.actionVerb);
                    break;
                case 'DELEGATE': // DELEGATE is often used to create sub-agents
                    result = await delegateAction(this.inputValues);
                    break;
                case 'ASK':
                case 'ASK_USER_QUESTION':
                case 'CHAT':
                    result = await askAction(this.inputValues);
                    break;

                // Default to external plugin execution
                default:
                    result = await executeAction(this);
                    break;
            }
            
            // If the result indicates a new plan, we don't set the step to COMPLETED here.
            // The agent will handle the plan and update the step status (e.g., REPLACED).
            const isPlanResult = result.some(r => r.resultType === PluginParameterType.PLAN);
            const isWaitingResult = result.some(r => r.name === 'status' && r.result === StepStatus.WAITING);

            if (!isPlanResult && !isWaitingResult) {
                this.status = StepStatus.COMPLETED;
            }
            
            this.result = result;

            this.logEvent({
                eventType: 'step_execution_finish',
                stepId: this.id,
                status: this.status,
                result: this.truncateLargeStrings(result),
                timestamp: new Date().toISOString()
            });

            return result;

        } catch (error) {
            this.status = StepStatus.ERROR;
            this.lastError = error;
            const errorMessage = error instanceof Error ? error.message : String(error);

            this.logEvent({
                eventType: 'step_execution_error',
                stepId: this.id,
                error: errorMessage,
                timestamp: new Date().toISOString()
            });

            return this.createErrorResponse(
                `Step ${this.id} (${this.actionVerb}) failed during execution.`,
                '[Step] Execution Error',
                errorMessage
            );
        }
    }
    
    public hasDeliverableOutputs(): boolean {
        if (!this.originalOutputDefinitions) return false;
        for (const outDef of Object.values(this.originalOutputDefinitions)) {
            if (outDef.isDeliverable) return true;
        }
        return false;
    }

    public async mapPluginOutputsToCustomNames(pluginOutputs: PluginOutput[]): Promise<PluginOutput[]> {
        // If there are no custom output names defined, return the original plugin outputs
        if (!this.outputs || this.outputs.size === 0) {
            return pluginOutputs;
        }
    
        const mappedOutputs: PluginOutput[] = [];
        const originalOutputNames = Array.from(this.outputs.values());
    
        for (const pluginOutput of pluginOutputs) {
            // Find which custom name this plugin output corresponds to
            const customName = [...this.outputs.entries()].find(([_, originalName]) => originalName === pluginOutput.name)?.[0];
            
            if (customName) {
                // If a mapping is found, create a new output object with the custom name
                mappedOutputs.push({
                    ...pluginOutput,
                    name: customName,
                });
            } else {
                // If no mapping is found for this specific output, but there are other outputs defined,
                // we should not include it unless it's a special output type like 'error' or 'plan'.
                if (pluginOutput.name === 'error' || pluginOutput.resultType === PluginParameterType.PLAN) {
                    mappedOutputs.push(pluginOutput);
                }
            }
        }
    
        // If no outputs were mapped and there were outputs defined, it might be an issue.
        // However, we'll stick to the logic of only returning what's explicitly mapped.
        return mappedOutputs;
    }
    
    private resolvePlaceholdersInInputRunValues(inputRunValues: Map<string, InputValue>, findOutputFromSteps: (outputName: string) => any | null) {
        for (const [key, inputValue] of inputRunValues.entries()) {
            if (typeof inputValue.value === 'string') {
                inputValue.value = inputValue.value.replace(/\{([^\}]+)\}/g, (match, outputName) => {
                    const resolvedValue = findOutputFromSteps(outputName);
                    if (resolvedValue !== null) {
                        return typeof resolvedValue === 'string' ? resolvedValue : JSON.stringify(resolvedValue);
                    }
                    return match; // Keep placeholder if not found
                });
            } else if (typeof inputValue.value === 'object' && inputValue.value !== null) {
                // Recursively resolve placeholders in nested objects and arrays
                const resolveInObject = (obj: any): any => {
                    if (Array.isArray(obj)) {
                        return obj.map(item => resolveInObject(item));
                    }
                    if (typeof obj === 'object' && obj !== null) {
                        const newObj: { [key: string]: any } = {};
                        for (const prop in obj) {
                            if (Object.prototype.hasOwnProperty.call(obj, prop)) {
                                newObj[prop] = resolveInObject(obj[prop]);
                            }
                        }
                        return newObj;
                    }
                    if (typeof obj === 'string') {
                        return obj.replace(/\{([^\}]+)\}/g, (match, outputName) => {
                            const resolvedValue = findOutputFromSteps(outputName);
                            if (resolvedValue !== null) {
                                return typeof resolvedValue === 'string' ? resolvedValue : JSON.stringify(resolvedValue);
                            }
                            return match; // Keep placeholder if not found
                        });
                    }
                    return obj;
                };
                inputValue.value = resolveInObject(inputValue.value);
            }
        }
    }
    
    private async handleDelegate(executeAction: (step: Step) => Promise<PluginOutput[]>): Promise<PluginOutput[]> {
        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: '[Step]New steps created from decision',
            result: []
        }];
    }

    private async handleDecide(agent?: any): Promise<PluginOutput[]> {
        const condition = this.inputValues.get('condition')?.value;
        const trueSteps = this.inputValues.get('trueSteps')?.value as ActionVerbTask[];
        const falseSteps = this.inputValues.get('falseSteps')?.value as ActionVerbTask[];

        let result: boolean;
        if (typeof condition === 'function') {
            result = await condition();
        } else {
            result = !!condition;
        }

        const stepsToExecute = result ? trueSteps : falseSteps;
        if (stepsToExecute) {
            const newSteps = createFromPlan(stepsToExecute, this.persistenceManager, this.crossAgentResolver, this, agent);
            return [{
                success: true,
                name: 'steps',
                resultType: PluginParameterType.PLAN,
                resultDescription: '[Step]New steps created from decision',
                result: newSteps
            }];
        }
        return [];
    }

    private async handleRepeat(agent?: any): Promise<PluginOutput[]> {
        const count = this.inputValues.get('count')?.value as number;
        if (!count) {
            return this.createErrorResponse('Missing required input: count', '[Step]Error in REPEAT step', 'Missing required input: count');
        }

        try {
            const stepsInput = this.inputValues.get('steps');

            if (!stepsInput) {
                return this.createErrorResponse('Missing required input: steps', '[Step]Error in REPEAT step', 'Missing required input: steps');
            }

            const steps = this.parseStepsInput(stepsInput);
            const newSteps: Step[] = [];

            for (let i = 0; i < count; i++) {
                const iterationSteps = createFromPlan(steps, this.persistenceManager, this.crossAgentResolver, this, agent);
                newSteps.push(...iterationSteps);
            }

            return [{
                success: true,
                name: 'steps',
                resultType: PluginParameterType.PLAN,
                resultDescription: '[Step]New steps created from repeat',
                result: newSteps
            }];
        } catch (error) {
            return this.createErrorResponse(
                error instanceof Error ? error.message : 'Unknown error in REPEAT step',
                '[Step]Error in REPEAT step',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    private async handleTimeout(agent?: any): Promise<PluginOutput[]> {
        const timeoutMs = this.inputValues.get('timeout')?.value as number;
        const stepsInput = this.inputValues.get('steps');

        if (!stepsInput) {
            return this.createErrorResponse('Missing required input: steps', '[Step]Error in TIMEOUT step', 'Missing required input: steps');
        }

        try {
            const steps = this.parseStepsInput(stepsInput);
            const newSteps = createFromPlan(steps, this.persistenceManager, this.crossAgentResolver, this, agent);

            newSteps.forEach(step => {
                step.timeout = timeoutMs;
            });

            return [{
                success: true,
                name: 'steps',
                resultType: PluginParameterType.PLAN,
                resultDescription: '[Step]New steps created with timeout',
                result: newSteps
            }];
        } catch (error) {
            return this.createErrorResponse(
                error instanceof Error ? error.message : 'Unknown error in TIMEOUT step',
                '[Step]Error in TIMEOUT step',
                error instanceof Error ? error.message : String(error)
            );
        }
    }

    private async handleWhile(agent?: any): Promise<PluginOutput[]> {
        const conditionInput = this.inputValues.get('condition');
        const stepsInput = this.inputValues.get('steps');
        const maxIterations = 100;

        if (!conditionInput || !stepsInput) {
            return this.createErrorResponse('Missing required inputs: condition and steps are required', '[Step]Error in WHILE step', 'Missing required inputs: condition and steps are required');
        }

        const steps = this.parseStepsInput(stepsInput);
        const condition = conditionInput.value;

        let currentIteration = 0;
        const newSteps: Step[] = [];

        const checkStep = new Step({
            actionVerb: 'THINK',
            missionId: this.missionId,
            ownerAgentId: this.ownerAgentId,
            inputReferences: new Map([
                ['prompt', {
                    inputName: 'prompt',
                    value: `Evaluate if this condition is true: ${condition}`,
                    valueType: PluginParameterType.STRING,
                    args: {}
                }]
            ]),
            description: 'While loop condition evaluation',
            persistenceManager: this.persistenceManager,
            crossAgentResolver: this.crossAgentResolver,
        });
        if (agent) {
            agent.agentSet.registerStepLocation(checkStep.id, agent.id, agent.agentSetUrl);
        }
        newSteps.push(checkStep);

        const iterationSteps = createFromPlan(steps, this.persistenceManager, this.crossAgentResolver, this, agent);

        iterationSteps.forEach(step => {
            step.dependencies.push({
                inputName: '__condition',
                sourceStepId: checkStep.id,
                outputName: 'result'
            });
        });

        newSteps.push(...iterationSteps);

        const nextCheckStep = new Step({
            actionVerb: 'THINK',
            missionId: this.missionId,
            ownerAgentId: this.ownerAgentId,
            inputReferences: new Map([
                ['prompt', {
                    inputName: 'prompt',
                    value: `Evaluate if this condition is still true: ${condition}. If true, more steps will be created.`,
                    valueType: PluginParameterType.STRING,
                    args: {}
                }]
            ]),
            description: 'While loop continuation check',
            persistenceManager: this.persistenceManager,
            crossAgentResolver: this.crossAgentResolver,
        });
        if (agent) {
            agent.agentSet.registerStepLocation(nextCheckStep.id, agent.id, agent.agentSetUrl);
        }
        newSteps.push(nextCheckStep);

        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: '[Step]Initial steps created from while loop',
            result: newSteps
        }];
    }
    private async handleUntil(agent?: any): Promise<PluginOutput[]> {
        const conditionInput = this.inputValues.get('condition');
        const stepsInput = this.inputValues.get('steps');

        if (!conditionInput || !stepsInput) {
            return this.createErrorResponse('Missing required inputs: condition and steps are required', '[Step]Error in UNTIL step', 'Missing required inputs: condition and steps are required');
        }

        const steps = this.parseStepsInput(stepsInput);
        const condition = conditionInput.value;

        const newSteps: Step[] = [];

        const iterationSteps = createFromPlan(steps, this.persistenceManager, this.crossAgentResolver, this, agent);
        newSteps.push(...iterationSteps);

        const checkStep = new Step({
            actionVerb: 'THINK',
            missionId: this.missionId,
            ownerAgentId: this.ownerAgentId,
            inputReferences: new Map([
                ['prompt', {
                    inputName: 'prompt',
                    value: `Evaluate if this condition is now true: ${condition}. If false, more steps will be created.`,
                    valueType: PluginParameterType.STRING,
                    args: {}
                }]
            ]),
            description: 'Until loop condition evaluation',
            persistenceManager: this.persistenceManager,
            crossAgentResolver: this.crossAgentResolver,
        });
        if (agent) {
            agent.agentSet.registerStepLocation(checkStep.id, agent.id, agent.agentSetUrl);
        }

        iterationSteps.forEach(step => {
            checkStep.dependencies.push({
                inputName: `__until_${step.id}`,
                sourceStepId: step.id,
                outputName: 'result'
            });
        });

        newSteps.push(checkStep);

        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: '[Step]Initial steps created from until loop',
            result: newSteps
        }];
    }
    private async handleSequence(agent?: any): Promise<PluginOutput[]> {
        const stepsInput = this.inputValues.get('steps');

        if (!stepsInput) {
            return this.createErrorResponse('Missing required input: steps', '[Step]Error in SEQUENCE step', 'Missing required input: steps');
        }

        const steps = this.parseStepsInput(stepsInput);
        const newSteps: Step[] = [];
        let previousStepId: string | undefined;

        steps.forEach((task, index) => {
            const newStep = new Step({
                actionVerb: task.actionVerb,
                missionId: this.missionId,
                ownerAgentId: this.ownerAgentId,
                inputReferences: task.inputReferences || new Map(),
                inputValues: new Map<string, InputValue>(),
                description: task.description || `Sequential step ${index + 1}`,
                persistenceManager: this.persistenceManager,
                crossAgentResolver: this.crossAgentResolver
            });
            if (agent) {
                agent.agentSet.registerStepLocation(newStep.id, agent.id, agent.agentSetUrl);
            }

            if (previousStepId) {
                newStep.dependencies.push({
                    inputName: '__sequence',
                    sourceStepId: previousStepId,
                    outputName: 'result'
                });
            }

            previousStepId = newStep.id;
            newSteps.push(newStep);
        });

        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: '[Step]New steps created in sequence',
            result: newSteps
        }];
    }

    private inferValueType(value: any): PluginParameterType {
        switch (typeof value) {
            case 'string':
                return PluginParameterType.STRING;
            case 'number':
                return PluginParameterType.NUMBER;
            case 'boolean':
                return PluginParameterType.BOOLEAN;
            case 'object':
                if (value === null) return PluginParameterType.NULL;
                if (Array.isArray(value)) return PluginParameterType.ARRAY;
                return PluginParameterType.OBJECT;
            default:
                return PluginParameterType.STRING; // Default to string for unknown types
        }
    }

	private async handleForeach(agent?: any): Promise<PluginOutput[]> {
        const arrayInput = this.inputValues.get('array');
        const stepsInput = this.inputValues.get('steps');
        const batchSizeInput = this.inputValues.get('batch_size');
        const batchSize = typeof batchSizeInput?.value === 'number' ? batchSizeInput.value : null;

        console.log(`[Step ${this.id}] handleForeach: Starting execution. Batch size: ${batchSize || 'N/A'}`);
        console.debug(`[Step ${this.id}] handleForeach: Raw array input: ${JSON.stringify(this.truncateLargeStrings(arrayInput))}`);
        console.debug(`[Step ${this.id}] handleForeach: Raw steps input: ${JSON.stringify(this.truncateLargeStrings(stepsInput))}`);


        if (!arrayInput || arrayInput.value === undefined || arrayInput.value === null) {
            return this.createErrorResponse('FOREACH requires a non-null "array" input.', '[Step]Error in FOREACH step');
        }

        let inputArray: any[];
        if (Array.isArray(arrayInput.value)) {
            inputArray = arrayInput.value;
        } else {
            return this.createErrorResponse(`FOREACH "array" input must be an array. Received type: ${typeof arrayInput.value}`, '[Step]Error in FOREACH step');
        }
        console.debug(`[Step ${this.id}] handleForeach: Input array length: ${inputArray.length}`);


        if (!stepsInput || !Array.isArray(stepsInput.value)) {
            return this.createErrorResponse('FOREACH requires a "steps" input of type plan (array).', '[Step]Error in FOREACH step');
        }

        const subPlanTemplate: ActionVerbTask[] = stepsInput.value;
        console.debug(`[Step ${this.id}] handleForeach: Sub-plan template has ${subPlanTemplate.length} steps.`);
        
        const allNewSteps: Step[] = [];
        
        const startIndex = this.currentIndex || 0;
        const endIndex = batchSize ? Math.min(startIndex + batchSize, inputArray.length) : inputArray.length;
        const batch = inputArray.slice(startIndex, endIndex);

        console.log(`[Step ${this.id}] handleForeach: Processing batch from index ${startIndex} to ${endIndex} (Total items: ${inputArray.length}).`);

        for (let i = 0; i < batch.length; i++) {
            const item = batch[i];
            const itemIndex = startIndex + i;
            console.log(`[Step ${this.id}] handleForeach: Processing item ${itemIndex}:`, JSON.stringify(this.truncateLargeStrings(item)));
            
            const iterationSteps = createFromPlan(subPlanTemplate, this.persistenceManager, this.crossAgentResolver, this, agent);

            iterationSteps.forEach(step => {
                // Tag each new step with the FOREACH loop's scope ID
                (step as any).scope_id = this.scope_id;

                console.debug(`[Step ${this.id}] handleForeach: Configuring step ${step.id} for item ${itemIndex}`);
                for (const [inputName, inputRef] of step.inputReferences.entries()) {
                    if (inputRef.outputName === 'item' && (inputRef.sourceId === '0' || inputRef.sourceId === this.id)) {
                        step.inputValues.set(inputName, {
                            inputName: inputName,
                            value: item,
                            valueType: this.inferValueType(item)
                        });
                        console.debug(`[Step ${this.id}] handleForeach: Injected item into step ${step.id} input ${inputName}`);
                    }
                    // Allow sub-plan to access the index
                    if (inputRef.outputName === 'index' && (inputRef.sourceId === '0' || inputRef.sourceId === this.id)) {
                        step.inputValues.set(inputName, {
                            inputName: inputName,
                            value: itemIndex,
                            valueType: PluginParameterType.NUMBER
                        });
                        console.debug(`[Step ${this.id}] handleForeach: Injected index into step ${step.id} input ${inputName}`);
                    }
                }
            });

            allNewSteps.push(...iterationSteps);
        }

        // Update the index for the next batch
        this.currentIndex = endIndex;

        const isCompleted = this.currentIndex >= inputArray.length;
        const executionStatus = isCompleted ? 'completed' : 'in_progress';

        console.log(`[Step ${this.id}] handleForeach: Generated ${allNewSteps.length} new steps in this batch. Execution status: ${executionStatus}.`);
        console.debug(`[Step ${this.id}] handleForeach: All new steps: ${allNewSteps.map(s => s.id).join(', ')}`);
        
        const planOutput: PluginOutput = {
            success: true,
            name: 'newSteps',
            resultType: PluginParameterType.PLAN,
            resultDescription: `[Step] FOREACH created ${allNewSteps.length} new steps.`,
            result: allNewSteps
        };
        
        const stepsOutput: PluginOutput = {
            success: true,
            name: 'steps',
            resultType: PluginParameterType.ARRAY,
            resultDescription: 'Array of all instantiated subplan steps in this batch',
            result: allNewSteps
        };

        const statusOutput: PluginOutput = {
            success: true,
            name: 'execution_status',
            resultType: PluginParameterType.STRING,
            resultDescription: `FOREACH execution status.`,
            result: executionStatus
        };

        return [planOutput, stepsOutput, statusOutput];
    }
    
    private async handleRegroup(allSteps: Step[]): Promise<PluginOutput[]> {
        const stepIdsToRegroupInput = this.inputValues.get('stepIdsToRegroup');

        if (!stepIdsToRegroupInput || !Array.isArray(stepIdsToRegroupInput.value)) {
            return this.createErrorResponse('REGROUP requires a "stepIdsToRegroup" input of type array.', '[Step]Error in REGROUP step');
        }

        const stepIds: string[] = stepIdsToRegroupInput.value;
        const regroupedResults: any[] = [];
        let allCompleted = true;

        for (const stepId of stepIds) {
            const step = allSteps.find(s => s.id === stepId);
            if (!step) {
                // If a step is not found, we can't complete the regroup.
                // This could be a temporary state if steps are still being created.
                allCompleted = false;
                break;
            }

            if (step.status === StepStatus.COMPLETED) {
                if (step.result) {
                    regroupedResults.push(...step.result);
                }
            } else if (step.status === StepStatus.ERROR || step.status === StepStatus.CANCELLED) {
                // If any step in the group failed, the regroup fails.
                return this.createErrorResponse(`Step ${stepId} in the regroup set failed with status ${step.status}.`, '[Step]Error in REGROUP step');
            } else {
                // If any step is not yet completed, we have to wait.
                allCompleted = false;
            }
        }

        if (allCompleted) {
            this.status = StepStatus.COMPLETED;
            return [{
                success: true,
                name: 'regrouped_results',
                resultType: PluginParameterType.ARRAY,
                resultDescription: 'The aggregated results from the regrouped steps.',
                result: regroupedResults
            }];
        }

        return [{
            success: true,
            name: 'status',
            resultType: PluginParameterType.STRING,
            resultDescription: 'Waiting for all steps in the regroup set to complete.',
            result: 'waiting'
        }];
    }
    
    private async triggerReflection(executeAction: (step: Step) => Promise<PluginOutput[]>): Promise<void> {
        console.log(`[Step ${this.id}] triggerReflection: Triggering reflection for step ${this.actionVerb}`);
    }
    
    public async handleInternalVerb(
        actionVerb: string,
        inputValues: Map<string, InputValue>,
        outputs: Map<string, string>,
        executeAction: (step: Step) => Promise<PluginOutput[]>,
        thinkAction: (inputValues: Map<string, InputValue>, actionVerb: string) => Promise<PluginOutput[]>,
        delegateAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        askAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        allSteps: Step[],
    ): Promise<void> {
        console.log(`[Step ${this.id}] handleInternalVerb: Handling internal verb ${actionVerb}`);
    }
}

export function createFromPlan(plan: ActionVerbTask[], persistenceManager: AgentPersistenceManager, crossAgentResolver: CrossAgentDependencyResolver, parentStep?: Step, agent?: any): Step[] {
    const newSteps: Step[] = [];
    const stepMap: Map<string, Step> = new Map(); // Map task.id -> Step for dependency resolution

    // Pre-validation: Check for broken input references before creating steps
    // This fails early if plan has references to non-existent steps (Fix #3)
    const planTaskIds = new Set(plan.map(t => t.id || uuidv4()));
    const brokenReferences: string[] = [];
    
    plan.forEach(task => {
        if (task.inputs) {
            for (const key in task.inputs) {
                const input = task.inputs[key];
                if (input.sourceStep && input.sourceStep !== '0' && !planTaskIds.has(input.sourceStep)) {
                    brokenReferences.push(
                        `[createFromPlan] Task "${task.id}": input "${key}" references ` +
                        `non-existent step "${input.sourceStep}"`
                    );
                }
                // Also catch empty string values that might indicate incomplete references
                if (input.value === "" && key !== 'context' && key !== 'notes' && 
                    key !== 'comments' && key !== 'description') {
                    console.warn(
                        `[createFromPlan] Task "${task.id}": input "${key}" has empty string value. ` +
                        `This might indicate a broken reference or incomplete plan generation.`
                    );
                }
            }
        }
    });
    
    // Fail fast if any broken references detected (Fix #3)
    if (brokenReferences.length > 0) {
        const errorMsg = `[createFromPlan] PLAN VALIDATION ERROR: Found ${brokenReferences.length} broken references:\n` +
                        brokenReferences.join('\n');
        console.error(errorMsg);
        throw new Error(errorMsg);
    }

    // Pass 1: Create all steps and wire up dependencies
    plan.forEach(task => {
        if (!task.id || typeof task.id !== 'string') {
            console.warn(`[createFromPlan] Warning: Task in plan is missing a valid 'id'. Assigning a new one. Task: ${JSON.stringify(task)}`);
            task.id = uuidv4();
        }

        const newStep = new Step({
            parentStepId: parentStep?.id,
            id: task.id,
            templateId: task.id,
            scope_id: parentStep?.scope_id,
            missionId: parentStep?.missionId,
            ownerAgentId: parentStep?.ownerAgentId,
            actionVerb: task.actionVerb,
            description: task.description,
            outputs: Step.normalizeOutputs(task.outputs),
            originalOutputDefinitions: task.outputs,
            recommendedRole: task.recommendedRole,
            persistenceManager: persistenceManager,
            crossAgentResolver: crossAgentResolver,
        });

        // Wire up dependencies and values from the plan task
        if (task.inputs) {
            for (const key in task.inputs) {
                const input = task.inputs[key];

                if (input.sourceStep === '0') {
                    if (parentStep) {
                        // This input refers to the parent step's context.
                        // Look for the value in the parent's resolved inputs first.
                        const parentInputValue = parentStep.inputValues.get(input.outputName);
                        if (parentInputValue && parentInputValue.value !== undefined) {
                            newStep.inputValues.set(key, parentInputValue);
                            continue;
                        }

                        // If not found, look in the parent's references.
                        const parentInputRef = parentStep.inputReferences.get(input.outputName);
                        if (parentInputRef) {
                            // The new step now depends on whatever the parent depended on.
                            const dep: StepDependency = {
                                sourceStepId: parentInputRef.sourceId || '0',
                                outputName: parentInputRef.outputName!,
                                inputName: key
                            };
                            newStep.dependencies.push(dep);
                            newStep.inputReferences.set(key, { ...parentInputRef, inputName: key });
                        } else {
                            // This case handles implicit parent outputs (e.g., 'item' from FOREACH)
                            const dep: StepDependency = { sourceStepId: '0', outputName: input.outputName!, inputName: key };
                            newStep.dependencies.push(dep);
                            newStep.inputReferences.set(key, { inputName: key, outputName: input.outputName, sourceId: '0', valueType: input.valueType, args: input.args });
                        }
                    } else {
                        // No parent step exists, this is a broken reference. Validation should catch this.
                        const dep: StepDependency = { sourceStepId: '0', outputName: input.outputName!, inputName: key };
                        newStep.dependencies.push(dep);
                    }
                } else if (input.sourceStep) {
                    // This is a standard dependency on another step within the current plan.
                    const dep: StepDependency = {
                        sourceStepId: input.sourceStep,
                        outputName: input.outputName!,
                        inputName: key
                    };
                    newStep.dependencies.push(dep);
                    newStep.inputReferences.set(key, {
                        inputName: key,
                        outputName: input.outputName,
                        sourceId: input.sourceStep,
                        valueType: input.valueType,
                        args: input.args
                    });
                } else if (input.value !== undefined) {
                    // This is a static value.
                    newStep.inputValues.set(key, {
                        inputName: key,
                        value: input.value,
                        valueType: input.valueType,
                        args: input.args
                    });
                }
            }
        }
        stepMap.set(task.id, newStep);
        newSteps.push(newStep);
    });

    // Pass 2: Second pass for wiring dependencies that might not have been available in the first pass
    // This is crucial if a step references another step later in the plan array.
    newSteps.forEach(step => {
        for (const dep of step.dependencies) {
            if (!stepMap.has(dep.sourceStepId) && dep.sourceStepId !== '0') {
                 console.warn(`[createFromPlan] Second Pass: Could not find source step ${dep.sourceStepId} for dependency ${dep.inputName} in step ${step.id}. This might be an inter-agent dependency.`);
            }
        }


    });

    // Pass 3: Register steps with agent
    newSteps.forEach(step => {
        if (agent) {
            agent.agentSet.registerStepLocation(step.id, agent.id, agent.agentSetUrl);
        }
    });

    return newSteps;
}
