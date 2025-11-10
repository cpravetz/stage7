import { v4 as uuidv4 } from 'uuid';
import { PluginParameterType, PluginOutput, InputReference, InputValue, StepDependency, ActionVerbTask, ExecutionContext as PlanExecutionContext, PlanTemplate, OutputType, PredefinedRoles } from '@cktmcs/shared'; // Added ActionVerbTask and OutputType
import { MapSerializer } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared'; // Ensured MessageType is here, assuming it's separate or also from shared index
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { RuntimeForeachDetector, ForeachModification } from '../utils/RuntimeForeachDetector.js';

export enum StepStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    ERROR = 'error',
    PAUSED = 'paused',
    CANCELLED = 'cancelled',
    WAITING = 'waiting',
    SUB_PLAN_RUNNING = 'delegated' 
}

export interface StepModification {
    description?: string;
    inputValues?: Map<string, InputValue>; // For complete replacement of inputs
    updateInputs?: Map<string, InputValue>; // For merging/updating specific inputs
    status?: StepStatus;
    actionVerb?: string;
    recommendedRole?: string;
    // Add other modifiable fields as necessary
}

interface ErrorContext {
    message: string;
    stack?: string;
    type: string;
    timestamp: string;
    recoveryAttempts: number;
}

export class Step {
    readonly id: string;
    readonly missionId: string;
    readonly actionVerb: string;
    ownerAgentId: string;
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
    private tempData: Map<string, any> = new Map();
    private persistenceManager: AgentPersistenceManager;
    private backoffTime: number = 1000; // Initial backoff time in ms

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
        } else {
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
            } else if (rawOutputs && rawOutputs._type === 'Map' && Array.isArray(rawOutputs.entries)) {
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
        id?: string,
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
    }) {
    
        console.log(`[Step constructor] params.outputs =`, params.outputs);
        this.id = params.id || uuidv4();
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
        this.awaitsSignal = '';
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
        const inputRunValues = new Map<string, InputValue>();

        // Ensure missionId is always present in inputRunValues from the start.
        inputRunValues.set('missionId', {
            inputName: 'missionId',
            value: missionId,
            valueType: PluginParameterType.STRING,
            args: {}
        });

        // NEW PHASE 0: Copy existing inputValues (e.g., from FOREACH injection)
        // This ensures values already set in step.inputValues are considered.
        this.inputValues.forEach((inputValue, key) => {
            inputRunValues.set(key, { ...inputValue }); // Create a shallow copy
        });

        // Phase 1: Populate with all literal values defined in the plan.
        console.log(`[Step ${this.id}] Phase 1: Processing literal inputs from references...`);
        this.inputReferences.forEach((inputRef, key) => {
            if (inputRef.value !== undefined) {
                inputRunValues.set(key, {
                    inputName: key,
                    value: inputRef.value,
                    valueType: inputRef.valueType,
                    args: inputRef.args || {}
                });
            }
        });

        // Phase 2: Resolve dependencies and overwrite literals if necessary.
        console.log(`[Step ${this.id}] Phase 2: Resolving dependencies...`);
        for (const dep of this.dependencies) {
            let sourceStep = allSteps.find(s => s.id === dep.sourceStepId);

            if (!sourceStep) {
                try {
                    const stepData = await this.persistenceManager.loadStep(dep.sourceStepId);
                    if (stepData) {
                        sourceStep = new Step({ ...stepData, persistenceManager: this.persistenceManager });
                    }
                } catch (e) {
                    console.warn(`[Step ${this.id}]   - Error attempting to load source step ${dep.sourceStepId} from persistence:`, e instanceof Error ? e.message : e);
                }
            }

            // If sourceStep exists but has no result in-memory, attempt to hydrate from persistence.
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
                                    //console.log(`[Step ${this.id}]   - Hydrated source step ${sourceStep.id} result from persistence. Keys:`, sourceStep.result.map(r => r.name));
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

                    // If the expected type is an object but we got a string, try to parse it.
                    if ((output.resultType === PluginParameterType.OBJECT || output.resultType === PluginParameterType.ARRAY) && typeof value === 'string') {
                        console.log(`[Step ${this.id}]   - Attempting to parse string value for dependency '${dep.sourceStepId}.${dep.outputName}'. Original value: ${value.substring(0, 200)}...`);
                        try {
                            value = JSON.parse(value);
                            console.log(`[Step ${this.id}]   - Successfully parsed value for dependency '${dep.sourceStepId}.${dep.outputName}'. Parsed type: ${typeof value}, isArray: ${Array.isArray(value)}`);
                        } catch (e) {
                            console.warn(`[Step ${this.id}]   - Failed to parse string to object/array for dependency '${dep.sourceStepId}.${dep.outputName}'. Error: ${e instanceof Error ? e.message : e}. Passing as string.`);
                        }
                    }
                    
                    console.log(`[Step ${this.id}]   - Populating '${dep.inputName}' from dependency '${dep.sourceStepId}.${dep.outputName}'.`);
                    inputRunValues.set(dep.inputName, {
                        inputName: dep.inputName,
                        value: value,
                        valueType: output.resultType,
                        args: {}
                    });
                } else {
                    console.log(`[Step ${this.id}]   - Dependency '${dep.sourceStepId}.${dep.outputName}' not satisfied. Named output not found.`);
                }
            } else {
                console.log(`[Step ${this.id}]   - Source step '${dep.sourceStepId}' not found or has no result.`);
            }
        }



        // Phase 4: Resolve placeholders (must be last).
        console.log(`[Step ${this.id}] Phase 4: Resolving placeholders...`);
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
        this.resolvePlaceholdersInInputRunValues(inputRunValues, findOutputFromSteps);

        console.log(`[Step ${this.id}] dereferenceInputsForExecution: Completed. Final inputs:`, Array.from(inputRunValues.keys()));
        return inputRunValues;
    }

    areDependenciesSatisfied(allSteps: Step[]): boolean {
        return this.dependencies.every(dep => {
            if (!dep.sourceStepId) {
                return true;
            }
            const sourceStep = allSteps.find(s => s.id === dep.sourceStepId);

            // Source step must exist and be completed.
            if (!sourceStep || sourceStep.status !== StepStatus.COMPLETED) {
                return false;
            }

            // If dependency is just a signal (like for control flow), we don't need to check for a named output.
            if (dep.inputName.startsWith('__')) {
                return true;
            }

            // For regular dependencies, the named output must exist in the source step's result.
            const outputExists = sourceStep.result?.some(r => r.name === dep.outputName && r.result !== null && r.result !== undefined);
            if (!outputExists) {
                console.warn(`[areDependenciesSatisfied] Step ${this.id} dependency on output '${dep.outputName}' from step ${sourceStep.id} is not met because the output is not in the result or is null/undefined.`);
                return false;
            }

            return true;
        });
    }

    areDependenciesPermanentlyUnsatisfied(allSteps: Step[]): boolean {
        return this.dependencies.some(dep => {
            if (!dep.sourceStepId) {
                return false; // Cannot determine, assume not unsatisfied
            }
            const sourceStep = allSteps.find(s => s.id === dep.sourceStepId);
            if (!sourceStep) {
                return true; // Source step doesn't exist, permanently unsatisfied
            }
            const isTerminated = sourceStep.status === StepStatus.COMPLETED ||
                                 sourceStep.status === StepStatus.ERROR ||
                                 sourceStep.status === StepStatus.CANCELLED;

            if (isTerminated) {
                // The source step is finished. Now check if the dependency is actually met.
                const isSatisfied = this.areDependenciesSatisfied(allSteps);
                return !isSatisfied; // If it's terminated and not satisfied, it's permanently unsatisfied.
            }
            return false; // Source step is still running or pending, so not permanently unsatisfied yet.
        });
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

    private async handleForeach(): Promise<PluginOutput[]> {
        const arrayInput = this.inputValues.get('array');
        const stepsInput = this.inputValues.get('steps');
        console.log('Running FOREACH for Step', this.id);
        console.log(`[Step ${this.id}] handleForeach: arrayInput =`, arrayInput);
        console.log(`[Step ${this.id}] handleForeach: arrayInput.value =`, arrayInput?.value);
        if (!arrayInput || !arrayInput.value) {
            return this.createErrorResponse('FOREACH requires an "array" input.', '[Step]Error in FOREACH step');
        }

        let inputArray: any[];
        if (Array.isArray(arrayInput.value)) {
            inputArray = arrayInput.value;
        } else {
            return this.createErrorResponse('FOREACH requires an "array" input that is an array.', '[Step]Error in FOREACH step');
        }

        if (!stepsInput || !Array.isArray(stepsInput.value)) {
            return this.createErrorResponse('FOREACH requires a "steps" input of type plan.', '[Step]Error in FOREACH step');
        }

        const subPlanTemplate: ActionVerbTask[] = stepsInput.value;
        const allNewSteps: Step[] = [];
        const endStepIds: string[] = [];

        for (let i = 0; i < inputArray.length; i++) {
            const item = inputArray[i];
            
            // Create a new set of steps for this iteration
            const iterationSteps = createFromPlan(subPlanTemplate, this.persistenceManager, this);

            // Inject the loop item value into the steps that need it
            iterationSteps.forEach(step => {
                for (const [inputName, inputRef] of step.inputReferences.entries()) {
                    if (inputRef.outputName === 'item' && (inputRef.sourceId ===  '0' || inputRef.sourceId === this.id)) {
                        let valueToPass = item;
                        if (inputName === 'url' && typeof item === 'object' && item !== null && item.hasOwnProperty('url')) {
                            valueToPass = item.url;
                        } else if (typeof item === 'object' && item !== null && item.hasOwnProperty(inputName)) {
                            valueToPass = item[inputName];
                        }
                        step.inputValues.set(inputName, {
                            inputName: inputName,
                            value: valueToPass,
                            valueType: this.inferValueType(valueToPass)
                        });
                    }
                }
            });

            allNewSteps.push(...iterationSteps);

            // Find end steps for this instance
            const allSourceStepIds = new Set<string>();
            iterationSteps.forEach(step => {
                step.dependencies.forEach(dep => {
                    if (iterationSteps.find(s => s.id === dep.sourceStepId)) {
                        allSourceStepIds.add(dep.sourceStepId);
                    }
                });
            });

            const endSteps = iterationSteps.filter(step => !allSourceStepIds.has(step.id));
            endStepIds.push(...endSteps.map(step => step.id));
        }

        const planOutput: PluginOutput = {
            success: true,
            name: 'newSteps', // Changed to newSteps to avoid conflict
            resultType: PluginParameterType.PLAN,
            resultDescription: `[Step] FOREACH created ${allNewSteps.length} new steps.`,
            result: allNewSteps
        };
        console.log(`[Step ${this.id}] FOREACH created ${allNewSteps.length} new steps.`);
        const endStepsOutput: PluginOutput = {
            success: true,
            name: 'instanceEndStepIds', 
            resultType: PluginParameterType.ARRAY,
            resultDescription: 'UUIDs of end steps for each subplan instance',
            result: endStepIds
        };

        return [planOutput, endStepsOutput];
    }



    private inferValueType(value: any): PluginParameterType {
        if (typeof value === 'string') return PluginParameterType.STRING;
        if (typeof value === 'number') return PluginParameterType.NUMBER;
        if (typeof value === 'boolean') return PluginParameterType.BOOLEAN;
        if (Array.isArray(value)) return PluginParameterType.ARRAY;
        if (typeof value === 'object' && value !== null) return PluginParameterType.OBJECT;
        return PluginParameterType.ANY;
    }

    private async finalizeStepExecution(result: PluginOutput[], allSteps: Step[]): Promise<void> {
        this.result = await this.mapPluginOutputsToCustomNames(result);
        // Check if any output indicates failure
        const hasFailureOutput = this.result.some(output => !output.success);
        this.status = hasFailureOutput ? StepStatus.ERROR : StepStatus.COMPLETED;
        const outputType = this.getOutputType(allSteps);
        await this.persistenceManager.saveWorkProduct(this, this.result!, outputType);

        await this.logEvent({
            eventType: 'step_result',
            stepId: this.id,
            missionId: this.missionId,
            actionVerb: this.actionVerb,
            status: this.status,
            result: this.result,
            dependencies: this.dependencies,
            timestamp: new Date().toISOString()
        });
    }

    async execute(
        executeAction: (step: Step) => Promise<PluginOutput[]>,
        thinkAction: (inputValues: Map<string, InputValue>, actionVerb: string) => Promise<PluginOutput[]>,
        delegateAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        askAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        allSteps?: Step[]
    ): Promise<PluginOutput[]> {
        console.log(`[Step ${this.id}] execute: Executing step ${this.actionVerb}...`);
        console.log(`[Step ${this.id}] execute: step.outputs (custom output names) =`, this.outputs ? Array.from(this.outputs.keys()) : []);

        // Note: Input preparation is now handled in executeAction (executeActionWithCapabilitiesManager)
        // which calls prepareInputValuesForExecution. This avoids duplicate processing.
        console.log(`[Step ${this.id}] execute: Input values before execution:`, this.inputValues);
        this.status = StepStatus.RUNNING;

        // Phase 1: Query knowledge base before execution (for research tasks)
        let knowledgeResults: PluginOutput[] | null = null;
        if (this.shouldQueryKnowledgeBase()) {
            knowledgeResults = await this.queryKnowledgeBase(executeAction);
            if (knowledgeResults && knowledgeResults.length > 0) {
                // Add knowledge context to step inputs if relevant information was found
                const knowledgeContent = knowledgeResults[0].result;
                if (knowledgeContent && Array.isArray(knowledgeContent) && knowledgeContent.length > 0) {
                    const relevantInfo = knowledgeContent.map(item => item.document).join('\n\n');
                    this.inputValues.set('knowledgeContext', {
                        inputName: 'knowledgeContext',
                        value: `Relevant knowledge from previous work:\n${relevantInfo}`,
                        valueType: PluginParameterType.STRING
                    });
                    console.log(`[Step ${this.id}] Added knowledge context from ${knowledgeContent.length} previous results`);
                }
            }
        }

        try {
            let result: PluginOutput[];
            switch (this.actionVerb) {
                case 'THINK':
                case 'GENERATE':
                    result = await thinkAction(this.inputValues, this.actionVerb);
                    break;
                case 'DELEGATE':
                    result = await this.handleDelegate(executeAction);
                    break;
                case 'CHAT':
                case 'ASK':
                case MessageType.REQUEST:
                    result = await askAction(this.inputValues);
                    break;
                case 'IF_THEN':
                    result = await this.handleDecide();
                    break;
                case 'REPEAT':
                    result = await this.handleRepeat();
                    break;
                case 'WHILE':
                    result = await this.handleWhile();
                    break;
                case 'UNTIL':
                    result = await this.handleUntil();
                    break;
                case 'SEQUENCE':
                    result = await this.handleSequence();
                    break;
                case 'TIMEOUT':
                    result = await this.handleTimeout();
                    break;
                case 'FOREACH':
                    result = await this.handleForeach();
                    break;
                case 'REGROUP':
                    result = await this.handleRegroup(allSteps!);
                    break;
                default:
                    result = await executeAction(this);
            }

            if (!Array.isArray(result)) {
                result = [result];
            }

            console.log(`[Step ${this.id}] execute: Raw plugin outputs:`, result.map(r => ({ name: r.name, resultType: r.resultType })));

            result.forEach(resultItem => {
                if (!resultItem.mimeType) { resultItem.mimeType = 'text/plain'; }
            });

            if (result[0]?.resultType === PluginParameterType.PLAN) {
                // Mark step as completed since the plan will be handled by the Agent
                this.status = StepStatus.COMPLETED;
                this.result = result;

                // Save the plan result
                await this.persistenceManager.saveWorkProduct(this, result);

                console.log(`[Step ${this.id}] execute: Plan result will be processed by Agent for execution. Status: ${this.status}`);
            } else {
                await this.finalizeStepExecution(result, allSteps!);

                console.log(`[Step ${this.id}] execute: Mapped plugin outputs to step.result:`, this.result?.map(r => ({ name: r.name, resultType: r.resultType })));

                // Phase 2: Save results to knowledge base after successful execution
                if (this.shouldSaveToKnowledgeBase()) {
                    await this.saveToKnowledgeBase(executeAction);
                }

                // Phase 3: Trigger reflection for self-correction on complex tasks
                if (this.shouldTriggerReflection()) {
                    await this.triggerReflection(executeAction);
                }

                await this.logEvent({
                    eventType: 'step_result',
                    stepId: this.id,
                    missionId: this.missionId,
                    actionVerb: this.actionVerb,
                    status: this.status,
                    result: this.result,
                    dependencies: this.dependencies,
                    timestamp: new Date().toISOString()
                });
                console.log(`[Step ${this.id}] execute: Step completed with status: ${this.status}. Result: ${JSON.stringify(this.result)}`);

            }
            return this.result!;

        } catch (error) {
            this.status = StepStatus.ERROR;
            const errorResult = this.createErrorResponse(error instanceof Error ? error.message : String(error), '[Step]Error executing step', 'An error occurred during step execution. Please check the logs for details.');
            this.result = errorResult;

            console.error(`[Step ${this.id}] execute: Step failed with status: ${this.status}. Error: ${error instanceof Error ? error.message : String(error)}`);

            await this.logEvent({
                eventType: 'step_result',
                stepId: this.id,
                missionId: this.missionId,
                actionVerb: this.actionVerb,
                status: this.status,
                result: errorResult,
                timestamp: new Date().toISOString()
            });

            await this.persistenceManager.saveWorkProduct(this, errorResult);

            // Phase 3: Trigger reflection for self-correction on errors or complex tasks
            if (this.shouldTriggerReflection()) {
                await this.triggerReflection(executeAction);
            }

            return errorResult;
        }
    }

    private updateStatus(status: StepStatus, result?: PluginOutput[]): void {
        this.status = status;
        if (result) {
            this.result = result;
        }
        this.logEvent({
            eventType: 'step_status_changed',
            stepId: this.id,
            missionId: this.missionId,
            newStatus: status,
            result: result,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Check if this step should query the knowledge base before execution
     */
    private shouldQueryKnowledgeBase(): boolean {
        const researchTasks = ['SEARCH', 'SCRAPE', 'TEXT_ANALYSIS', 'ACCOMPLISH'];
        return researchTasks.includes(this.actionVerb);
    }

    /**
     * Check if this step should save results to the knowledge base after execution
     */
    private shouldSaveToKnowledgeBase(): boolean {
        const knowledgeGeneratingTasks = ['SEARCH', 'SCRAPE', 'TEXT_ANALYSIS', 'ACCOMPLISH'];
        return knowledgeGeneratingTasks.includes(this.actionVerb) && this.status === StepStatus.COMPLETED;
    }

    /**
     * Check if this step should trigger reflection for self-correction
     */
    private shouldTriggerReflection(): boolean {
        // Trigger reflection for complex tasks or when there are errors
        const complexTasks = ['ACCOMPLISH', 'CODE_EXECUTOR', 'DELEGATE'];
        return complexTasks.includes(this.actionVerb) || this.status === StepStatus.ERROR;
    }

    /**
     * Determine the knowledge domain for this step based on context
     */
    private determineKnowledgeDomain(): string {
        // Extract domain from step description or use action verb as fallback
        const description = this.description?.toLowerCase() || '';

        if (description.includes('ai') || description.includes('artificial intelligence') || description.includes('machine learning')) {
            return 'ai_development';
        } else if (description.includes('research') || description.includes('analysis') || description.includes('study')) {
            return 'research_findings';
        } else if (description.includes('code') || description.includes('programming') || description.includes('development')) {
            return 'software_development';
        } else if (description.includes('data') || description.includes('database') || description.includes('analytics')) {
            return 'data_analysis';
        } else {
            // Use action verb as domain
            return this.actionVerb.toLowerCase() + '_results';
        }
    }

    /**
     * Extract keywords from step description and inputs
     */
    private extractKeywords(): string[] {
        const keywords: string[] = [];

        // Add action verb as a keyword
        keywords.push(this.actionVerb.toLowerCase());

        // Extract keywords from description
        if (this.description) {
            const words = this.description.toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 3);
            keywords.push(...words.slice(0, 5)); // Take first 5 meaningful words
        }

        // Extract keywords from input values
        this.inputValues.forEach((inputValue, inputName) => {
            if (typeof inputValue.value === 'string' && inputValue.value.length < 100) {
                const inputWords = inputValue.value.toLowerCase()
                    .replace(/[^\w\s]/g, ' ')
                    .split(/\s+/)
                    .filter(word => word.length > 3);
                keywords.push(...inputWords.slice(0, 3)); // Take first 3 words from each input
            }
        });

        // Remove duplicates and return
        return [...new Set(keywords)];
    }

    /**
     * Query the knowledge base before executing this step
     */
    private async queryKnowledgeBase(executeAction: (step: Step) => Promise<PluginOutput[]>): Promise<PluginOutput[] | null> {
        try {
            console.log(`[Step ${this.id}] Querying knowledge base before execution...`);

            const domain = this.determineKnowledgeDomain();
            const keywords = this.extractKeywords();
            const queryText = keywords.join(' ');

            // Create a temporary step for querying knowledge base
            const queryStep = new Step({
                id: uuidv4(),
                actionVerb: 'QUERY_KNOWLEDGE_BASE',
                description: `Query knowledge base for relevant information about ${queryText}`,
                missionId: this.missionId,
                dependencies: [],
                persistenceManager: this.persistenceManager
            });

            // Set up inputs for the query
            queryStep.inputValues.set('queryText', {
                inputName: 'queryText',
                value: queryText,
                valueType: PluginParameterType.STRING
            });

            queryStep.inputValues.set('domains', {
                inputName: 'domains',
                value: [domain],
                valueType: PluginParameterType.ARRAY
            });

            queryStep.inputValues.set('maxResults', {
                inputName: 'maxResults',
                value: 3,
                valueType: PluginParameterType.NUMBER
            });

            // Execute the query
            const queryResult = await executeAction(queryStep);

            if (queryResult && queryResult.length > 0 && queryResult[0].success) {
                console.log(`[Step ${this.id}] Found relevant knowledge in domain '${domain}'`);
                return queryResult;
            } else {
                console.log(`[Step ${this.id}] No relevant knowledge found in domain '${domain}'`);
                return null;
            }
        } catch (error) {
            console.warn(`[Step ${this.id}] Error querying knowledge base:`, error);
            return null; // Don't fail the main step if knowledge query fails
        }
    }

    /**
     * Save results to the knowledge base after successful execution
     */
    private async saveToKnowledgeBase(executeAction: (step: Step) => Promise<PluginOutput[]>): Promise<void> {
        try {
            if (!this.result || this.result.length === 0 || !this.result[0].success) {
                console.log(`[Step ${this.id}] Skipping knowledge base save - no successful results`);
                return;
            }

            console.log(`[Step ${this.id}] Saving results to knowledge base...`);

            const domain = this.determineKnowledgeDomain();
            const keywords = this.extractKeywords();

            // Prepare content to save
            let content = '';
            if (this.result[0].resultDescription) {
                content = this.result[0].resultDescription;
            } else if (typeof this.result[0].result === 'string') {
                content = this.result[0].result;
            } else {
                content = JSON.stringify(this.result[0].result);
            }

            // Limit content length for storage
            if (content.length > 2000) {
                content = content.substring(0, 2000) + '... [truncated]';
            }

            // Create a temporary step for saving to knowledge base
            const saveStep = new Step({
                id: uuidv4(),
                actionVerb: 'SAVE_TO_KNOWLEDGE_BASE',
                description: `Save results from ${this.actionVerb} to knowledge base`,
                missionId: this.missionId,
                dependencies: [],
                persistenceManager: this.persistenceManager
            });

            // Set up inputs for saving
            saveStep.inputValues.set('domain', {
                inputName: 'domain',
                value: domain,
                valueType: PluginParameterType.STRING
            });

            saveStep.inputValues.set('keywords', {
                inputName: 'keywords',
                value: keywords,
                valueType: PluginParameterType.ARRAY
            });

            saveStep.inputValues.set('content', {
                inputName: 'content',
                value: content,
                valueType: PluginParameterType.STRING
            });

            saveStep.inputValues.set('metadata', {
                inputName: 'metadata',
                value: {
                    sourceStep: this.actionVerb,
                    stepId: this.id,
                    missionId: this.missionId,
                    timestamp: new Date().toISOString()
                },
                valueType: PluginParameterType.OBJECT
            });

            // Execute the save
            const saveResult = await executeAction(saveStep);

            if (saveResult && saveResult.length > 0 && saveResult[0].success) {
                console.log(`[Step ${this.id}] Successfully saved results to knowledge base domain '${domain}'`);
            } else {
                console.warn(`[Step ${this.id}] Failed to save results to knowledge base`);
            }
        } catch (error) {
            console.warn(`[Step ${this.id}] Error saving to knowledge base:`, error);
            // Don't fail the main step if knowledge save fails
        }
    }

    /**
     * Trigger reflection for self-correction after complex tasks or errors
     */
    private async triggerReflection(executeAction: (step: Step) => Promise<PluginOutput[]>): Promise<void> {
        try {
            console.log(`[Step ${this.id}] Triggering reflection for self-correction...`);

            // Create a temporary step for reflection
            const reflectStep = new Step({
                id: uuidv4(),
                actionVerb: 'REFLECT',
                description: `Reflect on ${this.actionVerb} execution for self-correction`,
                missionId: this.missionId,
                dependencies: [],
                persistenceManager: this.persistenceManager
            });

            // Set up inputs for reflection

            // Create a simplified plan history for this step, ensuring error and result are stringified if they are objects
            const stepHistory = [{
                id: this.id,
                actionVerb: this.actionVerb,
                description: this.description || '',
                success: this.status === StepStatus.COMPLETED,
                error: this.status === StepStatus.ERROR 
                    ? (typeof this.lastError === 'string' ? this.lastError : JSON.stringify(this.lastError || this.result?.[0]?.error || 'Unknown error'))
                    : undefined,
                result: typeof this.result?.[0]?.resultDescription === 'string' 
                    ? this.result[0].resultDescription 
                    : JSON.stringify(this.result?.[0]?.result || 'No result description')
            }];

            reflectStep.inputValues.set('plan_history', {
                inputName: 'plan_history',
                value: JSON.stringify(stepHistory), 
                valueType: PluginParameterType.STRING
            });

            reflectStep.inputValues.set('question', {
                inputName: 'question',
                value: this.status === StepStatus.ERROR
                    ? `What went wrong with the ${this.actionVerb} step and how can it be improved?`
                    : `How can the ${this.actionVerb} step execution be optimized for better performance?`,
                valueType: PluginParameterType.STRING
            });

            // Add agent ID for self-correction if available
            const agentId = this.ownerAgentId; // Extract agent ID from step ID
            reflectStep.inputValues.set('agentId', {
                inputName: 'agentId',
                value: agentId,
                valueType: PluginParameterType.STRING
            });

            // Execute the reflection
            const reflectResult = await executeAction(reflectStep);

            if (reflectResult && reflectResult.length > 0 && reflectResult[0].success) {
                console.log(`[Step ${this.id}] Reflection completed successfully for agent ${agentId}`);
            } else {
                console.warn(`[Step ${this.id}] Reflection failed or returned no results`);
            }
        } catch (error) {
            console.warn(`[Step ${this.id}] Error during reflection:`, error);
            // Don't fail the main step if reflection fails
        }
    }

    private async handleDecide(): Promise<PluginOutput[]> {
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
            const newSteps = createFromPlan(stepsToExecute, this.persistenceManager, this);
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

    private async handleRepeat(): Promise<PluginOutput[]> {
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
                const iterationSteps = createFromPlan(steps, this.persistenceManager, this);
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

    private async handleTimeout(): Promise<PluginOutput[]> {
        const timeoutMs = this.inputValues.get('timeout')?.value as number;
        const stepsInput = this.inputValues.get('steps');

        if (!stepsInput) {
            return this.createErrorResponse('Missing required input: steps', '[Step]Error in TIMEOUT step', 'Missing required input: steps');
        }

        try {
            const steps = this.parseStepsInput(stepsInput);
            const newSteps = createFromPlan(steps, this.persistenceManager, this);

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

    private async handleWhile(): Promise<PluginOutput[]> {
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
        });

        newSteps.push(checkStep);

        const iterationSteps = createFromPlan(steps, this.persistenceManager, this);

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
        });

        newSteps.push(nextCheckStep);

        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: '[Step]Initial steps created from while loop',
            result: newSteps
        }];
    }

    private async handleRegroup(allSteps: Step[]): Promise<PluginOutput[]> {
        console.log(`[Step ${this.id}] Handling REGROUP step...`);

        const stepIdsToRegroupInput = this.inputValues.get('stepIdsToRegroup');

        if (!stepIdsToRegroupInput || !Array.isArray(stepIdsToRegroupInput.value)) {
            return this.createErrorResponse('REGROUP requires an array of step IDs to regroup.', '[Step]Error in REGROUP step');
        }

        const stepIdsToRegroup: string[] = stepIdsToRegroupInput.value;
        const collectedResults: PluginOutput[] = [];
        const failedResults: PluginOutput[] = []; // Declare and initialize failedResults
        let allDependenciesFinished = true;

        for (const stepId of stepIdsToRegroup) {
            const workProduct = await this.persistenceManager.loadStepWorkProduct(this.ownerAgentId, stepId);

            if (!workProduct || !workProduct.data) {
                // If any work product is missing, it means the step hasn't finished yet.
                allDependenciesFinished = false;
                break; 
            }
            // If work product exists, the step has finished (success or error).
            // We will process its results later if all dependencies are finished.
        }

        if (!allDependenciesFinished) {
            // If not all steps are finished, set status to WAITING and return a special output.
            this.status = StepStatus.WAITING;
            console.log(`[Step ${this.id}] REGROUP waiting for dependent steps to finish.`);
            return [{
                success: true,
                name: 'status',
                resultType: PluginParameterType.STRING,
                resultDescription: 'REGROUP is waiting for dependent steps to finish.',
                result: StepStatus.WAITING
            }];
        }

        // All dependent steps have finished, proceed with aggregation
        for (const stepId of stepIdsToRegroup) {
            try {
                const workProduct = await this.persistenceManager.loadStepWorkProduct(this.ownerAgentId, stepId);
                // workProduct and workProduct.data are guaranteed to exist here due to the check above

                // Ensure workProduct and workProduct.data are not null before proceeding
                if (workProduct && workProduct.data) {
                    const resultsForStep = MapSerializer.transformFromSerialization(workProduct.data) as PluginOutput[];

                    resultsForStep.forEach(output => {
                        if (output.success) {
                            collectedResults.push(output);
                        } else {
                            // Collect failed results for reporting
                            console.warn(`[Step ${this.id}] Dependent step ${stepId} failed: ${output.error}`);
                            failedResults.push(output);
                        }
                    });
                }

            } catch (error) {
                console.warn(`[Step ${this.id}] Error loading work product for step ${stepId} during aggregation:`, error instanceof Error ? error.message : String(error));
                // This catch block should ideally not be hit if allDependenciesFinished is true
            }
        }

        // The collectedResults already contain successful PluginOutput objects.
        // We need to extract the actual 'result' values from these PluginOutput objects.
        const finalAggregatedResult = collectedResults.map(r => r.result).flat();

        // If there were failures, we might want to indicate that in the overall result
        if (failedResults.length > 0) {
            return [{
                success: false,
                name: 'aggregatedResult',
                resultType: PluginParameterType.ARRAY,
                resultDescription: `[Step] REGROUP combined results with ${failedResults.length} failures.`, 
                result: finalAggregatedResult,
                error: `Some dependent steps failed: ${failedResults.map(f => f.error).join('; ')}`
            }];
        } else {
            return [{
                success: true,
                name: 'aggregatedResult',
                resultType: PluginParameterType.ARRAY,
                resultDescription: `[Step] REGROUP combined results into a single array.`, 
                result: finalAggregatedResult
            }];
        }
    }

    private async handleUntil(): Promise<PluginOutput[]> {
        const conditionInput = this.inputValues.get('condition');
        const stepsInput = this.inputValues.get('steps');

        if (!conditionInput || !stepsInput) {
            return this.createErrorResponse('Missing required inputs: condition and steps are required', '[Step]Error in UNTIL step', 'Missing required inputs: condition and steps are required');
        }

        const steps = this.parseStepsInput(stepsInput);
        const condition = conditionInput.value;

        const newSteps: Step[] = [];

        const iterationSteps = createFromPlan(steps, this.persistenceManager, this);
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
        });

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

    private async handleDelegate(executeAction: (step: Step) => Promise<PluginOutput[]>): Promise<PluginOutput[]> {
        const goal = this.inputValues.get('goal')?.value ||
                    this.inputValues.get('task')?.value ||
                    this.inputValues.get('description')?.value ||
                    this.description;

        if (!goal) {
            return this.createErrorResponse('Goal, task, or description input is required for DELEGATE action', '[Step]Error in DELEGATE step', 'Missing required input: goal/task/description');
        }

        const accomplishStep = new Step({
            actionVerb: 'ACCOMPLISH',
            missionId: this.missionId,
            ownerAgentId: this.ownerAgentId,
            inputReferences: new Map(),
            inputValues: new Map([...this.inputValues.entries(),
                ['goal', {
                    inputName: 'goal',
                    value: goal,
                    valueType: PluginParameterType.STRING,
                    args: {}
                }]
            ]),
            description: `Generate plan for: ${goal}`,
            persistenceManager: this.persistenceManager
        });

        const accomplishResult = await executeAction(accomplishStep);

        if (accomplishResult && accomplishResult.length > 0 && accomplishResult[0].success) {
            return [{
                success: true,
                name: 'delegatedPlan',
                resultType: PluginParameterType.PLAN,
                resultDescription: 'Plan generated from delegation',
                result: accomplishResult[0].result
            }];
        } else {
            return this.createErrorResponse(accomplishResult?.[0]?.error || 'Unknown error in delegation planning', '[Step]Error in DELEGATE step', 'Failed to generate plan for delegation');
        }
    }

    private async handleSequence(): Promise<PluginOutput[]> {
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
                persistenceManager: this.persistenceManager
            });

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

    public clearTempData(): void {
        this.tempData.clear();
        if (this.result) {
            this.result = this.result.map(output => ({
                ...output,
                result: typeof output.result === 'string' ? output.result : null
            }));
        }
    }

    public storeTempData(key: string, data: any): void {
        this.tempData.set(key, data);
    }

    public getTempData(key: string): any {
        return this.tempData.get(key);
    }

    public async handleInternalVerb(
        internalActionVerb: string,
        internalInputValues: Map<string, InputValue>,
        internalOutputs: Map<string, string>,
        executeAction: (step: Step) => Promise<PluginOutput[]>,
        thinkAction: (inputValues: Map<string, InputValue>, actionVerb: string) => Promise<PluginOutput[]>,
        delegateAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        askAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        allSteps?: Step[]
    ): Promise<void> {
        // Temporarily update the step's actionVerb, inputValues, and outputs
        // so the internal handlers can use them.
        const originalActionVerb = this.actionVerb;
        const originalInputValues = this.inputValues;
        const originalOutputs = this.outputs;

        (this as any).actionVerb = internalActionVerb;
        this.inputValues = internalInputValues;
        this.outputs = internalOutputs;

        try {
            let result: PluginOutput[];
            switch (internalActionVerb) {
                case 'THINK':
                case 'GENERATE':
                    result = await thinkAction(this.inputValues, internalActionVerb);
                    if (!Array.isArray(result)) result = [result];
                    break;
                case 'DELEGATE':
                    result = await this.handleDelegate(executeAction);
                    break;
                case 'CHAT':
                case 'ASK':
                case MessageType.REQUEST:
                    console.log('Using askAction for '+ internalActionVerb);
                    result = await askAction(this.inputValues);
                    break;
                case 'IF_THEN':
                    result = await this.handleDecide();
                    break;
                case 'REPEAT':
                    result = await this.handleRepeat();
                    break;
                case 'WHILE':
                    result = await this.handleWhile();
                    break;
                case 'UNTIL':
                    result = await this.handleUntil();
                    break;
                case 'SEQUENCE':
                    result = await this.handleSequence();
                    break;
                case 'TIMEOUT':
                    result = await this.handleTimeout();
                    break;
                case 'FOREACH':
                    result = await this.handleForeach();
                    break;
                default:
                    // This should ideally not be reached if CapabilitiesManager correctly identifies internal verbs
                    // and only sends known internal verbs.
                    console.warn(`[Step] Unknown internal action verb: ${internalActionVerb}. Falling back to external execution.`);
                    result = await executeAction(this);
            }

            if (!Array.isArray(result)) {
                result = [result];
            }

            result.forEach(resultItem => {
                if (!resultItem.mimeType) { resultItem.mimeType = 'text/plain'; }
            });

            if (result[0]?.resultType === PluginParameterType.PLAN) {
                // Mark step as completed since the plan will be handled by the Agent
                this.status = StepStatus.COMPLETED;
                this.result = result;

                // Save the plan result
                await this.persistenceManager.saveWorkProduct(this, result);

                console.log(`[Step ${this.id}] executeInternalActionVerb: Plan result will be processed by Agent for execution`);
            } else {
                // Map plugin output names to step-defined custom names and persist the mapped result
                await this.finalizeStepExecution(result, allSteps!);
            }
        } catch (error) {
            this.status = StepStatus.ERROR;
            const errorResult = this.createErrorResponse(error instanceof Error ? error.message : String(error), '[Step]Error executing internal step', 'An error occurred during internal step execution. Please check the logs for details.');
            this.result = errorResult;

            await this.logEvent({
                eventType: 'step_result',
                stepId: this.id,
                missionId: this.missionId,
                actionVerb: this.actionVerb,
                status: this.status,
                result: errorResult,
                timestamp: new Date().toISOString()
            });

            await this.persistenceManager.saveWorkProduct(this, errorResult);
        } finally {
            // Restore original values
            (this as any).actionVerb = originalActionVerb;
            this.inputValues = originalInputValues;
            this.outputs = originalOutputs;
        }
    }

    toJSON() {
        return {
            id: this.id,
            missionId: this.missionId,
            actionVerb: this.actionVerb,
            inputReferences: MapSerializer.transformForSerialization(this.inputReferences),
            inputValues: MapSerializer.transformForSerialization(this.inputValues),
            description: this.description,
            dependencies: MapSerializer.transformForSerialization(this.dependencies),
            outputs: MapSerializer.transformForSerialization(this.outputs),
            status: this.status,
            result: this.result,
            recommendedRole: this.recommendedRole,
        };
    }

    public applyModifications(modifications: StepModification): void {
        if (modifications.description !== undefined) {
            this.description = modifications.description;
            this.logEvent({ eventType: 'step_description_updated', stepId: this.id, newDescription: this.description });
        }
        if (modifications.inputValues) {
            this.inputValues = new Map(modifications.inputValues);
            this.logEvent({ eventType: 'step_inputs_replaced', stepId: this.id });
        }
        if (modifications.updateInputs) {
            if (!this.inputValues) this.inputValues = new Map<string, InputValue>();
            modifications.updateInputs.forEach((value, key) => {
                this.inputValues.set(key, value);
            });
            this.logEvent({ eventType: 'step_inputs_updated', stepId: this.id });
        }
        if (modifications.status) {
            this.updateStatus(modifications.status);
        }
        if (modifications.actionVerb) {
            console.warn(`Agent ${this.ownerAgentId}: Step ${this.id} actionVerb changed from ${this.actionVerb} to ${modifications.actionVerb}. This might have execution implications.`);
            (this as any).actionVerb = modifications.actionVerb;
            this.logEvent({ eventType: 'step_actionVerb_updated', stepId: this.id, oldActionVerb: this.actionVerb, newActionVerb: modifications.actionVerb });
        }
        if (modifications.recommendedRole) {
            this.recommendedRole = modifications.recommendedRole;
            this.logEvent({ eventType: 'step_recommendedRole_updated', stepId: this.id, newRecommendedRole: this.recommendedRole });
        }
    }

    /**
     * Resolve placeholders in inputRunValues using both local inputs and step outputs
     */
    private resolvePlaceholdersInInputRunValues(inputRunValues: Map<string, InputValue>, findOutputFromSteps: (outputName: string) => string | null): void {
        for (const [inputName, inputValue] of inputRunValues.entries()) {
            if (typeof inputValue.value === 'string') {
                const resolvedValue = this.resolvePlaceholdersInString(inputValue.value, inputRunValues, findOutputFromSteps);
                if (resolvedValue !== inputValue.value) {
                    console.log(`[Step ${this.id}] Resolved placeholder in ${inputName}: "${inputValue.value}" -> "${resolvedValue}"`);
                    inputValue.value = resolvedValue;
                }
            }
        }
    }

    /**
     * Resolve placeholders in a string using both local inputs and step outputs
     */
    private resolvePlaceholdersInString(text: string, inputRunValues: Map<string, InputValue>, findOutputFromSteps: (outputName: string) => any | null): any {
        const placeholderRegex = /^\{([^\}]+)\}\$/;
        const match = text.match(placeholderRegex);

        if (match) {
            const placeholderName = match[1];
            const localInput = inputRunValues.get(placeholderName);
            if (localInput && localInput.value !== undefined) {
                return localInput.value;
            }
            const resolvedValue = findOutputFromSteps(placeholderName);
            if (resolvedValue !== null) {
                return resolvedValue;
            }
        }

        return text.replace(/\{([^\}]+)\}/g, (match, placeholderName) => {
            const localInput = inputRunValues.get(placeholderName);
            if (localInput && localInput.value !== undefined) {
                if (typeof localInput.value === 'string') {
                    return localInput.value;
                } else {
                    return JSON.stringify(localInput.value);
                }
            }

            const resolvedValue = findOutputFromSteps(placeholderName);
            if (resolvedValue !== null) {
                if (typeof resolvedValue === 'string') {
                    return resolvedValue;
                } else {
                    return JSON.stringify(resolvedValue);
                }
            }

            console.warn(`[Step ${this.id}] Could not resolve placeholder ${match} - not found in local inputs or completed steps`);
            return match;
        });
    }

    /**
     * Maps plugin output names to step-defined custom output names.
     * This ensures that when other steps reference outputs, they can use the custom names.
     */
    async mapPluginOutputsToCustomNames(pluginOutputs: PluginOutput[]): Promise<PluginOutput[]> {
        console.log(`[Step ${this.id}] mapPluginOutputsToCustomNames: this.outputs =`, this.outputs);
        if (!this.outputs || this.outputs.size === 0) {
            // No custom output names defined, return plugin outputs as-is
            return pluginOutputs;
        }

        // For single output plugins, map to the single custom name
        if (pluginOutputs.length === 1 && this.outputs.size === 1) {
            const customName = Array.from(this.outputs.keys())[0];
            const pluginOutput = pluginOutputs[0];

            return [{
                ...pluginOutput,
                name: customName  // Replace plugin name with custom name
            }];
        }

        // For multiple outputs, try to map by position or keep original names
        // This is a more complex case that may need enhancement based on actual usage
        const customNames = Array.from(this.outputs.keys());
        return pluginOutputs.map((output, index) => {
            if (index < customNames.length) {
                return {
                    ...output,
                    name: customNames[index]
                };
            }
            return output; // Keep original name if no custom name available
        });
    }

    /**
     * Check if a specific output is marked as a deliverable
     */
    isOutputDeliverable(outputName: string): boolean {
        if (!this.originalOutputDefinitions) {
            return false;
        }

        const outputDef = this.originalOutputDefinitions.get(outputName);
        return typeof outputDef === 'object' && outputDef !== null && outputDef.isDeliverable === true;
    }

    /**
     * Get the filename for a deliverable output
     */
    getDeliverableFilename(outputName: string): string | undefined {
        if (!this.originalOutputDefinitions) {
            return undefined;
        }

        const outputDef = this.originalOutputDefinitions.get(outputName);
        if (typeof outputDef === 'object' && outputDef !== null) {
            return outputDef.filename;
        }
        return undefined;
    }

    /**
     * Get the original output definition from the plan
     */
    getOriginalOutputDefinition(outputName: string): string | any {
        if (!this.originalOutputDefinitions) {
            return this.outputs.get(outputName) || '';
        }

        return this.originalOutputDefinitions.get(outputName) || this.outputs.get(outputName) || '';
    }

    /**
     * Check if this step has any deliverable outputs
     */
    hasDeliverableOutputs(): boolean {
        if (!this.originalOutputDefinitions) {
            return false;
        }

        for (const [outputName, _] of this.outputs) {
            if (this.isOutputDeliverable(outputName)) {
                return true;
            }
        }
        return false;
    }
}

