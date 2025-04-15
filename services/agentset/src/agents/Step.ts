import { v4 as uuidv4 } from 'uuid';
import { PluginInput, PluginParameterType, PluginOutput, PlanDependency, StepDependency } from '@cktmcs/shared';
import { MapSerializer } from '@cktmcs/shared';
import { MessageType, ActionVerbTask } from '@cktmcs/shared';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';


export enum StepStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    ERROR = 'error',
    WAITING = 'WAITING'
}


export class Step {
    readonly id: string;
    readonly stepNo: number;
    readonly actionVerb: string;
    inputs: Map<string, PluginInput>;
    description?: string;
    dependencies: StepDependency[];
    status: StepStatus;
    result?: PluginOutput[];
    timeout?: number;
    waitingFor?: string;
    error?: string;
    private tempData: Map<string, any> = new Map();
    private persistenceManager: AgentPersistenceManager;

    constructor(params: {
        id?: string,
        actionVerb: string,
        stepNo: number,
        inputs?: Map<string, PluginInput>,
        description?: string,
        dependencies?: StepDependency[],
        status?: StepStatus,
        waitingFor?: string,
        error?: string,
        persistenceManager: AgentPersistenceManager,
        agentId?: string
    }) {
        // If an agent ID is provided, use it to create a step ID in the format 'agentId_stepUuid'
        const stepUuid = uuidv4();
        this.id = params.agentId ? `${params.agentId}_${stepUuid}` : (params.id || stepUuid);
        this.stepNo = params.stepNo;
        this.actionVerb = params.actionVerb;
        this.inputs = params.inputs || new Map();
        this.description = params.description;
        this.dependencies = params.dependencies || [];
        this.status = params.status || StepStatus.PENDING;
        this.waitingFor = params.waitingFor;
        this.error = params.error;
        this.persistenceManager = params.persistenceManager;
        //console.log(`Constructing new step ${this.id} created. Dependencies ${this.dependencies.map(dep => dep.sourceStepId).join(', ')}`);
    }

    populateInputsFromDependencies(allSteps: Step[]): void {
        this.dependencies.forEach(dep => {
            const sourceStep = allSteps.find(s => s.id === dep.sourceStepId);
            if (sourceStep?.result) {
                const outputValue = sourceStep.result.find(r => r.name === dep.outputName)?.result;
                if (outputValue !== undefined) {
                    this.inputs.set(dep.inputName, {
                        inputName: dep.inputName,
                        inputValue: outputValue,
                        args: { outputKey: dep.outputName }
                    });
                }
            }
        });
    }

