import { v4 as uuidv4 } from 'uuid';
import { PluginInput, PluginParameterType, PluginOutput } from '@cktmcs/shared';
import { MapSerializer } from '@cktmcs/shared';
import { MessageType, ActionVerbTask } from '@cktmcs/shared';

export enum StepStatus {
    PENDING = 'pending',
    RUNNING = 'running',
    COMPLETED = 'completed',
    ERROR = 'error'
}

export class Step {
    readonly id: string;
    readonly stepNo: number;
    readonly actionVerb: string;
    inputs: Map<string, PluginInput>;
    description?: string;
    dependencies: Map<string, string>;
    status: StepStatus;
    result?: PluginOutput[];
    timeout?: number;

    constructor(params: {
        actionVerb: string,
        stepNo: number,
        inputs?: Map<string, PluginInput>,
        description?: string,
        dependencies?: Map<string, string>,
        status?: StepStatus
    }) {
        this.id = uuidv4();
        this.stepNo = params.stepNo;
        this.actionVerb = params.actionVerb;
        this.inputs = params.inputs || new Map();
        this.description = params.description;
        this.dependencies = params.dependencies || new Map();
        this.status = params.status || StepStatus.PENDING;
    }

    /**
     * Creates steps from a plan of action verb tasks
     * @param plan Array of action verb tasks
     * @param startingStepNo The starting step number
     * @returns Array of Step instances
     */
    static createFromPlan(plan: ActionVerbTask[], startingStepNo: number = 1): Step[] {
        return plan.map((task, index) => {
            const inputs = task.inputs || new Map();
            const dependencies = new Map<string, string>();

            // Set dependencies for this step
            if (task.dependencies) {
                Object.entries(task.dependencies).forEach(([inputKey, depStepId]) => {
                    dependencies.set(inputKey, depStepId);
                });
            }

            return new Step({
                actionVerb: task.verb,
                stepNo: startingStepNo + index,
                inputs: inputs,
                description: task.description,
                dependencies: dependencies
            });
        });
    }

    /**
     * Checks if all dependencies of this step are satisfied
     * @param allSteps All steps in the current process
     * @returns Boolean indicating if dependencies are satisfied
     */
    areDependenciesSatisfied(allSteps: Step[]): boolean {
        return Array.from(this.dependencies.values()).every(depStepId => {
            const depStep = allSteps.find(s => s.id === depStepId);
            return depStep && depStep.status === StepStatus.COMPLETED;
        });
    }

    /**
     * Determines if this step is an endpoint (no other steps depend on it)
     * @param allSteps All steps in the current process
     * @returns Boolean indicating if this is an endpoint step
     */
    isEndpoint(allSteps: Step[]): boolean {
        const dependents = allSteps.filter(s => 
            [...s.dependencies.values()].some(depId => depId === this.id)
        );
        return dependents.length === 0;
    }

    async execute(
        executeAction: (step: Step) => Promise<PluginOutput[]>,
        thinkAction: (inputs: Map<string, PluginInput>) => Promise<PluginOutput[]>,
        delegateAction: (inputs: Map<string, PluginInput>) => Promise<PluginOutput[]>,
        askAction: (inputs: Map<string, PluginInput>) => Promise<PluginOutput[]>
    ): Promise<PluginOutput[]> {
        this.status = StepStatus.RUNNING;
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

            this.result = result;
            this.status = StepStatus.COMPLETED;
            return result;
        } catch (error) {
            this.status = StepStatus.ERROR;
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error executing step',
                result: error instanceof Error ? error.message : String(error),
                error: error instanceof Error ? error.message : String(error)
            }];
        }
    }

    /**
     * Updates the step's status
     * @param newStatus New status for the step
     * @param result Optional result of the step
     */
    updateStatus(newStatus: StepStatus, result?: PluginOutput[]): void {
        this.status = newStatus;
        if (result) {
            this.result = result;
        }
    }

    /**
     * Populates step inputs from dependent steps
     * @param allSteps All steps in the current process
     */
    populateInputsFromDependencies(allSteps: Step[]): void {
        if (this.dependencies) {
            this.dependencies.forEach((depStepId, inputKey) => {
                const dependentStep = allSteps.find(s => s.id === depStepId);
                if (dependentStep && dependentStep.result) {
                    const inputData = this.inputs.get(inputKey);
                    if (inputData && inputData.args && inputData.args.outputKey) {
                        const outputKey = inputData.args.outputKey;
                        let inputValue: any = undefined;
    
                        // Safely search for the output key in the result array
                        for (const resultItem of dependentStep.result) {
                            if (resultItem.name === outputKey) {
                                inputValue = resultItem.result;
                                break;
                            }
                        }
    
                        this.inputs.set(inputKey, {
                            inputName: inputKey,
                            inputValue: inputValue,
                            args: { ...inputData.args }
                        });
    
                        if (inputValue === undefined) {
                            console.warn(`Output key '${outputKey}' not found in the result of step ${dependentStep.id}`);
                        }
                    }
                }
            });
        }
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
            result: this.result
        };
    }
}