export function createFromPlan(
    plan: ActionVerbTask[],
    persistenceManager: AgentPersistenceManager,
    parentStep?: Step,
    agentContext?: any
): Step[] {
    type PlanTask = ActionVerbTask & { number?: number; outputs?: Record<string, any>; id?: string; inputs?: Record<string, InputValue>; };
    const planTasks = plan as PlanTask[];

    const newSteps = planTasks.map((task, idx) => {
        const dependencies: StepDependency[] = [];
        const inputReferences = new Map<string, InputReference>();
        const inputValues = new Map<string, InputValue>();

        const missionId = parentStep?.missionId || agentContext?.missionId;
        if (!missionId) {
            throw new Error('Cannot create step from plan without a missionId from parentStep or agentContext');
        }

        const inputSource = (task as any).inputs || {};


        for (const [inputName, inputDefUntyped] of Object.entries(inputSource as Record<string, any>)) {
            if (typeof inputDefUntyped !== 'object' || inputDefUntyped === null) continue;

            // Check for dependency based on the structure of the plan's input definition
            const isDependency = inputDefUntyped.sourceStep !== undefined && inputDefUntyped.outputName !== undefined;

            // NEW: Check for literal-wrapped references
            let isLiteralWrappedReference = false;
            let parsedValue: any = null;
            if (!isDependency && inputDefUntyped.value !== undefined && typeof inputDefUntyped.value === 'string') {
                try {
                    parsedValue = JSON.parse(inputDefUntyped.value);
                    if (parsedValue && typeof parsedValue === 'object' &&
                        parsedValue.outputName !== undefined && parsedValue.sourceStep !== undefined) {
                        isLiteralWrappedReference = true;
                    }
                } catch (e) {
                    // Not a valid JSON string, or not a reference pattern
                }
            }

            if (isDependency || isLiteralWrappedReference) {
                // This is a reference input (either direct or literal-wrapped)
                const referenceDef = isLiteralWrappedReference ? parsedValue : inputDefUntyped;

                const sourceStepId = referenceDef.sourceStep; // Get the UUID directly

                if (sourceStepId) {
                    // Populate inputReferences (using sourceId, and value: undefined for references)
                    inputReferences.set(inputName, {
                        inputName,
                        value: undefined, // Value is not literal for a reference input
                        outputName: referenceDef.outputName,
                        sourceId: sourceStepId, // Use the UUID
                        valueType: referenceDef.valueType || PluginParameterType.ANY, // Use provided type or default
                        args: referenceDef.args || {},
                    });

                    // Populate dependencies
                    dependencies.push({
                        inputName,
                        outputName: referenceDef.outputName,
                        sourceStepId,
                    });
                } else {
                    console.error(`[createFromPlan] 🚨 Unresolved sourceStep ${sourceStepId} for input '${inputName}' in step '${task.actionVerb}'`);
                }
            } else if (inputDefUntyped.value !== undefined) {
                // This is a literal value input
                let valueToSet = inputDefUntyped.value;
                // If valueType is object or json and value is a string, try to parse it
                if ((inputDefUntyped.valueType === PluginParameterType.OBJECT || inputDefUntyped.valueType === PluginParameterType.JSON) && typeof valueToSet === 'string') {
                    try {
                        valueToSet = JSON.parse(valueToSet);
                    } catch (e) {
                        console.warn(`[createFromPlan] Failed to parse JSON string for input '${inputName}'. Passing as string. Error: ${e instanceof Error ? e.message : e}`);
                    }
                }

                inputValues.set(inputName, {
                    inputName,
                    value: valueToSet,
                    valueType: inputDefUntyped.valueType,
                    args: inputDefUntyped.args || {},
                });
            }
        }

        const normalizedOutputs = Step.normalizeOutputs((task as any).outputs);
        
        const step = new Step({
            id: uuidv4(),            
            missionId,
            ownerAgentId: parentStep?.ownerAgentId || '',
            actionVerb: task.actionVerb,
            description: task.description,
            dependencies,
            inputReferences,
            inputValues,
            outputs: normalizedOutputs,
            originalOutputDefinitions: normalizedOutputs,
            recommendedRole: task.recommendedRole,
            persistenceManager
        });
        console.log(`[createFromPlan] 📊 Created step ${step.id} (${task.actionVerb}) with ${dependencies.length} dependencies:`, 
            dependencies.map(d => `${d.inputName} <- ${d.sourceStepId}.${d.outputName}`));
        return step;
    });

    // Post-creation dependency wiring (for placeholders, REFLECT, etc.)
    if (parentStep && newSteps.length > 0) {
        parentStep.outputs.forEach((outputType, outputName) => {
            const producingStep = [...newSteps].reverse().find(s => s.outputs.has(outputName));
            if (producingStep) {
                parentStep.dependencies.push({
                    inputName: outputName,
                    sourceStepId: producingStep.id,
                    outputName: outputName,
                });
                parentStep.inputReferences.set(outputName, {
                    inputName: outputName,
                    outputName: outputName,
                    sourceId: producingStep.id,
                    valueType: outputType as PluginParameterType,
                    args: {},
                });
            }
        });

        if (parentStep.actionVerb === 'ACCOMPLISH' && parentStep.outputs.size === 0) {
            const lastSubStep = newSteps[newSteps.length - 1];
            const completionInputName = `__completion_${lastSubStep.id}`;

            if (!parentStep.dependencies.some(dep => dep.sourceStepId === lastSubStep.id)) {
                parentStep.dependencies.push({
                    inputName: completionInputName,
                    sourceStepId: lastSubStep.id,
                    outputName: 'result'
                });
                parentStep.inputReferences.set(completionInputName, {
                    inputName: completionInputName,
                    outputName: 'result',
                    valueType: PluginParameterType.ANY,
                    args: { isCompletionSignal: true },
                });
            }
        }
    }

    const reflectSteps = newSteps.filter(step => step.actionVerb === 'REFLECT');
    const nonReflectSteps = newSteps.filter(step => step.actionVerb !== 'REFLECT');

    if (reflectSteps.length > 0) {
        reflectSteps.forEach(reflectStep => {
            nonReflectSteps.forEach(otherStep => {
                if (!reflectStep.dependencies.some(d => d.sourceStepId === otherStep.id)) {
                    reflectStep.dependencies.push({
                        inputName: `__dependency_${otherStep.id}`,
                        sourceStepId: otherStep.id,
                        outputName: 'result'
                    });
                }
            });
        });
    }

    newSteps.forEach(step => {
        for (const [inputName, inputRef] of step.inputReferences.entries()) {
            if (inputRef.value && typeof inputRef.value === 'string') {
                const placeholderRegex = /\{([^\}]+)\}/g;
                let match;
                while ((match = placeholderRegex.exec(inputRef.value)) !== null) {
                    const placeholderName = match[1].trim();
                    
                    const producingStep = newSteps.find(s => s.id !== step.id && s.outputs.has(placeholderName));

                    if (producingStep) {
                        const dependencyExists = step.dependencies.some(d => d.sourceStepId === producingStep.id && d.outputName === placeholderName);
                        if (!dependencyExists) {
                            step.dependencies.push({
                                inputName: inputName,
                                sourceStepId: producingStep.id,
                                outputName: placeholderName
                            });
                            console.log(`[createFromPlan] ✅ Added placeholder-based dependency to ${step.actionVerb} step ${step.id}: input '${inputName}' depends on Step ${producingStep.id}'s output '${placeholderName}'`);
                        }
                    }
                }
            }
        }
    });

    return newSteps;
}