import { v4 as uuidv4 } from 'uuid';
import { PluginParameterType,
    PluginOutput,
    InputReference,
    InputValue,
    StepDependency,
    ActionVerbTask,
    ExecutionContext as PlanExecutionContext,
    PlanTemplate } from '@cktmcs/shared'; // Added ActionVerbTask
import { MapSerializer } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared'; // Ensured MessageType is here, assuming it's separate or also from shared index
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';


export enum StepStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    ERROR = 'error',
    PAUSED = 'paused' // Assuming PAUSED is a valid status based on other discussions
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

export class Step {
    readonly id: string;
    readonly stepNo: number;
    readonly actionVerb: string;
    inputReferences: Map<string, InputReference>;
    inputValues: Map<string, InputValue>; 
    description?: string;
    dependencies: StepDependency[];
    status: StepStatus;
    result?: PluginOutput[];
    timeout?: number;
    recommendedRole?: string;
    awaitsSignal: string;
    private tempData: Map<string, any> = new Map();
    private persistenceManager: AgentPersistenceManager;

    constructor(params: {
        id?: string,
        actionVerb: string,
        stepNo: number,
        inputReferences?: Map<string, InputReference>,
        inputValues?: Map<string, InputValue>,
        description?: string,
        dependencies?: StepDependency[],
        status?: StepStatus,
        recommendedRole?: string,
        persistenceManager: AgentPersistenceManager
    }) {
        this.id = params.id || uuidv4();
        this.stepNo = params.stepNo;
        this.actionVerb = params.actionVerb;
        this.inputReferences = params.inputReferences || new Map();
        this.inputValues = params.inputValues || new Map();
        this.description = params.description;
        this.dependencies = params.dependencies || [];
        this.status = params.status || StepStatus.PENDING;
        this.recommendedRole = params.recommendedRole;
        this.persistenceManager = params.persistenceManager;
        this.awaitsSignal = '';
        // Log step creation event
        this.logEvent({
            eventType: 'step_created',
            stepId: this.id,
            stepNo: this.stepNo,
            actionVerb: this.actionVerb,
            //inputs: MapSerializer.transformForSerialization(this.inputs),
            inputReferences: MapSerializer.transformForSerialization(this.inputReferences),
            dependencies: MapSerializer.transformForSerialization(this.dependencies),
            status: this.status,
            description: this.description,
            recommendedRole: this.recommendedRole,
            timestamp: new Date().toISOString()
        });
    }

    async logEvent(event: any): Promise<void> {
        if (!event) {
            console.error('Step logEvent called with empty event');
            return;
        }
        try {
            await this.persistenceManager.logEvent(event);
        } catch (error) {
            console.error('Step logEvent error:', error instanceof Error ? error.message : error);
        }
    }

    populateInputsFromDependencies(allSteps: Step[]): void {
        this.inputReferences.forEach((inputReference, name) => {
            if (inputReference.value) {
                this.inputValues.set(inputReference.inputName, {
                    inputName: inputReference.inputName,
                    value: inputReference.value,
                    valueType: inputReference.valueType,
                    args: inputReference.args || {}
                });
            }
        });
        this.dependencies.forEach(dep => {
            const sourceStep = allSteps.find(s => s.id === dep.sourceStepId);
            if (sourceStep?.result) {
                const outputValue = sourceStep.result.find(r => r.name === dep.outputName)?.result;
                if (outputValue !== undefined) {
                    this.inputValues.set(dep.outputName, {
                        inputName: dep.outputName,
                        value: outputValue,
                        valueType: PluginParameterType.STRING, // Assuming STRING, adjust as necessary
                        args: {}
                    });
                }
            }
        });
    }

    areDependenciesSatisfied(allSteps: Step[]): boolean {
        // Check if all dependencies have a sourceStepId that exists in allSteps and that source step is completed
        return this.dependencies.every(dep => {
            if (!dep.sourceStepId) {
                // If dependency has no sourceStepId, consider it unsatisfied
                return true;
            }
            const sourceStep = allSteps.find(s => s.id === dep.sourceStepId);
            return sourceStep !== undefined && sourceStep.status === StepStatus.COMPLETED;
        });
    }

