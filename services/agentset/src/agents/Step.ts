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
        missionId: string,
        actionVerb: string,
        stepNo: number,
        inputReferences?: Map<string, InputReference>,
        inputValues?: Map<string, InputValue>,
        description?: string,
        dependencies?: StepDependency[],
        outputs?: Map<string, string>,
        status?: StepStatus,
        recommendedRole?: string,
        persistenceManager: AgentPersistenceManager,
        maxRetries?: number
    }) {
        this.id = params.id || uuidv4();
        this.missionId = params.missionId;
        this.stepNo = params.stepNo;
        this.actionVerb = params.actionVerb;
        this.inputReferences = params.inputReferences || new Map();
        this.inputValues = params.inputValues || new Map();
        this.description = params.description;
        this.dependencies = params.dependencies || [];
        this.outputs = params.outputs || new Map();
        this.status = params.status || StepStatus.PENDING;
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
                const output = sourceStep.result.find(r => r.name === dep.outputName);
                if (output) {
                    this.inputValues.set(dep.inputName, {
                        inputName: dep.inputName,
                        value: output.result,
                        valueType: output.resultType,
                        args: {}
                    });
                }
            }
        });
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
        askAction: (inputValues: Map<string, InputValue>) => Promise<PluginOutput[]>,
        allSteps?: Step[]
    ): Promise<PluginOutput[]> {
        this.populateInputsFromReferences();
        if (allSteps) {
            this.populateInputsFromDependencies(allSteps);
        }
        this.status = StepStatus.RUNNING;
        try {
            let result: PluginOutput[];
            switch (this.actionVerb) {
                case 'THINK':
                    result = await thinkAction(this.inputValues);
                    break;
                case 'DELEGATE':
                    result = await this.handleDelegate(executeAction);
                    break;
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

            result.forEach(resultItem => {
                if (!resultItem.mimeType) { resultItem.mimeType = 'text/plain'; }
            });

            if (result[0]?.resultType === PluginParameterType.PLAN) {
                this.status = StepStatus.SUB_PLAN_RUNNING; 
                this.result = result;
            } else {
                this.status = StepStatus.COMPLETED;
                this.result = result;

                await this.logEvent({
                    eventType: 'step_result',
                    stepId: this.id,
                    missionId: this.missionId,
                    stepNo: this.stepNo,
                    actionVerb: this.actionVerb,
                    status: this.status,
                    result: result,
                    dependencies: this.dependencies,
                    timestamp: new Date().toISOString()
                });

                await this.persistenceManager.saveWorkProduct({
                    agentId: this.id.split('_')[0], stepId: this.id,
                    data: result
                });
            }
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
        const steps = this.inputValues.get('steps')?.value as ActionVerbTask[];
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
        const steps = this.inputValues.get('steps')?.value as ActionVerbTask[];
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

        const steps = stepsInput.value as ActionVerbTask[];
        const condition = conditionInput.value;

        let currentIteration = 0;
        const newSteps: Step[] = [];

        const checkStep = new Step({
            actionVerb: 'THINK',
            missionId: this.missionId,
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

        const iterationSteps = createFromPlan(steps, this.stepNo + 1, this.persistenceManager, this);
        newSteps.push(...iterationSteps);

        const checkStep = new Step({
            actionVerb: 'THINK',
            missionId: this.missionId,
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
                result: null,
                error: 'Missing required input: steps'
            }];
        }

        const steps = stepsInput.value as ActionVerbTask[];
        const newSteps: Step[] = [];

        let previousStepId: string | undefined;

        steps.forEach((task, index) => {
            const newStep = new Step({
                actionVerb: task.actionVerb,
                missionId: this.missionId,
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

    public populateInputsFromReferences(): void {
        if (!this.inputValues) this.inputValues = new Map<string, InputValue>();
        this.inputReferences.forEach((inputRef, key) => {
            if (!this.inputValues.has(key) && inputRef.value !== undefined) {
                this.inputValues.set(key, {
                    inputName: key,
                    value: inputRef.value,
                    valueType: inputRef.valueType,
                    args: inputRef.args || {}
                });
            }
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

        const inputSource = (task as any).inputs || task.inputReferences;
        if (inputSource) {
            for (const [inputName, inputDef] of Object.entries(inputSource as Record<string, any>)) {
                if (typeof inputDef !== 'object' || inputDef === null) {
                    console.warn(`[createFromPlan] Skipping invalid input definition for '${inputName}' in task '${task.actionVerb}'.`);
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
                    inputValues.set(inputName, {
                        inputName: inputName,
                        value: inputDef.value,
                        valueType: inputDef.valueType,
                        args: inputDef.args,
                    });
                } else if (hasOutputName && hasSourceStep) {
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
                            } else {
                                console.error(`[createFromPlan] 🚨 Unresolved sourceStep 0: Input '${inputDef.outputName}' not found for step '${task.actionVerb}'.`);
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
                        } else {
                            console.error(`[createFromPlan] 🚨 Unresolved sourceStep ${inputDef.sourceStep} for input '${inputName}' in step '${task.actionVerb}'`);
                        }
                    }
                } else {
                    console.error(`[createFromPlan] 🚨 MALFORMED INPUT DETECTED: '${inputName}' in step '${task.actionVerb}' (step ${idx + 1})`);
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
        throw new Error(`Missing required property 'actionVerb' in agent config`);
    }

        const step = new Step({
            id: task.id!,
            missionId: missionId,
            actionVerb: task.actionVerb,
            stepNo: startingStepNo + idx,
            description: task.description,
            dependencies: dependencies,
            inputReferences: inputReferences,
            inputValues: inputValues,
            outputs: task.outputs ? new Map(Object.entries(task.outputs)) : undefined,
            recommendedRole: task.recommendedRole,
            persistenceManager: persistenceManager
        });
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

    return newSteps;
}