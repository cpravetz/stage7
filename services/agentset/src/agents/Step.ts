import { v4 as uuidv4 } from 'uuid';
import { PluginParameterType, PluginOutput, InputReference, InputValue, StepDependency, ActionVerbTask, ExecutionContext as PlanExecutionContext, PlanTemplate, OutputType, PredefinedRoles } from '@cktmcs/shared'; // Added ActionVerbTask and OutputType
import { MapSerializer } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared'; // Ensured MessageType is here, assuming it's separate or also from shared index
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';

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
    readonly stepNo: number;
    readonly actionVerb: string;
    ownerAgentId: string;
    inputReferences: Map<string, InputReference>;
    inputValues: Map<string, InputValue>; 
    description?: string;
    dependencies: StepDependency[];
    outputs: Map<string, string>;
    status: StepStatus;
    result?: PluginOutput[];
    timeout?: number;
    recommendedRole?: string;
    awaitsSignal: string;
    retryCount: number;
    maxRetries: number;
    lastError: any | null;
    errorContext: ErrorContext | null = null;
    private tempData: Map<string, any> = new Map();
    private persistenceManager: AgentPersistenceManager;
    private backoffTime: number = 1000; // Initial backoff time in ms

    constructor(params: {
        id?: string,
        missionId?: string,
        ownerAgentId?: string,
        actionVerb: string,
        stepNo: number,
        inputReferences?: Map<string, InputReference>,
        inputValues?: Map<string, InputValue>,
        description?: string,
        dependencies?: StepDependency[],
        outputs?: Map<string, string>,
        status?: StepStatus,
        result?: PluginOutput[],
        recommendedRole?: string,
        persistenceManager: AgentPersistenceManager,
        maxRetries?: number
    }) {
        console.log(`[Step constructor] params.outputs =`, params.outputs);
        this.id = params.id || uuidv4();
        this.missionId = params.missionId || 'unknown_mission';
        this.ownerAgentId = params.ownerAgentId || 'unknown_agent'; // Default to unknown agent if not provided
        this.stepNo = params.stepNo;
        this.actionVerb = params.actionVerb;
        this.inputReferences = params.inputReferences || new Map();
        this.inputValues = params.inputValues || new Map();
        this.description = params.description;
        this.dependencies = params.dependencies || [];

        // Defensive normalization: ensure outputs is always a Map<string, string>
        try {
            const rawOutputs: any = params.outputs;
            if (!rawOutputs) {
                this.outputs = new Map();
            } else if (rawOutputs instanceof Map) {
                this.outputs = rawOutputs as Map<string, string>;
            } else if (typeof rawOutputs === 'string') {
                // JSON string — try parse; support either object or serialized Map shape
                try {
                    const parsed = JSON.parse(rawOutputs);
                    if (parsed && parsed._type === 'Map' && Array.isArray(parsed.entries)) {
                        this.outputs = new Map(parsed.entries);
                        console.log(`[Step constructor] Deserialized outputs from serialized Map string for step ${this.id}`);
                    } else if (parsed && typeof parsed === 'object') {
                        this.outputs = new Map(Object.entries(parsed));
                        console.log(`[Step constructor] Parsed outputs JSON string into Map for step ${this.id}`);
                    } else {
                        this.outputs = new Map();
                    }
                } catch (e) {
                    console.warn(`[Step constructor] Unable to parse outputs string for step ${this.id}:`, e instanceof Error ? e.message : e);
                    this.outputs = new Map();
                }
            } else if (rawOutputs && rawOutputs._type === 'Map' && Array.isArray(rawOutputs.entries)) {
                this.outputs = new Map(rawOutputs.entries);
                console.log(`[Step constructor] Transformed serialized Map outputs into Map for step ${this.id}`);
            } else if (typeof rawOutputs === 'object') {
                this.outputs = new Map(Object.entries(rawOutputs));
                console.log(`[Step constructor] Converted outputs object into Map for step ${this.id}`);
            } else {
                this.outputs = new Map();
            }
        } catch (e) {
            console.error(`[Step constructor] Error normalizing outputs for step ${this.id}:`, e instanceof Error ? e.message : e);
            this.outputs = new Map();
        }
        this.status = params.status || StepStatus.PENDING;
        if (params.result) {
            this.result = params.result;
        }
        this.recommendedRole = params.recommendedRole;
    this.persistenceManager = params.persistenceManager;
        this.retryCount = 0;
        this.maxRetries = params.maxRetries || 3;
        this.lastError = null;

        // Validate and standardize recommendedRole
        if (this.recommendedRole) {
            const roleKey = Object.keys(PredefinedRoles).find(key => 
                PredefinedRoles[key].id.toLowerCase() === this.recommendedRole!.toLowerCase() || 
                PredefinedRoles[key].name.toLowerCase() === this.recommendedRole!.toLowerCase()
            );

            if (roleKey) {
                this.recommendedRole = PredefinedRoles[roleKey].id;
            } else {
                console.warn(`[Step Constructor] Invalid or unknown recommendedRole: '${this.recommendedRole}'. Setting to undefined.`);
                this.recommendedRole = undefined;
            }
        }

        this.persistenceManager = params.persistenceManager;
        this.awaitsSignal = '';
        // Log step creation event (only if persistenceManager is available)
        if (this.persistenceManager) {
            this.logEvent({
                eventType: 'step_created',
                stepId: this.id,
                missionId: this.missionId,
                stepNo: this.stepNo,
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

            // If sourceStep exists but has no result in-memory, attempt to hydrate from persistence.
            if (sourceStep && (!sourceStep.result || sourceStep.result.length === 0)) {
                try {
                    const parts = String(sourceStep.id).split('_');
                    if (parts.length >= 1) {
                        const possibleAgentId = parts[0];
                        const persisted = await this.persistenceManager.loadWorkProduct(possibleAgentId, sourceStep.id);
                        if (persisted) {
                            const persistedData = (persisted && (persisted.data !== undefined)) ? persisted.data : persisted;
                            try {
                                const transformed = MapSerializer.transformFromSerialization(persistedData) as PluginOutput[];
                                if (Array.isArray(transformed) && transformed.length > 0) {
                                    sourceStep.result = transformed;
                                    console.log(`[Step ${this.id}]   - Hydrated source step ${sourceStep.id} result from persistence. Keys:`, sourceStep.result.map(r => r.name));
                                }
                            } catch (e) {
                                console.warn(`[Step ${this.id}]   - Failed to transform persisted work product for step ${sourceStep.id}:`, e instanceof Error ? e.message : e);
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[Step ${this.id}]   - Error attempting to hydrate source step ${dep.sourceStepId} from persistence:`, e instanceof Error ? e.message : e);
                }
            }

            if (sourceStep?.result) {
                console.log(`[Step ${this.id}]   - Source step ${dep.sourceStepId} result:`, JSON.stringify(sourceStep.result, null, 2));
                console.log(`[Step ${this.id}]   - Looking up dependency '${dep.inputName}' from source step ${dep.sourceStepId}. Source step result keys:`, sourceStep.result.map(r => r.name));
                const output = sourceStep.result.find(r => r.name === dep.outputName);

                if (output && output.result !== undefined && output.result !== null) {
                    console.log(`[Step ${this.id}]   - Populating '${dep.inputName}' from dependency '${dep.sourceStepId}.${dep.outputName}' with value:`, output.result);
                    inputRunValues.set(dep.inputName, {
                        inputName: dep.inputName,
                        value: output.result,
                        valueType: output.resultType,
                        args: {}
                    });
                    continue;
                }

                const successfulOutputs = sourceStep.result.filter(r => r.resultType !== PluginParameterType.ERROR && r.success !== false);
                if (successfulOutputs.length === 1) {
                    const single = successfulOutputs[0];
                    if (single.result !== undefined && single.result !== null) {
                        console.warn(`[Step ${this.id}]   - Dependency '${dep.sourceStepId}.${dep.outputName}' not found or has no result. Falling back to single available output '${single.name}'.`);
                        inputRunValues.set(dep.inputName, {
                            inputName: dep.inputName,
                            value: single.result,
                            valueType: single.resultType,
                            args: { auto_mapped_from: single.name }
                        });
                        try {
                            await this.logEvent({
                                eventType: 'dependency_auto_remap',
                                stepId: this.id,
                                missionId: this.missionId,
                                dependency: `${dep.sourceStepId}.${dep.outputName}`,
                                mappedFrom: single.name,
                                mappedTo: dep.inputName,
                                timestamp: new Date().toISOString()
                            });
                        } catch (e) {
                            console.error('Failed to log dependency_auto_remap event', e instanceof Error ? e.message : e);
                        }
                    } else {
                        console.log(`[Step ${this.id}]   - Dependency '${dep.sourceStepId}.${dep.outputName}' not satisfied. Fallback output has no result.`);
                    }
                } else {
                    console.log(`[Step ${this.id}]   - Dependency '${dep.sourceStepId}.${dep.outputName}' not satisfied. No unique fallback output available.`);
                }
            } else {
                console.log(`[Step ${this.id}]   - Source step '${dep.sourceStepId}' not found or has no result. sourceStep:`, sourceStep);
            }
        }

        // Phase 3: Resolve placeholders.
        console.log(`[Step ${this.id}] Phase 3: Resolving placeholders...`);
        const findOutputFromSteps = (outputName: string): string | null => {
            for (const step of allSteps.slice().reverse()) {
                if (step.status === StepStatus.COMPLETED && step.result) {
                    const output = step.result.find(o => o.name === outputName);
                    if (output && output.result !== undefined && output.result !== null) {
                        if (typeof output.result === 'string') return output.result;
                        return JSON.stringify(output.result);
                    }
                }
            }
            return null;
        };
        this.resolvePlaceholdersInInputRunValues(inputRunValues, findOutputFromSteps);

        // Phase 4: Ensure missionId is always present.
        if (!inputRunValues.has('missionId')) {
            inputRunValues.set('missionId', {
                inputName: 'missionId',
                value: missionId,
                valueType: PluginParameterType.STRING,
                args: {}
            });
        }

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
            const outputExists = sourceStep.result?.some(r => r.name === dep.outputName);
            if (!outputExists) {
                // Fallback: if the source step produced exactly one successful output, we'll consider the dependency satisfied
                const successfulOutputs = sourceStep.result?.filter(r => r.resultType !== PluginParameterType.ERROR && r.success !== false) || [];
                if (successfulOutputs.length === 1) {
                    console.warn(`[areDependenciesSatisfied] Step ${this.id} dependency '${dep.outputName}' missing from ${sourceStep.id}, but source has single output '${successfulOutputs[0].name}'. Treating as satisfied (will auto-map).`);
                    return true;
                }
                console.warn(`[areDependenciesSatisfied] Step ${this.id} dependency on output '${dep.outputName}' from step ${sourceStep.id} is not met because the output is not in the result.`);
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
    
        // Validation: Check for a valid iterable instead of just an array
        if (!arrayInput || !arrayInput.value || typeof arrayInput.value[Symbol.iterator] !== 'function') {
            return [{
                success: false, name: 'error', resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in FOREACH step: "array" input is missing or not an iterable.',
                result: null,
                error: 'FOREACH requires an "array" input that is iterable (e.g., an array, a map, a set).'
            }];
        }
    
        if (!stepsInput || !Array.isArray(stepsInput.value)) {
            return [{
                success: false, name: 'error', resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in FOREACH step: "steps" input is missing or not a plan (array of tasks).',
                result: null,
                error: 'FOREACH requires a "steps" input of type plan.'
            }];
        }
    
        // Convert any iterable to an array to allow for indexing and length properties
        const inputArray: any[] = Array.from(arrayInput.value);
        const subPlanTemplate: ActionVerbTask[] = stepsInput.value;
    
        if (inputArray.length === 0) {
            return [{
                success: true, name: 'loop_skipped', resultType: PluginParameterType.STRING,
                resultDescription: 'FOREACH loop skipped as input iterable was empty.',
                result: 'Empty iterable, no iterations.'
            }];
        }
    
        const allGeneratedSteps: ActionVerbTask[] = [];
    
        for (let i = 0; i < inputArray.length; i++) {
            const item = inputArray[i];
            // Deep copy the sub-plan template for each iteration
            const itemSteps: ActionVerbTask[] = JSON.parse(JSON.stringify(subPlanTemplate));
    
            itemSteps.forEach(task => {
                // Update description for context
                task.description = `(Item ${i + 1}/${inputArray.length}) ${task.description || ''}`;
    
                const inputs = (task as any).inputs || {};
                let inputModified = false;
    
                for (const inputName in inputs) {
                    const inputDef = inputs[inputName];
                    // Check if this input is the one that depends on the loop item
                    if (inputDef.outputName === 'item') {
                        console.log(`[handleForeach] Modifying input '${inputName}' in task '${task.actionVerb}'. Replacing 'item' dependency with actual value.`);
                        
                        // Replace dependency with direct value
                        inputDef.value = item;
                        // Infer valueType from the item
                        if (typeof item === 'string') {
                            inputDef.valueType = PluginParameterType.STRING;
                        } else if (typeof item === 'number') {
                            inputDef.valueType = PluginParameterType.NUMBER;
                        } else if (typeof item === 'boolean') {
                            inputDef.valueType = PluginParameterType.BOOLEAN;
                        } else if (Array.isArray(item)) {
                            inputDef.valueType = PluginParameterType.ARRAY;
                        } else if (typeof item === 'object' && item !== null) {
                            inputDef.valueType = PluginParameterType.OBJECT;
                        } else {
                            inputDef.valueType = PluginParameterType.ANY;
                        }
                        
                        // Remove the properties that defined it as a dependency
                        delete inputDef.outputName;
                        delete inputDef.sourceStep;
                        inputModified = true;
                    }
                }
    
                if (!inputModified) {
                    console.warn(`[handleForeach] Task '${task.actionVerb}' in sub-plan did not have an input depending on 'item'. The loop item was not injected.`);
                }
            });
    
            allGeneratedSteps.push(...itemSteps);
        }
    
        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: `[Step] FOREACH generated ${allGeneratedSteps.length} steps.`,
            result: allGeneratedSteps
        }];
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
                this.status = StepStatus.SUB_PLAN_RUNNING;
                this.result = result;
            } else {
                // Map plugin output names to step-defined custom names
                this.result = await this.mapPluginOutputsToCustomNames(result);
                await this.persistenceManager.saveWorkProduct({
                    agentId: this.id.split('_')[0], stepId: this.id,
                    data: this.result
                });
                this.status = StepStatus.COMPLETED;

                console.log(`[Step ${this.id}] execute: Mapped plugin outputs to step.result:`, this.result?.map(r => ({ name: r.name, resultType: r.resultType })));

                await this.logEvent({
                    eventType: 'step_result',
                    stepId: this.id,
                    missionId: this.missionId,
                    stepNo: this.stepNo,
                    actionVerb: this.actionVerb,
                    status: this.status,
                    result: this.result,
                    dependencies: this.dependencies,
                    timestamp: new Date().toISOString()
                });

            }
            return this.result;
        } catch (error) {
            this.status = StepStatus.ERROR;
            const errorResult = [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error executing step',
                result: error instanceof Error ? error.message : String(error),
                error: error instanceof Error ? error.message : String(error)
            }];
            this.result = errorResult;

            await this.logEvent({
                eventType: 'step_result',
                stepId: this.id,
                missionId: this.missionId,
                stepNo: this.stepNo,
                actionVerb: this.actionVerb,
                status: this.status,
                result: errorResult,
                timestamp: new Date().toISOString()
            });

            await this.persistenceManager.saveWorkProduct({
                agentId: this.id.split('_')[0],
                stepId: this.id,
                data: errorResult
            });

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
            const newSteps = createFromPlan(stepsToExecute, this.stepNo + 1, this.persistenceManager, this);
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
        const stepsInput = this.inputValues.get('steps');

        if (!stepsInput) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in REPEAT step',
                result: null,
                error: 'Missing required input: steps'
            }];
        }

        let steps: ActionVerbTask[];

        if (typeof stepsInput.value === 'string') {
            try {
                steps = JSON.parse(stepsInput.value);
            } catch (e) {
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: '[Step]Error in REPEAT step: Invalid JSON format for steps',
                    result: `steps.forEach is not a function`,
                    error: `steps.forEach is not a function`
                }];
            }
        } else if (Array.isArray(stepsInput.value)) {
            steps = stepsInput.value as ActionVerbTask[];
        } else {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in REPEAT step: steps must be an array or JSON string',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }

        if (!Array.isArray(steps)) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in REPEAT step: steps must be an array',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }
        const newSteps: Step[] = [];

        for (let i = 0; i < count; i++) {
            const iterationSteps = createFromPlan(steps, this.stepNo + 1 + (i * steps.length), this.persistenceManager, this);
            newSteps.push(...iterationSteps);
        }

        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: '[Step]New steps created from repeat',
            result: newSteps
        }];
    }

    private async handleTimeout(): Promise<PluginOutput[]> {
        const timeoutMs = this.inputValues.get('timeout')?.value as number;
        const stepsInput = this.inputValues.get('steps');

        if (!stepsInput) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in TIMEOUT step',
                result: null,
                error: 'Missing required input: steps'
            }];
        }

        let steps: ActionVerbTask[];

        if (typeof stepsInput.value === 'string') {
            try {
                steps = JSON.parse(stepsInput.value);
            } catch (e) {
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: '[Step]Error in TIMEOUT step: Invalid JSON format for steps',
                    result: `steps.forEach is not a function`,
                    error: `steps.forEach is not a function`
                }];
            }
        } else if (Array.isArray(stepsInput.value)) {
            steps = stepsInput.value as ActionVerbTask[];
        } else {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in TIMEOUT step: steps must be an array or JSON string',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }

        if (!Array.isArray(steps)) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in TIMEOUT step: steps must be an array',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }
        const newSteps = createFromPlan(steps, this.stepNo + 1, this.persistenceManager, this);

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
    }

    private async handleWhile(): Promise<PluginOutput[]> {
        const conditionInput = this.inputValues.get('condition');
        const stepsInput = this.inputValues.get('steps');
        const maxIterations = 100;

        if (!conditionInput || !stepsInput) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in WHILE step',
                result: null,
                error: 'Missing required inputs: condition and steps are required'
            }];
        }

        let steps: ActionVerbTask[];

        if (typeof stepsInput.value === 'string') {
            try {
                steps = JSON.parse(stepsInput.value);
            } catch (e) {
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: '[Step]Error in WHILE step: Invalid JSON format for steps',
                    result: `steps.forEach is not a function`,
                    error: `steps.forEach is not a function`
                }];
            }
        } else if (Array.isArray(stepsInput.value)) {
            steps = stepsInput.value as ActionVerbTask[];
        } else {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in WHILE step: steps must be an array or JSON string',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }

        if (!Array.isArray(steps)) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in WHILE step: steps must be an array',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }
        const condition = conditionInput.value;

        let currentIteration = 0;
        const newSteps: Step[] = [];

        const checkStep = new Step({
            actionVerb: 'THINK',
            missionId: this.missionId,
            ownerAgentId: this.ownerAgentId,
            stepNo: this.stepNo + 2 + steps.length,
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

        const iterationSteps = createFromPlan(steps, this.stepNo + 2, this.persistenceManager, this);

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
            stepNo: this.stepNo + 2 + steps.length,
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

    private async handleUntil(): Promise<PluginOutput[]> {
        const conditionInput = this.inputValues.get('condition');
        const stepsInput = this.inputValues.get('steps');

        if (!conditionInput || !stepsInput) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in UNTIL step',
                result: null,
                error: 'Missing required inputs: condition and steps are required'
            }];
        }

        let steps: ActionVerbTask[];

        if (typeof stepsInput.value === 'string') {
            try {
                steps = JSON.parse(stepsInput.value);
            } catch (e) {
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: '[Step]Error in UNTIL step: Invalid JSON format for steps',
                    result: `steps.forEach is not a function`,
                    error: `steps.forEach is not a function`
                }];
            }
        } else if (Array.isArray(stepsInput.value)) {
            steps = stepsInput.value as ActionVerbTask[];
        } else {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in UNTIL step: steps must be an array or JSON string',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }

        if (!Array.isArray(steps)) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in UNTIL step: steps must be an array',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }
        const condition = conditionInput.value;

        const newSteps: Step[] = [];

        const iterationSteps = createFromPlan(steps, this.stepNo + 1, this.persistenceManager, this);
        newSteps.push(...iterationSteps);

        const checkStep = new Step({
            actionVerb: 'THINK',
            missionId: this.missionId,
            ownerAgentId: this.ownerAgentId,
            stepNo: this.stepNo + 1 + steps.length,
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
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Missing goal/task for delegation',
                result: null,
                error: 'Goal, task, or description input is required for DELEGATE action'
            }];
        }

        const accomplishStep = new Step({
            actionVerb: 'ACCOMPLISH',
            missionId: this.missionId,
            ownerAgentId: this.ownerAgentId,
            stepNo: this.stepNo,
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
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Failed to generate plan for delegation',
                result: null,
                error: accomplishResult?.[0]?.error || 'Unknown error in delegation planning'
            }];
        }
    }

    private async handleSequence(): Promise<PluginOutput[]> {
        const stepsInput = this.inputValues.get('steps');

        if (!stepsInput) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in SEQUENCE step',
                result: 'Missing required input: steps',
                error: 'Missing required input: steps'
            }];
        }

        let steps: ActionVerbTask[];

        // Handle different input types
        if (typeof stepsInput.value === 'string') {
            try {
                // Try to parse as JSON
                steps = JSON.parse(stepsInput.value);
            } catch (e) {
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: '[Step]Error in SEQUENCE step: Invalid JSON format for steps',
                    result: `steps.forEach is not a function`,
                    error: `steps.forEach is not a function`
                }];
            }
        } else if (Array.isArray(stepsInput.value)) {
            steps = stepsInput.value as ActionVerbTask[];
        } else {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in SEQUENCE step: steps must be an array or JSON string',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }

        if (!Array.isArray(steps)) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in SEQUENCE step: steps must be an array',
                result: `steps.forEach is not a function`,
                error: `steps.forEach is not a function`
            }];
        }

        const newSteps: Step[] = [];
        let previousStepId: string | undefined;

        steps.forEach((task, index) => {
            const newStep = new Step({
                actionVerb: task.actionVerb,
                missionId: this.missionId,
                ownerAgentId: this.ownerAgentId,
                stepNo: this.stepNo + 1 + index,
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
                this.status = StepStatus.SUB_PLAN_RUNNING;
                this.result = result;
            } else {
                // Map plugin output names to step-defined custom names and persist the mapped result
                this.result = await this.mapPluginOutputsToCustomNames(result);
                await this.persistenceManager.saveWorkProduct({
                    agentId: this.id.split('_')[0],
                    stepId: this.id,
                    data: this.result
                });
                this.status = StepStatus.COMPLETED;

                await this.logEvent({
                    eventType: 'step_result',
                    stepId: this.id,
                    missionId: this.missionId,
                    stepNo: this.stepNo,
                    actionVerb: this.actionVerb,
                    status: this.status,
                    result: this.result,
                    dependencies: this.dependencies,
                    timestamp: new Date().toISOString()
                });

            }
        } catch (error) {
            this.status = StepStatus.ERROR;
            const errorResult = [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error executing internal step',
                result: error instanceof Error ? error.message : String(error),
                error: error instanceof Error ? error.message : String(error)
            }];
            this.result = errorResult;

            await this.logEvent({
                eventType: 'step_result',
                stepId: this.id,
                missionId: this.missionId,
                stepNo: this.stepNo,
                actionVerb: this.actionVerb,
                status: this.status,
                result: errorResult,
                timestamp: new Date().toISOString()
            });

            await this.persistenceManager.saveWorkProduct({
                agentId: this.id.split('_')[0],
                stepId: this.id,
                data: errorResult
            });
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
            stepNo: this.stepNo,
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
            console.warn(`Agent ${this.id.split('_')[0]}: Step ${this.id} actionVerb changed from ${this.actionVerb} to ${modifications.actionVerb}. This might have execution implications.`);
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
    private resolvePlaceholdersInString(text: string, inputRunValues: Map<string, InputValue>, findOutputFromSteps: (outputName: string) => string | null): string {
        // Find all placeholders in the format {placeholderName}
        const placeholderRegex = /\{([^\}]+)\}/g;
        let resolvedText = text;
        let match;

        while ((match = placeholderRegex.exec(text)) !== null) {
            const placeholderName = match[1];
            const fullPlaceholder = match[0]; // e.g., "{userPersonas}"
            let resolvedValue: string | null = null;

            // First, try to resolve from other inputs in the same step
            const localInput = inputRunValues.get(placeholderName);
            if (localInput && localInput.value !== undefined) {
                if (typeof localInput.value === 'string') {
                    resolvedValue = localInput.value;
                } else if (typeof localInput.value === 'object') {
                    resolvedValue = JSON.stringify(localInput.value, null, 2);
                } else {
                    resolvedValue = String(localInput.value);
                }
                console.log(`[Step ${this.id}] Resolved placeholder ${fullPlaceholder} from local input`);
            } else {
                // If not found locally, try to resolve from completed steps
                resolvedValue = findOutputFromSteps(placeholderName);
                if (resolvedValue !== null) {
                    console.log(`[Step ${this.id}] Resolved placeholder ${fullPlaceholder} from completed step`);
                } else {
                    console.warn(`[Step ${this.id}] Could not resolve placeholder ${fullPlaceholder} - not found in local inputs or completed steps`);
                }
            }

            if (resolvedValue !== null) {
                resolvedText = resolvedText.replace(fullPlaceholder, resolvedValue);
            }
        }

        return resolvedText;
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
}

export function createFromPlan(
    plan: ActionVerbTask[],
    startingStepNo: number,
    persistenceManager: AgentPersistenceManager,
    parentStep?: Step,
    agentContext?: any
): Step[] {
    type PlanTask = ActionVerbTask & { number?: number; outputs?: Record<string, any>; id?: string; };
    const planTasks = plan as PlanTask[];
    const stepNumberToUUID: Record<number, string> = {};

    planTasks.forEach((task, idx) => {
        const uuid = uuidv4();
        task.id = uuid;
        const stepNum = task.number || idx + 1;
        stepNumberToUUID[stepNum] = uuid;
    });

    const newSteps = planTasks.map((task, idx) => {
        const dependencies: StepDependency[] = [];
        const inputReferences = new Map<string, InputReference>();
        const inputValues = new Map<string, InputValue>();

        const missionId = parentStep?.missionId || agentContext?.missionId;
        if (!missionId) {
            throw new Error('Cannot create step from plan without a missionId from parentStep or agentContext');
        }

        let inputSource = (task as any).inputs || task.inputReferences;

        // FIX: Check if inputSource is a serialized map and deserialize it before processing.
        if (inputSource && inputSource._type === 'Map' && Array.isArray(inputSource.entries)) {
            try {
                inputSource = Object.fromEntries(inputSource.entries);
            } catch (e) {
                console.error(`[createFromPlan] Failed to deserialize nested input map for task \'${task.actionVerb}\'. Inputs may be incorrect.`, e);
            }
        }

        if (inputSource) {
            for (const [inputName, inputDef] of Object.entries(inputSource as Record<string, any>)) {
                if (typeof inputDef !== 'object' || inputDef === null) {
                    console.warn(`[createFromPlan] Skipping invalid input definition for \'${inputName}\' in task \'${task.actionVerb}\'.`);
                    continue;
                }

                const hasValue = inputDef.value !== undefined && inputDef.value !== null;
                const hasOutputName = inputDef.outputName !== undefined && inputDef.outputName !== null && inputDef.outputName !== '';
                const hasSourceStep = inputDef.sourceStep !== undefined && inputDef.sourceStep !== null;

                if (inputName === 'missionId') {
                    inputValues.set(inputName, {
                        inputName: inputName,
                        value: missionId,
                        valueType: PluginParameterType.STRING,
                        args: {},
                    });
                } else if (hasValue) {
                    let value = inputDef.value;
                    if (typeof value === 'object' && value !== null) {
                        value = JSON.stringify(value);
                    }
                    inputValues.set(inputName, {
                        inputName: inputName,
                        value: value,
                        valueType: inputDef.valueType,
                        args: inputDef.args,
                    });
                } else if (hasOutputName && hasSourceStep) {
                    console.log(`[createFromPlan] 🔗 Creating dependency: ${inputName} <- step ${inputDef.sourceStep}.${inputDef.outputName} for task \'${task.actionVerb}\'`);

                    if (inputDef.sourceStep === 0) {
                        let resolvedValue: any;
                        let resolvedValueType: PluginParameterType = inputDef.valueType;

                        if (parentStep && parentStep.inputValues.has(inputDef.outputName)) {
                            const parentInputValue = parentStep.inputValues.get(inputDef.outputName);
                            resolvedValue = parentInputValue?.value;
                            resolvedValueType = parentInputValue?.valueType || inputDef.valueType;
                        }
                        else if (agentContext && agentContext[inputDef.outputName]) {
                            resolvedValue = agentContext[inputDef.outputName];
                        }

                        if (resolvedValue !== undefined) {
                            inputValues.set(inputName, {
                                inputName: inputName,
                                value: resolvedValue,
                                valueType: resolvedValueType,
                                args: {}
                            });
                        } else {
                            if (parentStep) {
                                dependencies.push({
                                    outputName: inputDef.outputName,
                                    sourceStepId: parentStep.id,
                                    inputName: inputName
                                });
                                console.log(`[createFromPlan] ✅ Added dependency to parent step: ${inputName} <- ${parentStep.id}.${inputDef.outputName}`);
                            } else {
                                console.error(`[createFromPlan] 🚨 Unresolved sourceStep 0: Input \'${inputDef.outputName}\' not found for step \'${task.actionVerb}\'.`);
                            }
                        }
                    } else {
                        const sourceStepId = stepNumberToUUID[inputDef.sourceStep];
                        if (sourceStepId) {
                            dependencies.push({
                                outputName: inputDef.outputName,
                                sourceStepId,
                                inputName: inputName
                            });
                            console.log(`[createFromPlan] ✅ Added dependency: ${inputName} <- ${sourceStepId}.${inputDef.outputName} (step ${inputDef.sourceStep})`);
                        } else {
                            console.error(`[createFromPlan] 🚨 Unresolved sourceStep ${inputDef.sourceStep} for input \'${inputName}\' in step \'${task.actionVerb}\'`);
                            console.error(`[createFromPlan] Available step numbers:`, Object.keys(stepNumberToUUID));
                        }
                    }
                } else {
                    console.error(`[createFromPlan] 🚨 MALFORMED INPUT DETECTED: \'${inputName}\' in step \'${task.actionVerb}\' (step ${idx + 1})`);
                    console.error(`[createFromPlan] Input definition:`, JSON.stringify(inputDef, null, 2));
                }

                const reference: InputReference = {
                    inputName: inputName,
                    value: inputDef.value,
                    outputName: inputDef.outputName,
                    valueType: inputDef.valueType,
                    args: inputDef.args,
                };
                inputReferences.set(inputName, reference);
            }
        }

        if (parentStep) {
            const subPlanInputNames = new Set(dependencies.map(d => d.inputName));
            parentStep.dependencies.forEach(parentDep => {
                if (!subPlanInputNames.has(parentDep.inputName)) {
                    dependencies.push(parentDep);
                }
            });
        }

        if (task.actionVerb === 'EXECUTE') {
            task.actionVerb = 'ACCOMPLISH';
        }
        if (task.actionVerb === 'LLM') {
            task.actionVerb = 'THINK';
        }

        if (!task.actionVerb) {
        console.log('Step Line 1018 - Missing required property "actionVerb" in task', task);
        throw new Error(`Missing required property \'actionVerb\' in agent config`);
    }

        // Normalize task.outputs into a Map<string, string> so custom output names
        // (e.g. 'poem') survive transport/serialization formats. Support three common
        // shapes that can arrive from persistence or remote planner components:
        // 1) already a plain object: { poem: 'desc' }
        // 2) serialized Map shape: { _type: 'Map', entries: [[key, value], ...] }
        // 3) a JSON string representing either of the above
        let normalizedOutputs: Map<string, string> | undefined = undefined;
        try {
            const rawOutputs = (task as any).outputs;
            if (!rawOutputs) {
                normalizedOutputs = undefined;
            } else if (rawOutputs instanceof Map) {
                normalizedOutputs = rawOutputs as Map<string, string>;
            } else if (typeof rawOutputs === 'string') {
                // JSON string; try to parse
                try {
                    const parsed = JSON.parse(rawOutputs);
                    if (parsed && parsed._type === 'Map' && Array.isArray(parsed.entries)) {
                        normalizedOutputs = new Map(parsed.entries);
                    } else if (parsed && typeof parsed === 'object') {
                        normalizedOutputs = new Map(Object.entries(parsed));
                    }
                } catch (e) {
                    console.warn(`[createFromPlan] Unable to parse string outputs for task ${task.actionVerb}:`, e instanceof Error ? e.message : e);
                }
            } else if (rawOutputs && rawOutputs._type === 'Map' && Array.isArray(rawOutputs.entries)) {
                normalizedOutputs = new Map(rawOutputs.entries);
            } else if (typeof rawOutputs === 'object') {
                normalizedOutputs = new Map(Object.entries(rawOutputs));
            }
        } catch (e) {
            console.error('[createFromPlan] Error normalizing task.outputs:', e instanceof Error ? e.message : e);
        }

        const step = new Step({
            id: task.id!,
            missionId: missionId,
            ownerAgentId: parentStep?.ownerAgentId ||'',
            actionVerb: task.actionVerb,
            stepNo: startingStepNo + idx,
            description: task.description,
            dependencies: dependencies,
            inputReferences: inputReferences,
            inputValues: inputValues,
            outputs: normalizedOutputs || (task.outputs ? new Map(Object.entries(task.outputs)) : undefined),
            recommendedRole: task.recommendedRole,
            persistenceManager: persistenceManager
        });

        console.log(`[createFromPlan] 📊 Created step ${step.stepNo} (${task.actionVerb}) with ${dependencies.length} dependencies:`,
            dependencies.map(d => `${d.inputName} <- ${d.sourceStepId}.${d.outputName}`));
        return step;
    });

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
                    
                    // Find the step that produces this output
                    const producingStep = newSteps.find(s => s.id !== step.id && s.outputs.has(placeholderName));

                    if (producingStep) {
                        const dependencyExists = step.dependencies.some(d => d.sourceStepId === producingStep.id && d.outputName === placeholderName);
                        if (!dependencyExists) {
                            step.dependencies.push({
                                inputName: inputName, // The input that uses the placeholder
                                sourceStepId: producingStep.id,
                                outputName: placeholderName
                            });
                            console.log(`[createFromPlan] ✅ Added placeholder-based dependency to ${step.actionVerb} step ${step.stepNo}: input '${inputName}' depends on Step ${producingStep.stepNo}'s output '${placeholderName}'`);
                        }
                    }
                }
            }
        }
    });

    return newSteps;
}