    areDependenciesSatisfied(allSteps: Step[]): boolean {
        return this.dependencies.every(dep => {
            const sourceStep = allSteps.find(s => s.id === dep.sourceStepId);
            return sourceStep && sourceStep.status === StepStatus.COMPLETED;
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

    async execute(
        executeAction: (step: Step) => Promise<PluginOutput[]>,
        thinkAction: (inputs: Map<string, PluginInput>) => Promise<PluginOutput[]>,
        delegateAction: (inputs: Map<string, PluginInput>) => Promise<PluginOutput[]>,
        askAction: (inputs: Map<string, PluginInput>) => Promise<PluginOutput[]>
    ): Promise<PluginOutput[]> {
        this.updateStatus(StepStatus.RUNNING);
        try {
            let result: PluginOutput[];
            switch (this.actionVerb) {
                case 'THINK':
                    result = await thinkAction(this.inputs);
                    break;
                case 'DELEGATE':
                    result = await delegateAction(this.inputs);
                    break;
                case 'ASK':
                case MessageType.REQUEST:
                    result = await askAction(this.inputs);
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
/*                    case 'TRANSFORM':
                        result = await this.handleTransform();
                        break;
                    case 'MERGE':
                        result = await this.handleMerge();
                        break;
                    case 'FILTER':
                        result = await this.handleFilter();
                        break;
                    case 'MAP':
                        result = await this.handleMap();
                        break;*/
                default:
                    result = await executeAction(this);
            }

            // Ensure result is always an array of PluginOutput
            if (!Array.isArray(result)) {
                result = [result];
            }

            result = result.map(item => {
                if (!('success' in item && 'name' in item && 'resultType' in item && 'resultDescription' in item && 'result' in item)) {
                    return {
                        success: true,
                        name: 'result',
                        resultType: typeof item as PluginParameterType,
                        resultDescription: 'Action result',
                        result: item,
                        mimeType: 'text/plain'
                    };
                }
                return item;
            });

            result.forEach(resultItem => {
                if (!resultItem.mimeType) { resultItem.mimeType = 'text/plain'; }
            });

            this.updateStatus(StepStatus.COMPLETED, result);
            // Extract the agent ID from the step ID
            const stepIdParts = this.id.split('_');
            // If the step ID has the format 'agent_uuid_stepuuid', extract the agent ID as 'agent_uuid'
            const agentId = stepIdParts.length >= 3 && stepIdParts[0] === 'agent' ? `${stepIdParts[0]}_${stepIdParts[1]}` : 'unknown';
            console.log(`Extracted agent ID ${agentId} from step ID ${this.id}`);
            console.log(`Saving work product for step ${this.id} with agent ID ${agentId}`);
            await this.persistenceManager.saveWorkProduct({
                agentId: agentId,
                stepId: this.id,
                data: result
            });
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.updateStatus(StepStatus.ERROR, undefined, undefined, errorMessage);
            const errorResult = [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error executing step',
                result: errorMessage,
                error: errorMessage
            }];

            // Push error output to Librarian
            // Extract the agent ID from the step ID
            const stepIdParts = this.id.split('_');
            // If the step ID has the format 'agent_uuid_stepuuid', extract the agent ID as 'agent_uuid'
            const agentId = stepIdParts.length >= 3 && stepIdParts[0] === 'agent' ? `${stepIdParts[0]}_${stepIdParts[1]}` : 'unknown';
            console.log(`Extracted agent ID ${agentId} from step ID ${this.id}`);
            console.log(`Saving error work product for step ${this.id} with agent ID ${agentId}`);
            await this.persistenceManager.saveWorkProduct({
                agentId: agentId,
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
     * @param waitingFor Optional identifier of what the step is waiting for
     * @param error Optional error message if the step failed
     */
    updateStatus(newStatus: StepStatus, result?: PluginOutput[], waitingFor?: string, error?: string): void {
        this.status = newStatus;
        if (result) {
            this.result = result;
        }
        if (newStatus === StepStatus.WAITING && waitingFor) {
            this.waitingFor = waitingFor;
        } else if (newStatus !== StepStatus.WAITING) {
            this.waitingFor = undefined;
        }
        if (newStatus === StepStatus.ERROR && error) {
            this.error = error;
        }
    }

    private async handleDecide(): Promise<PluginOutput[]> {
        const condition = this.inputs.get('condition')?.inputValue;
        const trueSteps = this.inputs.get('trueSteps')?.inputValue as ActionVerbTask[];
        const falseSteps = this.inputs.get('falseSteps')?.inputValue as ActionVerbTask[];

        let result: boolean;
        if (typeof condition === 'function') {
            result = await condition();
        } else {
            result = !!condition;
        }

        const stepsToExecute = result ? trueSteps : falseSteps;
        if (stepsToExecute) {
            // Extract the agent ID from the step ID
            const agentId = this.id.includes('_') ? this.id.split('_')[0] : undefined;
            const newSteps = createFromPlan(stepsToExecute, this.stepNo + 1, this.persistenceManager, agentId);
            // Add these steps to the agent's step queue
            return [{
                success: true,
                name: 'steps',
                resultType: PluginParameterType.PLAN,
                resultDescription: 'New steps created from decision',
                result: newSteps
            }];
        }
        return [];
    }

    private async handleRepeat(): Promise<PluginOutput[]> {
        const count = this.inputs.get('count')?.inputValue as number;
        const steps = this.inputs.get('steps')?.inputValue as ActionVerbTask[];
        const newSteps: Step[] = [];

        // Extract the agent ID from the step ID
        const agentId = this.id.includes('_') ? this.id.split('_')[0] : undefined;

        for (let i = 0; i < count; i++) {
            const iterationSteps = createFromPlan(steps, this.stepNo + 1 + (i * steps.length), this.persistenceManager, agentId);
            newSteps.push(...iterationSteps);
        }

        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: 'New steps created from repeat',
            result: newSteps
        }];
    }

    private async handleTimeout(): Promise<PluginOutput[]> {
        const timeoutMs = this.inputs.get('timeout')?.inputValue as number;
        const steps = this.inputs.get('steps')?.inputValue as ActionVerbTask[];

        // Extract the agent ID from the step ID
        const agentId = this.id.includes('_') ? this.id.split('_')[0] : undefined;
        const newSteps = createFromPlan(steps, this.stepNo + 1, this.persistenceManager, agentId);

        newSteps.forEach(step => {
            step.timeout = timeoutMs;
        });

        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: 'New steps created with timeout',
            result: newSteps
        }];
    }

    private async handleWhile(): Promise<PluginOutput[]> {
        const conditionInput = this.inputs.get('condition');
        const stepsInput = this.inputs.get('steps');
        // Safety limit for future implementation
        // const maxIterations = 100;

        if (!conditionInput || !stepsInput) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in WHILE step',
                result: null,
                error: 'Missing required inputs: condition and steps are required'
            }];
        }

        const steps = stepsInput.inputValue as ActionVerbTask[];
        const condition = conditionInput.inputValue;

        // For future implementation of dynamic loop handling
        // let currentIteration = 0;
        const newSteps: Step[] = [];

        // Initial condition check step
        const checkStep = new Step({
            actionVerb: 'THINK',
            stepNo: this.stepNo + 1,
            inputs: new Map([
                ['prompt', {
                    inputName: 'prompt',
                    inputValue: `Evaluate if this condition is true: ${condition}`,
                    args: {}
                }]
            ]),
            description: 'While loop condition evaluation',
            persistenceManager: this.persistenceManager
        });

