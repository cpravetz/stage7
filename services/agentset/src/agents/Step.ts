import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import { PluginParameterType,
    PluginOutput,
    InputReference,
    InputValue,
    StepDependency,
    ActionVerbTask,
    ExecutionContext as PlanExecutionContext,
    PlanTemplate,
    OutputType } from '@cktmcs/shared'; // Added ActionVerbTask and OutputType
import { MapSerializer } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared'; // Ensured MessageType is here, assuming it's separate or also from shared index
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';

/**
 * Interface for validating action verbs against available plugins
 */
export interface PluginValidator {
    /**
     * Validates if an action verb is available as a plugin or control flow verb
     * @param actionVerb The action verb to validate
     * @returns Promise<boolean> True if the verb is valid
     */
    isValidActionVerb(actionVerb: string): Promise<boolean>;

    /**
     * Gets all available action verbs (both control flow and plugins)
     * @returns Promise<string[]> Array of available action verbs
     */
    getAvailableActionVerbs(): Promise<string[]>;
}

/**
 * Enhanced plugin validator that uses CapabilitiesManager for dynamic validation
 */
export class DefaultPluginValidator implements PluginValidator {
    private capabilitiesManagerUrl: string;
    private cachedVerbs: string[] | null = null;
    private cacheExpiry: number = 0;
    private readonly CACHE_TTL_MS = 60000; // 1 minute cache

    // Known control flow verbs that are always valid
    private readonly CONTROL_FLOW_VERBS = [
        'THINK', 'DELEGATE', 'ASK', 'IF_THEN', 'REPEAT',
        'WHILE', 'UNTIL', 'SEQUENCE', 'TIMEOUT',
        'EXECUTE_PLAN_TEMPLATE', 'FOREACH'
    ];

    constructor(capabilitiesManagerUrl?: string) {
        this.capabilitiesManagerUrl = capabilitiesManagerUrl ||
            process.env.CAPABILITIES_MANAGER_URL ||
            'capabilitiesmanager:5030';
    }

    async isValidActionVerb(actionVerb: string): Promise<boolean> {
        // Handle special case transformations
        if (actionVerb === 'EXECUTE') {
            return true; // Will be transformed to ACCOMPLISH
        }

        // Check control flow verbs first (no network call needed)
        if (this.CONTROL_FLOW_VERBS.includes(actionVerb)) {
            return true;
        }

        // Check if it matches typical plugin verb format
        if (!/^[A-Z_]+$/.test(actionVerb)) {
            return false;
        }

        // Query available plugins from CapabilitiesManager
        try {
            const availableVerbs = await this.getAvailableActionVerbs();
            return availableVerbs.includes(actionVerb);
        } catch (error) {
            console.warn(`[DefaultPluginValidator] Failed to validate actionVerb '${actionVerb}': ${error instanceof Error ? error.message : error}`);
            // Fallback: assume it's valid if it matches the format
            return /^[A-Z_]+$/.test(actionVerb);
        }
    }

    async getAvailableActionVerbs(): Promise<string[]> {
        // Return cached result if still valid
        if (this.cachedVerbs && Date.now() < this.cacheExpiry) {
            return this.cachedVerbs;
        }

        try {
            // Query CapabilitiesManager for available plugins
            const response = await axios.get(
                `http://${this.capabilitiesManagerUrl}/availablePlugins`,
                {
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            const plugins = response.data;
            const pluginVerbs = plugins
                .map((plugin: any) => plugin.verb)
                .filter((verb: string) => verb && typeof verb === 'string');

            // Combine control flow verbs with plugin verbs
            const allVerbs = [...this.CONTROL_FLOW_VERBS, ...pluginVerbs];

            // Cache the result
            this.cachedVerbs = allVerbs;
            this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

            console.log(`[DefaultPluginValidator] Cached ${allVerbs.length} available action verbs`);
            return allVerbs;
        } catch (error) {
            console.warn(`[DefaultPluginValidator] Failed to fetch available plugins: ${error instanceof Error ? error.message : error}`);
            // Fallback to just control flow verbs
            return this.CONTROL_FLOW_VERBS;
        }
    }



    /**
     * Force refresh the cache (useful for testing or when plugins are updated)
     */
    async refreshCache(): Promise<void> {
        this.cachedVerbs = null;
        this.cacheExpiry = 0;
        await this.getAvailableActionVerbs();
    }

    /**
     * Get detailed information about a specific plugin verb
     */
    async getPluginInfo(actionVerb: string): Promise<any | null> {
        try {
            const response = await axios.get(
                `http://${this.capabilitiesManagerUrl}/availablePlugins`,
                {
                    timeout: 5000,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    }
                }
            );

            const plugins = response.data;
            return plugins.find((plugin: any) => plugin.verb === actionVerb) || null;
        } catch (error) {
            console.warn(`[DefaultPluginValidator] Failed to get plugin info for '${actionVerb}': ${error instanceof Error ? error.message : error}`);
            return null;
        }
    }
}


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