    /**
     * Determines if this step is an endpoint (no other steps depend on it)
     * @param allSteps All steps in the current process
     * @returns Boolean indicating if this is an endpoint step
     */
    isEndpoint(allSteps: Step[]): boolean {
        const dependents = allSteps.filter(s =>
            s.dependencies.some(dep => dep.sourceStepId === this.id)
        );
        return dependents.length === 0;
    }

    private async handleForeach(): Promise<PluginOutput[]> {
        const arrayInput = this.inputValues.get('array');
        const stepsInput = this.inputValues.get('steps');

        if (!arrayInput || !Array.isArray(arrayInput.value)) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in FOREACH step: "array" input is missing or not an array.',
                result: null,
                error: 'FOREACH requires an "array" input of type array.'
            }];
        }

        if (!stepsInput || !Array.isArray(stepsInput.value)) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in FOREACH step: "steps" input is missing or not a plan (array of tasks).',
                result: null,
                error: 'FOREACH requires a "steps" input of type plan.'
            }];
        }

        const inputArray: any[] = arrayInput.value;
        const subPlanTemplate: ActionVerbTask[] = stepsInput.value;
        const allGeneratedSteps: ActionVerbTask[] = [];

        if (inputArray.length === 0) {
            return [{
                success: true,
                name: 'loop_skipped',
                resultType: PluginParameterType.STRING,
                resultDescription: 'FOREACH loop skipped as input array was empty.',
                result: 'Empty array, no iterations.'
            }];
        }

        for (let i = 0; i < inputArray.length; i++) {
            const item = inputArray[i];
            const itemSteps: ActionVerbTask[] = JSON.parse(JSON.stringify(subPlanTemplate));

            itemSteps.forEach(task => {
                if (!task.inputReferences) {
                    task.inputReferences = new Map<string, InputReference>();
                }
                task.description = `(Item ${i + 1}/${inputArray.length}: ${JSON.stringify(item)}) ${task.description || ''}`;
                task.inputReferences.set('loopItem', {
                    inputName: 'loopItem',
                    value: item,
                    valueType: PluginParameterType.ANY,
                    args: { fromForeach: true }
                });
                task.inputReferences.set('loopIndex', {
                    inputName: 'loopIndex',
                    value: i,
                    valueType: PluginParameterType.NUMBER,
                    args: { fromForeach: true }
                });
            });
            allGeneratedSteps.push(...itemSteps);
        }

        if (allGeneratedSteps.length > 0) {
            return [{
                success: true,
                name: 'steps',
                resultType: PluginParameterType.PLAN,
                resultDescription: `[Step] FOREACH generated ${allGeneratedSteps.length} steps.`,
                result: allGeneratedSteps
            }];
        } else {
            return [{
                success: true,
                name: 'no_steps_generated',
                resultType: PluginParameterType.STRING,
                resultDescription: 'FOREACH loop completed without generating steps (e.g. empty input array).',
                result: 'No steps generated.'
            }];
        }
    }

    async execute(
        executeAction: (step: Step) => Promise<PluginOutput[]>,
        thinkAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        delegateAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        askAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>
    ): Promise<PluginOutput[]> {
        this.status = StepStatus.RUNNING;
        try {
            let result: PluginOutput[];
            switch (this.actionVerb) {
                case 'THINK':
                    result = await thinkAction(this.inputValues);
                    break;
                case 'DELEGATE':
                    result = await delegateAction(this.inputValues);
                    break;
                case 'ASK':
                case MessageType.REQUEST:
                    result = await askAction(this.inputValues);
                    break;
                case 'DECIDE':
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
                case 'EXECUTE_PLAN_TEMPLATE':
                    result = await this.handleExecutePlanTemplate(executeAction);
                    break;
                case 'FOREACH':
                    result = await this.handleForeach();
                    break;
                default:
                    result = await executeAction(this);
            }

            // Ensure result is always an array of PluginOutput
            if (!Array.isArray(result)) {
                result = [result];
            }

            result.forEach(resultItem => {
                if (!resultItem.mimeType) { resultItem.mimeType = 'text/plain'; }
            });

            this.status = StepStatus.COMPLETED;

            // Log step result event
            await this.logEvent({
                eventType: 'step_result',
                stepId: this.id,
                stepNo: this.stepNo,
                actionVerb: this.actionVerb,
                status: this.status,
                result: result,
                timestamp: new Date().toISOString()
            });

            await this.persistenceManager.saveWorkProduct({
                agentId: this.id.split('_')[0], // Assuming the step ID is in the format 'agentId_stepId'
                stepId: this.id,
                data: result
            });
            return result;
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

            await this.logEvent({
                eventType: 'step_result',
                stepId: this.id,
                stepNo: this.stepNo,
                actionVerb: this.actionVerb,
                status: this.status,
                result: errorResult,
                timestamp: new Date().toISOString()
            });

            // Push error output to Librarian
            await this.persistenceManager.saveWorkProduct({
                agentId: this.id.split('_')[0],
                stepId: this.id,
                data: errorResult
            });

            return errorResult;
        }
    }

    /**
     * Updates the step's status
     * @param newStatus New status for the step
     * @param result Optional result of the step
     */
    private updateStatus(status: StepStatus, result?: PluginOutput[]): void {
        this.status = status;
        if (result) {
            this.result = result;
        }
        // Log step status change event
        this.logEvent({
            eventType: 'step_status_changed',
            stepId: this.id,
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
            const newSteps = createFromPlan(stepsToExecute, this.stepNo + 1, this.persistenceManager);
            // Add these steps to the agent's step queue
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
        const steps = this.inputValues.get('steps')?.value as ActionVerbTask[];
        const newSteps: Step[] = [];

        for (let i = 0; i < count; i++) {
            const iterationSteps = createFromPlan(steps, this.stepNo + 1 + (i * steps.length), this.persistenceManager);
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
        const steps = this.inputValues.get('steps')?.value as ActionVerbTask[];
        const newSteps = createFromPlan(steps, this.stepNo + 1, this.persistenceManager);

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
        const maxIterations = 100; // Safety limit

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

        const steps = stepsInput.value as ActionVerbTask[];
        const condition = conditionInput.value;

        let currentIteration = 0;
        const newSteps: Step[] = [];

        // Initial condition check step
        const checkStep = new Step({
            actionVerb: 'THINK',
            stepNo: this.stepNo + 1,
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

        // Create steps for first potential iteration
        const iterationSteps = createFromPlan(steps, this.stepNo + 2, this.persistenceManager);

        // Add dependency on condition check for all first iteration steps
        iterationSteps.forEach(step => {
            step.dependencies.push({
                inputName: '__condition',
                sourceStepId: checkStep.id,
                outputName: 'result'
            });
        });

        newSteps.push(...iterationSteps);

        // Add next condition check step that will determine if another iteration is needed
        const nextCheckStep = new Step({
            actionVerb: 'THINK',
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

        const steps = stepsInput.value as ActionVerbTask[];
        const condition = conditionInput.value;

        const newSteps: Step[] = [];

        // Create first iteration steps (UNTIL executes at least once)
        const iterationSteps = createFromPlan(steps, this.stepNo + 1, this.persistenceManager);
        newSteps.push(...iterationSteps);

        // Add condition check step after first iteration
        const checkStep = new Step({
            actionVerb: 'THINK',
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

        // Add dependencies from condition check to all iteration steps
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

    private async handleSequence(): Promise<PluginOutput[]> {
        const stepsInput = this.inputValues.get('steps');

        if (!stepsInput) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in SEQUENCE step',
                result: null,
                error: 'Missing required input: steps'
            }];
        }

        const steps = stepsInput.value as ActionVerbTask[];
        const newSteps: Step[] = [];

        // Create steps with explicit dependencies to force sequential execution
        let previousStepId: string | undefined;

        steps.forEach((task, index) => {
            const newStep = new Step({
                actionVerb: task.actionVerb,
                stepNo: this.stepNo + 1 + index,
                inputReferences: task.inputReferences || new Map(),
                inputValues: new Map<string, InputValue>(),
                description: task.description || `Sequential step ${index + 1}`,
                persistenceManager: this.persistenceManager
            });

            if (previousStepId) {
                // Add dependency on previous step
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

    /**
     * Clears any temporary data stored during step execution
     */
    public clearTempData(): void {
        this.tempData.clear();
        // Clear any large objects or buffers
        if (this.result) {
            // Keep only essential data in results
            this.result = this.result.map(output => ({
                ...output,
                result: typeof output.result === 'string' ? output.result : null
            }));
        }
    }

    /**
     * Stores temporary data during step execution
     * @param key Identifier for the temp data
     * @param data The data to store
     */
    public storeTempData(key: string, data: any): void {
        this.tempData.set(key, data);
    }

    /**
     * Retrieves temporary data
     * @param key Identifier for the temp data
     */
    public getTempData(key: string): any {
        return this.tempData.get(key);
    }

    /**
     * Converts the step to a simple JSON-serializable object
     * @returns Simplified representation of the step
     */
    toJSON() {
        return {
            id: this.id,
            stepNo: this.stepNo,
            actionVerb: this.actionVerb,
            inputReferences: MapSerializer.transformForSerialization(this.inputReferences),
            inputValues: MapSerializer.transformForSerialization(this.inputValues),
            description: this.description,
            dependencies: MapSerializer.transformForSerialization(this.dependencies),
            status: this.status,
            result: this.result,
            recommendedRole: this.recommendedRole,
        };
    }

    /**
     * Handle execution of a plan template
     * This creates a new execution context and delegates to the CapabilitiesManager
     */
    private async handleExecutePlanTemplate(executeAction: (step: Step) => Promise<PluginOutput[]>): Promise<PluginOutput[]> {
        const templateIdInput = this.inputValues.get('templateId')?.value;
        const templateInputsInput = this.inputValues.get('inputs')?.value || {}; 
        const userIdInput = this.inputValues.get('userId')?.value; // Ensure this is correctly typed
        const executionModeInput = this.inputValues.get('executionMode')?.value; // Ensure this is correctly typed

        if (!templateIdInput || typeof templateIdInput !== 'string') {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: '[Step]Error in EXECUTE_PLAN_TEMPLATE step',
                result: null,
                error: 'Missing or invalid required input: templateId must be a string'
            }];
        }

        const templateId = templateIdInput;
        const templateInputs = templateInputsInput || {}; // Default to empty object if undefined
        const userId = (userIdInput as string) || 'agent-user'; // Default userId
        const executionMode = (executionModeInput as string) || 'automatic'; // Default executionMode

        // Create a special step that will be sent to CapabilitiesManager for plan template execution
        const planExecutionStep = new Step({
            actionVerb: 'EXECUTE_PLAN_TEMPLATE_INTERNAL',
            stepNo: this.stepNo,
            inputReferences: new Map([
                ['templateId', { inputName: 'templateId', value: templateId, valueType: PluginParameterType.STRING, args: {} }],
                ['inputs', { inputName: 'inputs', value: templateInputs, valueType: PluginParameterType.OBJECT, args: {} }],
                ['userId', { inputName: 'userId', value: userId, valueType: PluginParameterType.STRING, args: {} }],
                ['executionMode', { inputName: 'executionMode', value: executionMode, valueType: PluginParameterType.STRING, args: {} }]
            ]),
            description: `Execute plan template: ${templateId}`,
            persistenceManager: this.persistenceManager
        });

        // Execute through the CapabilitiesManager
        const result = await executeAction(planExecutionStep);

        // Check if the result contains an execution ID for monitoring
        const executionIdResult = result.find(r => r.name === 'executionId');
        if (executionIdResult && executionIdResult.success) {
            // Return the execution ID so the agent can monitor progress
            return [{
                success: true,
                name: 'planExecution',
                resultType: PluginParameterType.OBJECT,
                resultDescription: '[Step]Plan template execution started',
                result: {
                    executionId: executionIdResult.result,
                    templateId: templateId,
                    status: 'started'
                }
            }];
        }

        // If no execution ID, return the raw result
        return result;
    }

    /**
     * Applies modifications to the step instance.
     * @param modifications - An object containing properties to update.
     */
    public applyModifications(modifications: StepModification): void {
        if (modifications.description !== undefined) {
            this.description = modifications.description;
            this.logEvent({ eventType: 'step_description_updated', stepId: this.id, newDescription: this.description });
        }
        if (modifications.inputValues) { // Complete replacement
            this.inputValues = new Map(modifications.inputValues); // Assuming Map or convert from Record
            this.logEvent({ eventType: 'step_inputs_replaced', stepId: this.id });
        }
        if (modifications.updateInputs) { // Merge/update
            if (!this.inputValues) this.inputValues = new Map<string, InputValue>();
            modifications.updateInputs.forEach((value, key) => {
                this.inputValues.set(key, value);
            });
            this.logEvent({ eventType: 'step_inputs_updated', stepId: this.id });
        }
        if (modifications.status) {
            this.updateStatus(modifications.status); // Use existing updateStatus to ensure logging
        }
        if (modifications.actionVerb) {
            // Note: Changing actionVerb is a significant change and might require re-evaluation of dependencies or capabilities.
            // For now, just updating the property.
            console.warn(`Agent ${this.id.split('_')[0]}: Step ${this.id} actionVerb changed from ${this.actionVerb} to ${modifications.actionVerb}. This might have execution implications.`);
            (this as any).actionVerb = modifications.actionVerb; // Bypass readonly if necessary, or reconsider readonly
            this.logEvent({ eventType: 'step_actionVerb_updated', stepId: this.id, oldActionVerb: this.actionVerb, newActionVerb: modifications.actionVerb });
        }
        if (modifications.recommendedRole) {
            this.recommendedRole = modifications.recommendedRole;
            this.logEvent({ eventType: 'step_recommendedRole_updated', stepId: this.id, newRecommendedRole: this.recommendedRole });
        }
        // Add handling for other modifiable fields here
    }
}


    /**
     * Creates steps from a plan of action verb tasks
     * @param plan Array of action verb tasks
     * @param startingStepNo The starting step number
     * @returns Array of Step instances
     */
    export function createFromPlan(plan: ActionVerbTask[], startingStepNo: number, persistenceManager: AgentPersistenceManager): Step[] {
        // Extend ActionVerbTask locally to include number and outputs for conversion
        type PlanTask = ActionVerbTask & { number?: number; outputs?: Record<string, any> };
        const planTasks = plan as PlanTask[];
        const stepNumberToUUID: Record<number, string> = {};
        const outputNameToUUID: Record<string, string> = {};
        // Also map 'step_1', 'step_2', ... to UUIDs for compatibility
        const stepLabelToUUID: Record<string, string> = {};
        planTasks.forEach((task, idx) => {
            const uuid = uuidv4();
            task.id = uuid;
            const stepNum = task.number || idx + 1;
            stepNumberToUUID[stepNum] = uuid;
            stepLabelToUUID[`step_${stepNum}`] = uuid;
        });
        // First pass: register outputs and GET_USER_INPUT steps
        planTasks.forEach((task, idx) => {
            const stepUUID = task.id!;
            // Register outputs
            if (task.outputs) {
                Object.keys(task.outputs).forEach(outputName => {
                    outputNameToUUID[outputName] = stepUUID;
                });
            }
            // Register outputs (for LLM plans that use this key)
            if ((task as any).outputs) {
                Object.keys((task as any).outputs).forEach(outputName => {
                    outputNameToUUID[outputName] = stepUUID;
                });
            }
        });
        // Second pass: create steps and resolve dependencies
        return planTasks.map((task, idx) => {
            const inputReferences = new Map<string, InputReference>();
            if (task.inputReferences) {
                for (const [inputName, inputDef] of Object.entries(task.inputReferences as Record<string, any>)) {
                    if (typeof inputDef !== 'object' || inputDef === null) {
                        console.warn(`[createFromPlan] Skipping invalid input definition for '${inputName}' in task '${task.actionVerb}'.`);
                        continue;
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

            const dependencies: StepDependency[] = [];
            // New format: dependencies is an array of objects mapping outputName to step number
            if (task.dependencies && Array.isArray(task.dependencies)) {
                task.dependencies.forEach((dep: any) => {
                    // dep is { outputName: stepNo }
                    const outputName = Object.keys(dep)[0];
                    const sourceStepNo = dep[outputName];
                    const sourceStepId = stepNumberToUUID[sourceStepNo];
                    if (!sourceStepId) {
                        throw new Error(`[createFromPlan] Cannot resolve dependency for step ${task.actionVerb} (stepNo ${startingStepNo + idx}): dep=${JSON.stringify(dep)}`);
                    }
                    dependencies.push({
                        inputName: outputName, // The input that will receive this output
                        sourceStepId,
                        outputName
                    });
                });
            }
            const step = new Step({
                id: task.id!,
                actionVerb: task.actionVerb,
                stepNo: startingStepNo + idx,
                description: task.description,
                dependencies: dependencies,
                inputReferences: inputReferences,
                inputValues: new Map<string, InputValue>(),
                recommendedRole: task.recommendedRole,
                persistenceManager: persistenceManager
            });
            console.log(`[Step.createFromPlan] Created step.actionVerb: '${step.actionVerb}', Step ID: ${step.id}, Dependencies: ${JSON.stringify(dependencies)}`);
            return step;
        });
    }