        newSteps.push(checkStep);

        // Extract the agent ID from the step ID
        const agentId = this.id.includes('_') ? this.id.split('_')[0] : undefined;

        // Create steps for first potential iteration
        const iterationSteps = createFromPlan(steps, this.stepNo + 2, this.persistenceManager, agentId);

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
            inputs: new Map([
                ['prompt', {
                    inputName: 'prompt',
                    inputValue: `Evaluate if this condition is still true: ${condition}. If true, more steps will be created.`,
                    args: {}
                }]
            ]),
            description: 'While loop continuation check',
            persistenceManager: this.persistenceManager

        });

        newSteps.push(nextCheckStep);

        return [{
            success: true,
            name: 'steps',
            resultType: PluginParameterType.PLAN,
            resultDescription: 'Initial steps created from while loop',
            result: newSteps
        }];

    }

    private async handleUntil(): Promise<PluginOutput[]> {
        const conditionInput = this.inputs.get('condition');
        const stepsInput = this.inputs.get('steps');

        if (!conditionInput || !stepsInput) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in UNTIL step',
                result: null,
                error: 'Missing required inputs: condition and steps are required'
            }];
        }

        const steps = stepsInput.inputValue as ActionVerbTask[];
        const condition = conditionInput.inputValue;

        const newSteps: Step[] = [];

        // Extract the agent ID from the step ID
        const agentId = this.id.includes('_') ? this.id.split('_')[0] : undefined;

        // Create first iteration steps (UNTIL executes at least once)
        const iterationSteps = createFromPlan(steps, this.stepNo + 1, this.persistenceManager, agentId);
        newSteps.push(...iterationSteps);

        // Add condition check step after first iteration
        const checkStep = new Step({
            actionVerb: 'THINK',
            stepNo: this.stepNo + 1 + steps.length,
            inputs: new Map([
                ['prompt', {
                    inputName: 'prompt',
                    inputValue: `Evaluate if this condition is now true: ${condition}. If false, more steps will be created.`,
                    args: {}
                }]
            ]),
            description: 'Until loop condition evaluation',
            persistenceManager: this.persistenceManager

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
            resultDescription: 'Initial steps created from until loop',
            result: newSteps
        }];
    }

    private async handleSequence(): Promise<PluginOutput[]> {
        const stepsInput = this.inputs.get('steps');

        if (!stepsInput) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in SEQUENCE step',
                result: null,
                error: 'Missing required input: steps'
            }];
        }

        const steps = stepsInput.inputValue as ActionVerbTask[];
        const newSteps: Step[] = [];

        // Extract the agent ID from the step ID
        const agentId = this.id.includes('_') ? this.id.split('_')[0] : undefined;

        // Create steps with explicit dependencies to force sequential execution
        let previousStepId: string | undefined;

        steps.forEach((task, index) => {
            const newStep = new Step({
                actionVerb: task.verb,
                stepNo: this.stepNo + 1 + index,
                inputs: task.inputs || new Map(),
                description: task.description || `Sequential step ${index + 1}`,
                persistenceManager: this.persistenceManager,
                agentId: agentId // Pass the agent ID to the Step constructor
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
            resultDescription: 'New steps created in sequence',
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
            inputs: MapSerializer.transformForSerialization(this.inputs),
            description: this.description,
            dependencies: MapSerializer.transformForSerialization(this.dependencies),
            status: this.status,
            result: this.result,
            waitingFor: this.waitingFor,
            error: this.error
        };
    }
}


    /**
     * Creates steps from a plan of action verb tasks
     * @param plan Array of action verb tasks
     * @param startingStepNo The starting step number
     * @param persistenceManager The persistence manager to use
     * @param agentId The ID of the agent creating these steps
     * @returns Array of Step instances
     */
    export function createFromPlan(plan: ActionVerbTask[], startingStepNo: number, persistenceManager: AgentPersistenceManager, agentId?: string): Step[] {
        return plan.map((task, index) => {
            const inputs = new Map<string, PluginInput>();
            if (task.inputs) {
                if (task.inputs instanceof Map) {
                    task.inputs.forEach((value, key) => inputs.set(key, value));
                } else {
                    Object.entries(task.inputs).forEach(([key, value]) => {
                        inputs.set(key, {
                            inputName: key,
                            inputValue: value,
                            args: {}
                        } as PluginInput);
                    });
                }
            }

            const dependencies = (task.dependencies || []).map(dep => ({
                inputName: dep.inputName,
                sourceStepId: plan[dep.sourceStepNo - 1]?.id || '', // This should now always be present
                outputName: dep.outputName
            }));

            const step = new Step({
                id: task.id, // Preserve the original ID from the plan
                actionVerb: task.verb,
                stepNo: startingStepNo + index,
                inputs: inputs,
                description: task.description,
                dependencies: dependencies,
                persistenceManager: persistenceManager,
                agentId: agentId // Pass the agent ID to the Step constructor
            });

            return step;
        });
    }