        // Validate recommendedRole
        if (this.recommendedRole && !/^[a-zA-Z0-9_-]+$/.test(this.recommendedRole)) {
            console.warn(`[Step Constructor] Invalid characters in recommendedRole: '${this.recommendedRole}'. Defaulting to undefined.`);
            this.logEvent({
                eventType: 'step_validation_warning',
                stepId: this.id,
                message: `Invalid recommendedRole '${this.recommendedRole}' sanitized.`,
                originalValue: this.recommendedRole,
                timestamp: new Date().toISOString()
            });
            this.recommendedRole = undefined;
        }

        this.persistenceManager = params.persistenceManager;
        this.awaitsSignal = '';
        // Log step creation event
        this.logEvent({
            eventType: 'step_created',
            stepId: this.id,
            stepNo: this.stepNo,
            actionVerb: this.actionVerb,
            inputValues:MapSerializer.transformForSerialization(this.inputValues),
            inputReferences: MapSerializer.transformForSerialization(this.inputReferences),
            dependencies: this.dependencies,
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

    getOutputType(allSteps: Step[]): OutputType {
        // If the step generates a plan, its output type is PLAN
        if (this.result?.some(r => r.resultType === PluginParameterType.PLAN)) {
            return OutputType.PLAN;
        }
        // If the step is an endpoint and doesn't generate a plan, its output type is FINAL
        if (this.isEndpoint(allSteps)) {
            return OutputType.FINAL;
        }
        // Otherwise, its output type is INTERIM
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
        // Ensure inputValues are populated from inputReferences before execution
        this.populateInputsFromReferences();
        // Only populate from dependencies if we have the full list of steps
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
                    result = await delegateAction(this.inputValues);
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
                dependencies: this.dependencies,
                timestamp: new Date().toISOString()
            });

            await this.persistenceManager.saveWorkProduct({
                agentId: this.id.split('_')[0],                stepId: this.id,
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

    // Note: Shared folder interactions have been moved to plugins that need them (e.g., file_ops_python)
    // Step outputs are now handled by the persistence manager and individual plugins as needed



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

    /**
     * Populates inputValues from inputReferences if not already present
     */
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


    /**
     * Creates steps from a plan of action verb tasks
     * @param plan Array of action verb tasks
     * @param startingStepNo The starting step number
     * @param persistenceManager The persistence manager for the steps
     * @param pluginValidator Optional plugin validator (uses default if not provided)
     * @returns Array of Step instances
     */
    export function createFromPlan(
        plan: ActionVerbTask[],
        startingStepNo: number,
        persistenceManager: AgentPersistenceManager,
        pluginValidator?: PluginValidator
    ): Step[] {
        // Extend ActionVerbTask locally to include number and outputs for conversion
        type PlanTask = ActionVerbTask & { number?: number; outputs?: Record<string, any>; id?: string; };
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
        // First pass: register outputs and ASK_USER_QUESTION steps
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
            if (task.dependencies && typeof task.dependencies === 'object' && !Array.isArray(task.dependencies)) {
                Object.entries(task.dependencies).forEach(([dependencyOutputName, sourceStepNo]) => {
                    if (typeof sourceStepNo !== 'number' || sourceStepNo < 1) {
                        throw new Error(`[createFromPlan] Invalid step number for dependency '${dependencyOutputName}': ${sourceStepNo}`);
                    }
                    const sourceStepId = stepNumberToUUID[sourceStepNo];
                    if (!sourceStepId) {
                        throw new Error(`[createFromPlan] Cannot resolve dependency for step ${task.actionVerb} (stepNo ${startingStepNo + idx}): outputName=${dependencyOutputName}, sourceStepNo=${sourceStepNo}`);
                    }

                    // Find the corresponding inputName in inputReferences that expects this output.
                    let dependencyInputName: string | undefined;
                    for (const [inputName, inputRef] of inputReferences.entries()) {
                        if (inputRef.outputName === dependencyOutputName) {
                            dependencyInputName = inputName;
                            break;
                        }
                    }

                    dependencies.push({
                        outputName: dependencyOutputName,
                        sourceStepId,
                        inputName: dependencyInputName || dependencyOutputName // Fallback to outputName if no explicit mapping found
                    });
                });
            }

            // Validate IF_THEN task inputs before creating the Step object
            if (task.actionVerb === 'IF_THEN') {
                const conditionInputRef = inputReferences.get('condition');
                if (!conditionInputRef || (conditionInputRef.value === undefined && conditionInputRef.outputName === undefined)) {
                    throw new Error(`[Step.createFromPlan] Validation Error for IF_THEN step: 'condition' input must have a direct boolean 'value' or an 'outputName' reference. Received: ${JSON.stringify(conditionInputRef)}`);
                }

                const trueStepsInputRef = inputReferences.get('trueSteps');
                if (!trueStepsInputRef || !Array.isArray(trueStepsInputRef.value)) {
                    throw new Error(`[Step.createFromPlan] Validation Error for IF_THEN step: 'trueSteps' input must be an array of ActionVerbTask objects. Received: ${JSON.stringify(trueStepsInputRef?.value)}`);
                }
                for (const subTask of trueStepsInputRef.value) {
                    if (typeof subTask !== 'object' || subTask === null || !subTask.actionVerb) {
                        throw new Error(`[Step.createFromPlan] Validation Error for IF_THEN step: Each item in 'trueSteps' must be a valid ActionVerbTask object. Received item: ${JSON.stringify(subTask)}`);
                    }
                }

                const falseStepsInputRef = inputReferences.get('falseSteps');
                if (!falseStepsInputRef || !Array.isArray(falseStepsInputRef.value)) {
                    throw new Error(`[Step.createFromPlan] Validation Error for IF_THEN step: 'falseSteps' input must be an array of ActionVerbTask objects. Received: ${JSON.stringify(falseStepsInputRef?.value)}`);
                }
                for (const subTask of falseStepsInputRef.value) {
                    if (typeof subTask !== 'object' || subTask === null || !subTask.actionVerb) {
                        throw new Error(`[Step.createFromPlan] Validation Error for IF_THEN step: Each item in 'falseSteps' must be a valid ActionVerbTask object. Received item: ${JSON.stringify(subTask)}`);
                    }
                }
            }

            // Validate actionVerb
            if (task.actionVerb === 'ASK_USER_QUESTION') {
                const questionInputRef = inputReferences.get('question');
                if (!questionInputRef || questionInputRef.value === undefined || typeof questionInputRef.value !== 'string' || questionInputRef.value.trim() === '') {
                    throw new Error(`[Step.createFromPlan] Validation Error for ASK_USER_QUESTION step: 'question' input must have a non-empty string 'value'. Received: ${JSON.stringify(questionInputRef)}`);
                }
            }

            // Handle special case transformations
            if (task.actionVerb === 'EXECUTE') {
                task.actionVerb = 'ACCOMPLISH';
            }

            // Validate action verb using the plugin validator
            // Note: We don't await here to keep the function synchronous for now
            // The validation will be done by CapabilitiesManager at execution time
            // This is just for early warning/logging
            const validator = pluginValidator || new DefaultPluginValidator();
            validator.isValidActionVerb(task.actionVerb).then(isValid => {
                if (!isValid) {
                    console.warn(`[Step.createFromPlan] Warning: actionVerb '${task.actionVerb}' may not be available. It will be validated by CapabilitiesManager at execution time.`);
                }
            }).catch(error => {
                console.warn(`[Step.createFromPlan] Could not validate actionVerb '${task.actionVerb}': ${error instanceof Error ? error.message : error}`);
            });

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
            // console.log(`[Step.createFromPlan] Created step.actionVerb: '${step.actionVerb}', Step ID: ${step.id}, Dependencies: ${JSON.stringify(dependencies)}`);
            return step;
        });
    }
