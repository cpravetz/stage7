import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import axios from 'axios';
import { AgentStatus } from '../utils/agentStatus';
import { getServiceUrls } from '../utils/postOfficeInterface';
import { WorkProduct } from '../utils/WorkProduct';
import { MapSerializer, BaseEntity } from '@cktmcs/shared';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { PluginInput, PluginOutput, PluginParameterType, PlanTemplate, PlanExecutionRequest, ExecutionContext as PlanExecutionContext } from '@cktmcs/shared';
import { ActionVerbTask } from '@cktmcs/shared';
import { AgentConfig, AgentStatistics } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { Step, StepStatus, createFromPlan, StepModification } from './Step'; // Added StepModification
import { StateManager } from '../utils/StateManager';

export enum CollaborationMessageType {
    TASK_UPDATE = 'TASK_UPDATE',
    INFO_SHARE = 'INFO_SHARE',
    RESOURCE_SHARE_REQUEST = 'RESOURCE_SHARE_REQUEST',
}

export interface CollaborationMessage {
    type: CollaborationMessageType;
    payload: any;
    senderId: string; // Added senderId for context
    timestamp: string; // Added timestamp
    // Add other common fields like messageId if needed
}

// Define a structure for what a TASK_UPDATE payload might contain
export interface TaskUpdatePayload {
    stepId: string;
    status?: StepStatus; // e.g., mark a step as cancelled or paused by an external system
    description?: string; // update description
    newInputs?: Record<string, PluginInput>; // To replace inputs, use Record for easier serialization
    updateInputs?: Record<string, PluginInput>; // To merge/update specific inputs
    // other fields like priority, new actionVerb, etc. could be added
}

export interface ConflictResolution {
    resolvedStepId?: string; // ID of the step that was in conflict
    chosenAction: 'MODIFY_STEP' | 'REPLACE_PLAN' | 'NO_CHANGE' | 'RETRY_STEP'; // Action to take
    reasoning?: string; // Explanation for the chosen action
    stepModifications?: StepModification; // Details if chosenAction is 'MODIFY_STEP'
    newPlan?: ActionVerbTask[]; // New plan if chosenAction is 'REPLACE_PLAN'
    // other fields like 'resolvedByAgentId', 'timestamp' can be added
}

export enum CoordinationType {
    SYNC_STATE = 'SYNC_STATE',
    AWAIT_SIGNAL = 'AWAIT_SIGNAL',
    PROVIDE_INFO = 'PROVIDE_INFO',
    // Add other coordination types as needed
}

export interface CoordinationData {
    type: CoordinationType;
    senderId: string; // ID of the agent initiating coordination
    targetAgentId?: string; // Optional: specific agent to coordinate with
    payload?: any; // Data relevant to the coordination type
    signalId?: string; // For AWAIT_SIGNAL / SEND_SIGNAL
    infoKeys?: string[]; // For PROVIDE_INFO / INFO_RECEIVED
    timestamp: string;
}

export interface ResourceResponse {
    requestId: string;
    granted: boolean;
    resource: string;
    data?: any; // Optional data associated with the granted resource
    message?: string; // Optional message/reason for denial
    senderId: string; // ID of the agent/system that processed the request & is sending this response
}

export class Agent extends BaseEntity {
    private missionContext: string = '';
    private agentSetUrl: string;
    private agentPersistenceManager: AgentPersistenceManager;
    private stateManager: StateManager;
    inputs: Map<string, PluginInput> | undefined;
    status: AgentStatus;
    steps: Step[] = [];
    dependencies: string[];
    output: any;
    missionId: string;
    capabilitiesManagerUrl: string = '';
    brainUrl: string = '';
    trafficManagerUrl: string = '';
    librarianUrl: string = '';
    conversation: Array<{ role: string, content: string }> = [];
    role: string = 'executor'; // Default role
    roleCustomizations?: any;
    manageableResources: string[] = ['COMPUTE_TIME', 'DATABASE_ACCESS', 'API_QUOTA_X']; // Example list
    availableResources: Map<string, number> = new Map();
    pendingResourceRequests: Map<string, { stepId: string, resource: string, amount: number }> = new Map();
    sharedKnowledge: Map<string, any> = new Map<string, any>(); // For SYNC_STATE

    // Properties for lifecycle management
    private checkpointInterval: NodeJS.Timeout | null = null;

    private currentQuestionResolve: ((value: string) => void) | null = null;

    constructor(config: AgentConfig) {
        super(config.id, 'AgentSet', `agentset`, process.env.PORT || '9000');
        console.log(`Agent ${config.id} created. missionId=${config.missionId}. Inputs: ${JSON.stringify(config.inputs)}` );

        // Initialize available resources
        this.availableResources.set('COMPUTE_TIME', 100); // Example initial amount
        this.availableResources.set('DATABASE_ACCESS', 10);  // Example initial amount
        this.availableResources.set('API_QUOTA_X', 500);    // Example initial amount
        this.pendingResourceRequests = new Map();
        this.agentPersistenceManager = new AgentPersistenceManager();
        this.stateManager = new StateManager(config.id, this.agentPersistenceManager);
        this.inputs = config.inputs instanceof Map ? config.inputs : new Map(Object.entries(config.inputs||{}));
        this.missionId = config.missionId;
        this.agentSetUrl = config.agentSetUrl;
        this.status = AgentStatus.INITIALIZING;
        this.dependencies = config.dependencies || [];
        if (config.missionContext) {
            this.missionContext = config.missionContext;
        }
        // Handle role and roleCustomizations if they exist in the config
        if ('role' in config && typeof config.role === 'string') {
            this.role = config.role;
        }
        if ('roleCustomizations' in config && config.roleCustomizations) {
            this.roleCustomizations = config.roleCustomizations;
        }

        // Create initial step using the new Step class
        const initialStep = new Step({
            actionVerb: config.actionVerb,
            stepNo: 1,
            inputs: this.inputs,
            description: 'Initial mission step',
            status: StepStatus.PENDING,
            persistenceManager: this.agentPersistenceManager
        });
        this.steps.push(initialStep);

        // Log agent creation event
        this.logEvent({
            eventType: 'agent_created',
            agentId: this.id,
            missionId: this.missionId,
            inputs: MapSerializer.transformForSerialization(this.inputs),
            status: this.status,
            timestamp: new Date().toISOString()
        });

        this.initializeAgent().then(() => {
            console.log(`Agent ${this.id} initialized successfully. Status: ${this.status}. Commencing main execution loop.`);
            this.say(`Agent ${this.id} initialized and commencing operations.`);
            this.runUntilDone();
        }).catch((error) => { // Added error parameter
            this.status = AgentStatus.ERROR;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Agent ${this.id} failed during initialization or before starting execution loop. Error: ${errorMessage}`);
            this.say(`Agent ${this.id} failed to initialize or start. Error: ${errorMessage}`);
            this.notifyTrafficManager().catch(notifyError => {
                 console.error(`Agent ${this.id} failed to notify TrafficManager about initialization error:`, notifyError);
            });
        });
    }

    async logEvent(event: any): Promise<void> {
        if (!event) {
            console.error('Agent logEvent called with empty event');
            return;
        }
        try {
            await this.agentPersistenceManager.logEvent(event);
        } catch (error) {
            console.error('Agent logEvent error:', error instanceof Error ? error.message : error);
        }
    }

    private async runUntilDone() {
        while (this.status !== AgentStatus.COMPLETED &&
               this.status !== AgentStatus.ERROR &&
               this.status !== AgentStatus.ABORTED) {
            await this.runAgent();
        }
        return this.status;
    }

    /**
     * Start the agent
     */
    public start(): void {
        console.log(`Starting agent ${this.id}`);
        this.runUntilDone().catch(error => {
            console.error(`Error running agent ${this.id}:`, error instanceof Error ? error.message : error);
            this.status = AgentStatus.ERROR;
        });
    }

    private async initializeAgent() {
        try {
            const { capabilitiesManagerUrl, brainUrl, trafficManagerUrl, librarianUrl } = await getServiceUrls(this);
            this.capabilitiesManagerUrl = capabilitiesManagerUrl;
            this.brainUrl = brainUrl;
            this.trafficManagerUrl = trafficManagerUrl;
            this.librarianUrl = librarianUrl;
            this.status = AgentStatus.RUNNING;

            if (this.missionContext && this.steps[0]?.actionVerb === 'ACCOMPLISH') {
                await this.prepareOpeningInstruction();
            }
            return true;
        } catch (error) { analyzeError(error as Error);
            console.error('Error initializing agent:', error instanceof Error ? error.message : error);
            this.status = AgentStatus.ERROR;
            return false;
        }
    }

    private async prepareOpeningInstruction() {
        const availablePlugins : Array<String> = await this.getAvailablePlugins();
        const openingInstruction = `
Mission Context: ${this.missionContext}

Available Plugins:
${availablePlugins.map(plugin => `- ${plugin}`).join('\n')}

Please consider this context and the available plugins when planning and executing the mission. Provide detailed and well-structured responses, and use the most appropriate plugins for each task.
        `;

        this.addToConversation('system', openingInstruction);
    }

    private async getAvailablePlugins() {
        if (this.status !== AgentStatus.RUNNING && this.status !== AgentStatus.INITIALIZING) {
            console.log(`Agent ${this.id} is not RUNNING or INITIALIZING, skipping getAvailablePlugins.`);
            return [];
        }
        try {
            const response = await this.authenticatedApi.get(`http://${this.capabilitiesManagerUrl}/availablePlugins`);
            return response.data;
        } catch (error) { analyzeError(error as Error);
            console.error('Error fetching available plugins:', error instanceof Error ? error.message : error);
            return [];
        }
    }

    private async runAgent() {
        try {
            if (this.status === AgentStatus.ABORTED || this.status === AgentStatus.COMPLETED) {
                return;
            }
            // Removed "Agent is starting..." logs from here. It's now in the constructor's then block.

            // Send initial status update to TrafficManager
            await this.notifyTrafficManager();

            while (this.status === AgentStatus.RUNNING &&
                   this.steps.some(step => step.status === StepStatus.PENDING || step.status === StepStatus.RUNNING)) {

                for (const step of this.steps.filter(s => s.status === StepStatus.PENDING)) {
                    if (this.status === AgentStatus.RUNNING && step.areDependenciesSatisfied(this.steps)) {
                        console.log(`Executing step ${step.actionVerb} (${step.id})...`);

                        // Check if this step has a recommended role that doesn't match this agent's role
                        if (step.recommendedRole && step.recommendedRole !== this.role && this.role !== 'coordinator') {
                            console.log(`Step ${step.id} recommends role ${step.recommendedRole}, but this agent has role ${this.role}`);

                            // If this agent is not suited for this step, delegate it to a more appropriate agent
                            const delegationResult = await this.delegateStepToSpecializedAgent(step);
                            if (delegationResult.success) {
                                // Mark this step as completed since it's been delegated
                                step.status = StepStatus.COMPLETED;
                                const isAgentEndpointForDelegation = step.isEndpoint(this.steps);
                                const hasDependentsForDelegation = await this.hasDependentAgents();
                                const allAgents = this.getAllAgentsInMission();
                                await this.saveWorkProductWithClassification(step.id, [{
                                    success: true,
                                    name: 'delegation',
                                    resultType: PluginParameterType.OBJECT,
                                    resultDescription: 'Step delegated to specialized agent',
                                    result: delegationResult.result
                                }], isAgentEndpointForDelegation, allAgents);

                                // Continue to the next step
                                continue;
                            }
                            // If delegation failed, execute the step anyway
                            console.log(`Delegation failed, executing step with current agent`);
                        }

                        this.say(`Executing step: ${step.actionVerb} - ${step.description || 'No description'}`);

                        await this.populateInputsFromLibrarian(step);

                        let result: PluginOutput[];

                        if (step.stepNo === 1 && step.actionVerb === 'ACCOMPLISH' && this.inputs?.has('goal')) {
                            const goal = this.inputs.get('goal')?.inputValue;
                            const planningPrompt = `You are a planning assistant. Given the goal: '${goal}', generate a JSON array of tasks to achieve this goal. Each task object should have 'actionVerb', 'inputs' (as a map of name to {inputValue, inputName, args}), 'description', 'dependencies' (as an array of sourceStepId strings, use step IDs like 'step_1'), and optionally 'recommendedRole'. Ensure the plan is detailed and includes multiple steps with dependencies if logical. The first step will be 'step_1', the next 'step_2', and so on. Dependencies should refer to these generated step IDs.
It is critical that the plan is comprehensive and broken down into a sufficient number of granular steps to ensure successful execution. Each step's description should be clear and actionable.
When defining 'dependencies', ensure they accurately reflect the data flow required between steps. Only list direct predecessor step IDs that provide necessary input for the current step.
If the goal is complex, consider creating a sub-plan using a nested 'ACCOMPLISH' verb for a major sub-component, or use 'CREATE_SUB_AGENT' if a specialized agent should handle a part of the mission.
For 'recommendedRole', suggest roles like 'researcher', 'writer', 'coder', 'validator', 'executor' only if a specialized skill is clearly beneficial for that specific step. Otherwise, omit it or use 'executor'.
The output MUST be a valid JSON array of task objects. Do not include any explanatory text before or after the JSON array.`;

                            console.log(`[Agent ${this.id}] Constructed planning prompt for initial ACCOMPLISH task:`, planningPrompt);

                            const planningInputs = new Map<string, PluginInput>();
                            planningInputs.set('prompt', { inputName: 'prompt', inputValue: planningPrompt, args: {} });
                            planningInputs.set('ConversationType', { inputName: 'ConversationType', inputValue: 'text/code', args: {} }); // Expecting JSON

                            result = await this.useBrainForReasoning(planningInputs);
                            console.log(`[Agent ${this.id}] Raw response from Brain for planning:`, JSON.stringify(result));

                        } else {
                            result = await step.execute(
                                this.executeActionWithCapabilitiesManager.bind(this),
                                this.useBrainForReasoning.bind(this),
                                this.createSubAgent.bind(this),
                                this.handleAskStep.bind(this)
                            );
                        }

                        console.log(`Step ${step.actionVerb} result:`, result);
                        this.say(`Completed step: ${step.actionVerb}`);

                        if (result[0]?.resultType === PluginParameterType.PLAN) {
                            const planningStepResult = result[0]?.result; // Added optional chaining here for safety
                            let actualPlanArray: ActionVerbTask[] | undefined = undefined;
                            let planSourceDescription = "direct array"; // For logging

                            if (Array.isArray(planningStepResult)) {
                                actualPlanArray = planningStepResult as ActionVerbTask[];
                            } else if (typeof planningStepResult === 'object' && planningStepResult !== null) {
                                const tasksArray = (planningStepResult as any).tasks;
                                const stepsArray = (planningStepResult as any).steps;

                                if (Array.isArray(tasksArray)) {
                                    console.log(`[Agent.ts] runAgent (${this.id}): Plan received is wrapped in a "tasks" object. Extracting tasks array.`);
                                    actualPlanArray = tasksArray as ActionVerbTask[];
                                    planSourceDescription = "object with 'tasks' array";
                                } else if (Array.isArray(stepsArray)) {
                                    console.log(`[Agent.ts] runAgent (${this.id}): Plan received is wrapped in a "steps" object. Extracting steps array.`);
                                    actualPlanArray = stepsArray as ActionVerbTask[];
                                    planSourceDescription = "object with 'steps' array";
                                }
                            }

                            if (actualPlanArray && Array.isArray(actualPlanArray)) { // Added extra Array.isArray check for robustness
                                this.say(`Generated a plan (${planSourceDescription}) with ${actualPlanArray.length} steps`);
                                this.addStepsFromPlan(actualPlanArray);
                                await this.notifyTrafficManager();
                            } else {
                                const errorMessage = `Error: Expected a plan (array, or object with 'tasks'/'steps' array) from Brain service, but received: ${JSON.stringify(planningStepResult)}`;
                                console.error(`[Agent.ts] runAgent (${this.id}): ${errorMessage}`);
                                this.say(`Failed to generate a valid plan. Details: ${JSON.stringify(planningStepResult)}`);
                                this.status = AgentStatus.ERROR;
                                await this.notifyTrafficManager();
                            }
                        }

                        // Only save work product if agent is not in error state from plan validation
                        if (this.status !== AgentStatus.ERROR) {
                            const isAgentEndpoint = step.isEndpoint(this.steps);
                            const hasDependents = await this.hasDependentAgents();
                            await this.saveWorkProductWithClassification(step.id, result, isAgentEndpoint, this.getAllAgentsInMission());
                        }

                        // Send status update after each step completion
                        await this.notifyTrafficManager();
                    }
                }

                await this.checkAndResumeBlockedAgents();
            }

            if (this.status === AgentStatus.RUNNING) {
                const finalStep = this.steps[this.steps.length - 1];
                this.output = await this.agentPersistenceManager.loadWorkProduct(this.id, finalStep.id);
                this.status = AgentStatus.COMPLETED;
                console.log(`Agent ${this.id} has completed its work.`);
                this.say(`Agent ${this.id} has completed its work.`);
                this.say(`Result: ${JSON.stringify(this.output)}`);
            }

            // Final status update
            await this.notifyTrafficManager();

            if (this.status === AgentStatus.COMPLETED) {
                try {
                    console.log(`Agent ${this.id} notifying AgentSet of completed status for removal.`);
                    await this.authenticatedApi.post(`http://${this.agentSetUrl}/removeAgent`, { agentId: this.id, status: 'completed' });
                } catch (error) {
                    console.error(`Agent ${this.id} failed to notify AgentSet for removal after completion:`, error instanceof Error ? error.message : error);
                    // Non-critical, proceed
                }
            }
        } catch (error) {
            console.error('Error running agent:', error instanceof Error ? error.message : error);
            this.status = AgentStatus.ERROR;
            this.say(`Error running agent: ${error instanceof Error ? error.message : String(error)}`);
            await this.notifyTrafficManager();
        }
    }

    private async populateInputsFromLibrarian(step: Step) {
        if (this.status !== AgentStatus.RUNNING) {
            console.log(`Agent ${this.id} is not RUNNING, skipping populateInputsFromLibrarian for step ${step.id}.`);
            return;
        }
        for (const dep of step.dependencies) {
            const workProduct = await this.agentPersistenceManager.loadWorkProduct(this.id, dep.sourceStepId);
            if (workProduct && workProduct.data) {
                const deserializedData = MapSerializer.transformFromSerialization(workProduct.data);
                const outputValue = Array.isArray(deserializedData)
                    ? deserializedData.find(r => r.name === dep.outputName)?.result
                    : deserializedData[dep.outputName];
                if (outputValue !== undefined) {
                    step.inputs.set(dep.inputName, {
                        inputName: dep.inputName,
                        inputValue: outputValue,
                        args: { outputKey: dep.outputName }
                    });
                }
            }
        }
    }

    private addStepsFromPlan(plan: ActionVerbTask[]) {
        console.log(`[Agent ${this.id}] Parsed plan for addStepsFromPlan:`, JSON.stringify(plan));
        const newSteps = createFromPlan(plan, this.steps.length + 1, this.agentPersistenceManager);
        this.steps.push(...newSteps);
    }

    async getOutput(): Promise<any> {
        if (this.status !== AgentStatus.COMPLETED) {
            return {
                agentId: this.id,
                status: this.status,
                message: "Agent has not completed execution yet."
            };
        }

        // Find the last completed step
        const lastCompletedStep = [...this.steps]
            .reverse()
            .find(step => step.status === 'completed');

        if (!lastCompletedStep) {
            return {
                agentId: this.id,
                status: this.status,
                message: "No completed steps found."
            };
        }

        const finalWorkProduct = await this.agentPersistenceManager.loadWorkProduct(this.id, lastCompletedStep.id);

        if (!finalWorkProduct) {
            return {
                agentId: this.id,
                status: this.status,
                message: "Final work product not found.",
                lastCompletedStepId: lastCompletedStep.id
            };
        }

        return {
            agentId: this.id,
            status: this.status,
            finalOutput: finalWorkProduct.data,
            lastCompletedStepId: lastCompletedStep.id
        };
    }

    private async checkAndResumeBlockedAgents() {
        if (this.status !== AgentStatus.RUNNING) {
            console.log(`Agent ${this.id} is not RUNNING, skipping checkAndResumeBlockedAgents.`);
            return;
        }
        try {
            await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/checkBlockedAgents`, { completedAgentId: this.id });
        } catch (error) { analyzeError(error as Error);
            console.error('Error checking blocked agents:', error instanceof Error ? error.message : error);
        }
    }

    public async handleMessage(message: any): Promise<void> {
        console.log(`Agent ${this.id} received message:`, message);
        // Handle base entity messages (handles ANSWER)
        await super.handleBaseMessage(message);
        // Add message handling as new types are defined
        switch (message.type) {
            case MessageType.USER_MESSAGE:
                this.addToConversation('user', message.content.message);
                break;
            default:
                break;
        }
    }

    private addToConversation(role: string, content: string) {
        this.conversation.push({ role, content });
    }

    private async handleAskStep(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        if (this.status !== AgentStatus.RUNNING) {
            console.log(`Agent ${this.id} is not RUNNING, aborting handleAskStep.`);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Agent not running',
                result: null,
                error: 'Agent is not in RUNNING state.'
            }];
        }
        const input = inputs.get('question');
        if (!input) {
            this.logAndSay('Question is required for ASK plugin');
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in handleAskStep',
                result: null,
                error: 'Question is required for ASK plugin'
            }]
        }
        const question = input.args.question || input.inputValue;
        const choices = input.args.choices;
        const timeout = input.args.timeout || 300000; // Default timeout of 5 minutes if not specified

        try {
            const response = await Promise.race([
                this.askUser(question, choices),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Question timeout')), timeout))
            ]);

            return [{
                success: true,
                name: 'answer',
                resultType: PluginParameterType.STRING,
                resultDescription: 'User response',
                result: response
            }];
        } catch (error) { analyzeError(error as Error);
            if (error instanceof Error && error.message === 'Question timeout') {
                console.error(`Question timed out after ${timeout}ms: ${question}`);
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Question to user timed out',
                    result: null,
                    error: 'Question timed out'
                }];
            }
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                result: null,
                resultDescription: 'Error in handleAskStep',
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }];
        }
    }
    private async askUser(question: string, choices?: string[]): Promise<string> {
        return new Promise((resolve) => {
            this.currentQuestionResolve = resolve;
            this.ask(question, choices);
        });
    }

    override onAnswer(answer: express.Request): void {
        if (answer.body.questionGuid && this.questions.includes(answer.body.questionGuid)) {
            this.questions = this.questions.filter(q => q !== answer.body.questionGuid);
        }
        if (this.currentQuestionResolve) {
            this.currentQuestionResolve(answer.body.answer);
            this.currentQuestionResolve = null;
        }
    }

    private async saveWorkProductWithClassification(stepId: string, data: PluginOutput[], isAgentEndpoint: boolean, allAgents: Agent[]): Promise<void> {
        if (this.status === AgentStatus.PAUSED || this.status === AgentStatus.ABORTED) {
            console.log(`Agent ${this.id} is in status ${this.status}, skipping saveWorkProduct for step ${stepId}.`);
            return;
        }
        const serializedData = MapSerializer.transformForSerialization(data);
        const workProduct = new WorkProduct(this.id, stepId, serializedData);
        try {
            await this.agentPersistenceManager.saveWorkProduct(workProduct);

            // New logic: check if any step in any agent depends on this step
            const isFinal = Agent.isStepFinal(stepId, allAgents);
            const type = isFinal ? 'Final' : 'Interim';

            let scope: string;
            if (this.steps.length === 1 || (isAgentEndpoint && isFinal)) {
                scope = 'MissionOutput';
            } else if (isAgentEndpoint) {
                scope = 'AgentOutput';
            } else {
                scope = 'AgentStep';
            }

            this.sendMessage(MessageType.WORK_PRODUCT_UPDATE, 'user', {
                id: stepId,
                type: type,
                scope: scope,
                name: data[0] ? data[0].resultDescription : 'Step Output',
                agentId: this.id,
                stepId: stepId,
                missionId: this.missionId,
                mimeType: data[0]?.mimeType || 'text/plain',
                fileName: data[0]?.fileName
            });
        } catch (error) { analyzeError(error as Error);
            console.error('Error saving work product:', error instanceof Error ? error.message : error);
        }
    }

    /**
     * Checks if any step in the given list of agents depends on the given stepId.
     */
    private static isStepFinal(stepId: string, allAgents: Agent[]): boolean {
        for (const agent of allAgents) {
            for (const step of agent.steps) {
                if (step.dependencies && step.dependencies.some(dep => dep.sourceStepId === stepId)) {
                    return false; // Found a dependent step
                }
            }
        }
        return true; // No dependent step found
    }

    private async createSubAgent(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        if (this.status !== AgentStatus.RUNNING) {
            console.log(`Agent ${this.id} is not RUNNING, aborting createSubAgent.`);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Agent not running',
                result: null,
                error: 'Agent is not in RUNNING state.'
            }];
        }
        try {
            const subAgentGoal = inputs.get('subAgentGoal');
            const newInputs = new Map(inputs);

            if (subAgentGoal) {
                newInputs.delete('subAgentGoal');
                newInputs.set('goal', subAgentGoal);
            }

            // Check if a role is specified for the sub-agent
            const roleId = inputs.get('roleId')?.inputValue as string;
            if (roleId) {
                newInputs.delete('roleId');
            }

            // Check if role customizations are specified
            const roleCustomizations = inputs.get('roleCustomizations')?.inputValue;
            if (roleCustomizations) {
                newInputs.delete('roleCustomizations');
            }

            // Check if a recommended role is specified in the task
            const recommendedRole = inputs.get('recommendedRole')?.inputValue as string;
            if (recommendedRole) {
                newInputs.delete('recommendedRole');
            }

            // Determine the final role to use (explicit roleId takes precedence over recommendedRole)
            const finalRoleId = roleId || recommendedRole || 'executor'; // Default to executor if no role is specified

            const subAgentId = uuidv4();
            const subAgentConfig = {
                agentId: subAgentId,
                actionVerb: 'ACCOMPLISH',
                inputs: MapSerializer.transformForSerialization(newInputs),
                missionId: this.missionId,
                dependencies: [this.id, ...(this.dependencies || [])],
                missionContext: this.missionContext,
                roleId: finalRoleId,
                roleCustomizations: roleCustomizations
            };

            console.log(`Creating sub-agent with role: ${finalRoleId}`);
            const response = await this.authenticatedApi.post(`http://${this.agentSetUrl}/addAgent`, subAgentConfig);

            if (response.status >= 300) {
                console.error('Failed to create sub-agent:', response.data.error || 'Unknown error');
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription:'Error in createSubAgent',
                    result: null,
                    error: `Failed to create sub-agent: ${response.data.error || 'Unknown error'}`
                }];
            }

            return [{
                success: true,
                name: 'subAgent',
                resultType: PluginParameterType.OBJECT,
                resultDescription: 'Sub-agent created',
                result: {
                    subAgentId: subAgentId,
                    status: 'created',
                    role: finalRoleId
                }
            }];
        } catch (error) { analyzeError(error as Error);
            console.error('Error creating sub-agent:', error instanceof Error ? error.message : error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription:'Error in createSubAgent',
                result: null,
                error: error instanceof Error ? error.message : 'Unknown error occurred while creating sub-agent'
            }];
        }
    }

    private async useBrainForReasoning(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        if (this.status !== AgentStatus.RUNNING) {
            console.log(`Agent ${this.id} is not RUNNING, aborting useBrainForReasoning.`);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Agent not running',
                result: null,
                error: 'Agent is not in RUNNING state.'
            }];
        }
        const prompt = inputs.get('prompt')?.inputValue as string;
        if (!prompt) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in useBrainForReasoning',
                result: null,
                error: 'Prompt is required for THINK plugin'
            }];
        }

        const optimization = (inputs.get('optimization')?.inputValue as string) || 'accuracy';
        const ConversationType = (inputs.get('ConversationType')?.inputValue as string) || 'text/text';

        const validOptimizations = ['cost', 'accuracy', 'creativity', 'speed', 'continuity'];
        const validConversationTypes = ['text/text', 'text/image', 'text/audio', 'text/video', 'text/code'];

        if (!validOptimizations.includes(optimization)) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in useBrainForReasoning',
                result: null,
                error: `Invalid optimization: ${optimization}. Must be one of ${validOptimizations.join(', ')}`
            }];
        }

        if (!validConversationTypes.includes(ConversationType)) {
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in useBrainForReasoning',
                result: null,
                error: `Invalid ConversationType: ${ConversationType}. Must be one of ${validConversationTypes.join(', ')}`
            }];
        }

        const reasoningInput = {
            exchanges: [{ role: 'user', content: prompt }],
            optimization: optimization,
            ConversationType: ConversationType
        };

        try {
            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, reasoningInput);
            const brainResponse = response.data.response;
            const mimeType = response.data.mimeType || 'text/plain';

            let resultType: PluginParameterType;
            let parsedResult = brainResponse;

            if (ConversationType === 'text/code' && mimeType === 'application/json') {
                try {
                    parsedResult = JSON.parse(brainResponse);
                    resultType = PluginParameterType.PLAN; // Assuming it's a plan
                    console.log(`[Agent ${this.id}] Parsed brainResponse as JSON for plan.`);
                } catch (e) {
                    console.warn(`[Agent ${this.id}] Failed to parse brainResponse as JSON, treating as string. Error:`, e);
                    resultType = PluginParameterType.STRING; // Fallback to string if JSON parsing fails
                }
            } else {
                switch (ConversationType) {
                    case 'text/image':
                        resultType = PluginParameterType.OBJECT; // Assuming image data is returned as an object
                        break;
                    case 'text/audio':
                    case 'text/video':
                        resultType = PluginParameterType.OBJECT; // Assuming audio/video data is returned as an object
                        break;
                    case 'text/code': // If not application/json, treat as string code
                        resultType = PluginParameterType.STRING;
                        break;
                    default:
                        resultType = PluginParameterType.STRING;
                }
            }

            const result: PluginOutput = {
                success: true,
                name: 'answer',
                resultType: resultType,
                result: parsedResult,
                resultDescription: `Brain reasoning output (${ConversationType})`,
                mimeType: mimeType
            };

            return [result];
        } catch (error) {
            console.error('Error using Brain for reasoning:', error instanceof Error ? error.message : error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in useBrainForReasoning',
                result: null,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }];
        }
    }

    private async executeActionWithCapabilitiesManager(step: Step): Promise<PluginOutput[]> {
        try {
            if (step.actionVerb === 'ASK') {
                return this.handleAskStep(step.inputs);
            }

            const payload = MapSerializer.transformForSerialization(step);
            step.storeTempData('payload', payload);

            //console.log('Agent: Executing serialized action with CapabilitiesManager:', payload);

            // Add timeout and abort signal to the request
            const response = await this.authenticatedApi.post(
                `http://${this.capabilitiesManagerUrl}/executeAction`,
                payload
            );

            return MapSerializer.transformFromSerialization(response.data);
        } catch (error) {
            console.error('Error executing action with CapabilitiesManager:', error instanceof Error ? error.message : error);

            step.status = StepStatus.ERROR;

            if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || !error.response)) {
                this.status = AgentStatus.ERROR;
                await this.notifyTrafficManager();
                await this.saveAgentState();
            }

            await this.cleanupFailedStep(step);

            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error in executeActionWithCapabilitiesManager',
                result: null,
                error: error instanceof Error ? error.message : `Unknown error occurred ${error}`
            }];
        }
    }

    // Add new method to handle cleanup
    private async notifyDependents(failedStepId: string, status: StepStatus): Promise<void> {
        try {
            // First, notify dependent steps within the same agent
            const dependentSteps = this.steps.filter(step =>
                step.dependencies.some(dep => dep.sourceStepId === failedStepId)
            );

            for (const step of dependentSteps) {
                step.status = status;
                await this.cleanupFailedStep(step);
                //console.log(`Notified dependent step ${step.id} about failure of step ${failedStepId}`);
            }

            // Then, check and notify dependent agents
            const hasDependents = await this.hasDependentAgents();
            if (hasDependents) {
                try {
                    this.sendMessage(MessageType.STEP_FAILURE, 'trafficmanager', {
                        failedStepId,
                        agentId: this.id,
                        status: this.status,
                        error: `Step ${failedStepId} failed with status ${status}`
                    });

                    // Send message to TrafficManager
                    await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/handleStepFailure`, {
                        agentId: this.id,
                        stepId: failedStepId,
                        status: status
                    });

                    //console.log(`Notified TrafficManager about step failure: ${failedStepId}`);
                } catch (error) {
                    console.error('Failed to notify TrafficManager about step failure:',
                        error instanceof Error ? error.message : error
                    );
                }
            }

            // Update agent state after notifying dependents
            await this.saveAgentState();

        } catch (error) {
            console.error('Error in notifyDependents:',
                error instanceof Error ? error.message : error
            );
            // Don't throw here - we don't want notification failures to cause additional issues
        }
    }

    // Helper to get all agents in the current mission (assumes AgentSet.agents is accessible)
    private getAllAgentsInMission(): Agent[] {
        if (typeof global !== 'undefined' && (global as any).agentSetInstance) {
            const agentSet = (global as any).agentSetInstance as { agents: Map<string, Agent> };
            return Array.from(agentSet.agents.values()).filter((a: Agent) => a.missionId === this.missionId);
        }
        // Fallback: only this agent
        return [this];
    }

    // Update the cleanupFailedStep method to include proper error handling
    private async cleanupFailedStep(step: Step): Promise<void> {
        try {
            console.log(`Starting cleanup for failed step ${step.id}`);

            // Clear any temporary data
            step.clearTempData?.();

            // Save the updated state
            await this.saveAgentState();

            // Notify any dependent steps/agents
            await this.notifyDependents(step.id, StepStatus.ERROR);

            console.log(`Completed cleanup for failed step ${step.id}`);
        } catch (cleanupError) {
            console.error(`Error during step ${step.id} cleanup:`,
                cleanupError instanceof Error ? cleanupError.message : cleanupError
            );
            // Log the error but don't throw - we want to continue with other cleanup tasks
        }
    }

    async loadAgentState(): Promise<void> {
        await this.stateManager.applyState(this);
    }

    async pause() {
        console.log(`Pausing agent ${this.id}`);
        if (this.checkpointInterval) {
            clearInterval(this.checkpointInterval);
            this.checkpointInterval = null;
            console.log(`Agent ${this.id} checkpoint interval cleared due to pause.`);
        }
        if (this.currentQuestionResolve) {
            this.currentQuestionResolve(''); // Resolve with empty or specific "paused" answer
            this.currentQuestionResolve = null;
            console.log(`Agent ${this.id} current question resolved due to pause.`);
        }
        this.status = AgentStatus.PAUSED;
        await this.notifyTrafficManager();
        await this.saveAgentState();
    }

    async abort() {
        this.status = AgentStatus.ABORTED;
        await this.notifyTrafficManager();
        await this.saveAgentState();
        try {
            console.log(`Agent ${this.id} notifying AgentSet of abort status for removal.`);
            await this.authenticatedApi.post(`http://${this.agentSetUrl}/removeAgent`, { agentId: this.id, status: 'aborted' });
        } catch (error) {
            console.error(`Agent ${this.id} failed to notify AgentSet for removal after abort:`, error instanceof Error ? error.message : error);
            // Non-critical, proceed with agent functions
        }
        if (this.checkpointInterval) {
            clearInterval(this.checkpointInterval);
            this.checkpointInterval = null;
            console.log(`Agent ${this.id} checkpoint interval cleared due to abort.`);
        }
        if (this.currentQuestionResolve) {
            this.currentQuestionResolve(''); // Resolve with empty or specific "aborted" answer
            this.currentQuestionResolve = null;
            console.log(`Agent ${this.id} current question resolved due to abort.`);
        }
    }

    async resume() {
        if (this.status === AgentStatus.PAUSED || this.status === AgentStatus.INITIALIZING) {
            this.status = AgentStatus.RUNNING;
            this.setupCheckpointing(15); // Re-setup checkpointing interval, assuming 15 minutes
            console.log(`Agent ${this.id} re-setup checkpoint interval due to resume.`);
            await this.notifyTrafficManager();
            this.runAgent();
        }
    }

    // Original getMissionId method is replaced by the implementation below

    getStatus(): string {
        return this.status;
    }

    async getStatistics(): Promise<AgentStatistics> {
        console.log(`[Agent ${this.id}] Preparing statistics. Current steps count: ${this.steps.length}`);

        const stepStats = this.steps.map(step => {
            // Ensure step and its properties are defined before accessing
            const stepId = step?.id || 'unknown-id';
            const stepActionVerb = step?.actionVerb || 'undefined-actionVerb';
            const stepStatus = step?.status || StepStatus.PENDING; // Default to PENDING if status is undefined

            let dependencies: string[] = [];
            if (step?.dependencies && Array.isArray(step.dependencies)) {
                dependencies = step.dependencies.map(dep => dep?.sourceStepId || 'unknown-sourceStepId');
            }

            const stepNo = step?.stepNo || 0;

            console.log(`[Agent.getStatistics] Processing step for stats - ID: ${stepId}, ActionVerb: '${stepActionVerb}', Status: '${stepStatus}'`);

            return {
                id: stepId,
                verb: stepActionVerb, // Mapped to 'verb' for AgentStatistics interface
                status: stepStatus,
                dependencies: dependencies,
                stepNo: stepNo
            };
        }); // End of this.steps.map

        const lastStepActionVerb = this.steps.length > 0
            ? this.steps[this.steps.length - 1]?.actionVerb || 'Unknown'
            : 'Unknown';

        const statistics: AgentStatistics = {
            id: this.id,
            status: this.status,
            taskCount: this.steps.length,
            currentTaskNo: this.steps.length, // This could be more sophisticated
            currentTaskVerb: lastStepActionVerb,
            steps: stepStats,
            color: this.getAgentColor() // Assuming getAgentColor() is correctly defined elsewhere
        };

        console.log(`[Agent ${this.id}] getStatistics result: total steps = ${this.steps.length}, stepStats = ${JSON.stringify(stepStats)}`);
        return statistics;
    }

    private getAgentColor(): string {
        // Generate a consistent color based on agent ID
        let hash = 0;
        if (typeof this.id === 'string') { // Ensure this.id is a string
            for (let i = 0; i < this.id.length; i++) {
                hash = this.id.charCodeAt(i) + ((hash << 5) - hash);
            }
        }
        const hue = hash % 360;
        return `hsl(${hue}, 70%, 50%)`;
    }

    private async notifyTrafficManager(): Promise<void> {
        try {
            // Ensure this.id and this.status are defined before using them
            const agentId = this.id || 'unknown-agent-id';
            const agentStatus = this.status || AgentStatus.UNKNOWN; // Assuming AgentStatus.UNKNOWN exists or use a suitable default

            console.log(`Agent ${agentId} notifying TrafficManager of status: ${agentStatus}`);

            // Get current statistics
            // The getStatistics method is async and should be awaited.
            const stats = await this.getStatistics();

            // Ensure missionId is defined
            const missionId = this.missionId || 'unknown-mission-id';

            // Send detailed update to TrafficManager via internal message queue
            // Ensure sendMessage is correctly defined and handles async operations if necessary
            await this.sendMessage(MessageType.AGENT_UPDATE, 'trafficmanager', {
                agentId: agentId,
                status: agentStatus,
                statistics: stats, // stats should be of type AgentStatistics
                missionId: missionId,
                timestamp: new Date().toISOString()
            });

            // Also notify AgentSet via HTTP
            // Ensure this.agentSetUrl is defined and this.authenticatedApi is available and configured
            if (this.agentSetUrl && this.authenticatedApi) {
                await this.authenticatedApi.post(`http://${this.agentSetUrl}/updateFromAgent`, {
                    agentId: agentId,
                    status: agentStatus,
                    statistics: stats // Ensure stats is serializable if needed by this endpoint
                });
                console.log(`Successfully notified AgentSet at ${this.agentSetUrl}`);
            } else {
                console.warn(`[Agent ${agentId}] Could not notify AgentSet: agentSetUrl or authenticatedApi is undefined.`);
            }
        } catch (error) {
            // Use analyzeError or a similar structured logging for errors
            const agentIdForError = this.id || 'unknown-agent-id';
            if (error instanceof Error) {
                console.error(`[Agent ${agentIdForError}] Failed to notify TrafficManager: ${error.message}`, error.stack);
                analyzeError(error); // If analyzeError is available and appropriate
            } else {
                console.error(`[Agent ${agentIdForError}] Failed to notify TrafficManager with unknown error:`, error);
            }
        }
    }

    private async hasDependentAgents(): Promise<boolean> {
        try {
            if (!this.trafficManagerUrl || !this.authenticatedApi) {
                console.warn(`[Agent ${this.id || 'unknown-id'}] Cannot check dependent agents: trafficManagerUrl or authenticatedApi is undefined.`);
                return false; // Cannot determine, assume false
            }
            if (!this.id) {
                console.warn(`[Agent 'unknown-id'] Cannot check dependent agents: agent ID is undefined.`);
                return false;
            }
            const response = await this.authenticatedApi.get(`http://${this.trafficManagerUrl}/dependentAgents/${this.id}`);
            // Ensure response.data is an array before checking its length
            return Array.isArray(response?.data) && response.data.length > 0;
        } catch (error) {
            const agentIdForError = this.id || 'unknown-agent-id';
            if (error instanceof Error) {
                console.error(`[Agent ${agentIdForError}] Error checking for dependent agents: ${error.message}`, error.stack);
                analyzeError(error);
            } else {
                console.error(`[Agent ${agentIdForError}] Error checking for dependent agents with unknown error:`, error);
            }
            return false; // On error, assume no dependent agents to be safe or handle as per specific requirements
        }
    }

    setupCheckpointing(intervalMinutes: number = 15): void {
        // Clear existing interval if any
        if (this.checkpointInterval) {
            clearInterval(this.checkpointInterval);
            this.checkpointInterval = null; // Clear the ref
        }

        if (typeof intervalMinutes !== 'number' || intervalMinutes <= 0) {
            console.warn(`[Agent ${this.id || 'unknown-id'}] Invalid checkpoint interval: ${intervalMinutes}. Checkpointing disabled.`);
            return;
        }

        // Set up new interval
        this.checkpointInterval = setInterval(() => {
            this.saveAgentState()
                .catch(error => {
                    const agentIdForError = this.id || 'unknown-agent-id';
                    if (error instanceof Error) {
                        console.error(`[Agent ${agentIdForError}] Failed to create checkpoint: ${error.message}`, error.stack);
                    } else {
                        console.error(`[Agent ${agentIdForError}] Failed to create checkpoint with unknown error:`, error);
                    }
                });
        }, intervalMinutes * 60 * 1000);

        console.log(`[Agent ${this.id || 'unknown-id'}] Set up checkpointing every ${intervalMinutes} minutes.`);
    }

    async saveAgentState(): Promise<void> {
        const agentIdForLog = this.id || 'unknown-agent-id';
        try {
            if (!this.stateManager) {
                console.error(`[Agent ${agentIdForLog}] StateManager not initialized. Cannot save agent state.`);
                return;
            }
            // Ensure all properties being saved are defined or have defaults
            const stateToSave = {
                id: this.id,
                status: this.status || AgentStatus.UNKNOWN,
                steps: Array.isArray(this.steps) ? this.steps : [],
                missionId: this.missionId,
                dependencies: Array.isArray(this.dependencies) ? this.dependencies : [],
                conversation: Array.isArray(this.conversation) ? this.conversation : [],
                role: this.role || 'executor'
            };
            await this.stateManager.saveState(stateToSave);
            console.log(`[Agent ${agentIdForLog}] Saved state.`);
        } catch (error) {
            if (error instanceof Error) {
                console.error(`[Agent ${agentIdForLog}] Error saving state: ${error.message}`, error.stack);
            } else {
                console.error(`[Agent ${agentIdForLog}] Error saving state with unknown error:`, error);
            }
            // Optionally re-throw or handle as critical error
            // For now, just logging, as re-throwing might stop the agent.
        }
    }

    async getAgentState(): Promise<any> {
        const agentIdForLog = this.id || 'unknown-agent-id';
        try {
            if (!this.stateManager) {
                console.error(`[Agent ${agentIdForLog}] StateManager not initialized. Cannot get agent state.`);
                // Return a default structure if stateManager is missing
                return {
                    id: this.id,
                    status: this.status || AgentStatus.UNKNOWN,
                    missionId: this.missionId,
                    role: this.role || 'executor',
                    stepCount: Array.isArray(this.steps) ? this.steps.length : 0,
                    // Provide default empty arrays for step counts if this.steps is not an array
                    completedSteps: Array.isArray(this.steps) ? this.steps.filter(step => step?.status === StepStatus.COMPLETED).length : 0,
                    pendingSteps: Array.isArray(this.steps) ? this.steps.filter(step => step?.status === StepStatus.PENDING).length : 0,
                    runningSteps: Array.isArray(this.steps) ? this.steps.filter(step => step?.status === StepStatus.RUNNING).length : 0,
                    errorSteps: Array.isArray(this.steps) ? this.steps.filter(step => step?.status === StepStatus.ERROR).length : 0,
                    roleCustomizations: this.roleCustomizations
                };
            }

            const loadedState = await this.stateManager.loadState(this.id);
            if (loadedState) {
                return loadedState;
            }

            // Fallback to default state if loadedState is null/undefined
            console.warn(`[Agent ${agentIdForLog}] Could not load state from StateManager, returning default state representation.`);
            return {
                id: this.id,
                status: this.status || AgentStatus.UNKNOWN,
                missionId: this.missionId,
                role: this.role || 'executor',
                stepCount: Array.isArray(this.steps) ? this.steps.length : 0,
                completedSteps: Array.isArray(this.steps) ? this.steps.filter(step => step?.status === StepStatus.COMPLETED).length : 0,
                pendingSteps: Array.isArray(this.steps) ? this.steps.filter(step => step?.status === StepStatus.PENDING).length : 0,
                runningSteps: Array.isArray(this.steps) ? this.steps.filter(step => step?.status === StepStatus.RUNNING).length : 0,
                errorSteps: Array.isArray(this.steps) ? this.steps.filter(step => step?.status === StepStatus.ERROR).length : 0,
                roleCustomizations: this.roleCustomizations
            };
        } catch (error) {
            if (error instanceof Error) {
                console.error(`[Agent ${agentIdForLog}] Error in getAgentState: ${error.message}`, error.stack);
            } else {
                console.error(`[Agent ${agentIdForLog}] Error in getAgentState with unknown error:`, error);
            }
            // Return a default structure on error
            return {
                id: this.id,
                status: this.status || AgentStatus.UNKNOWN,
                error: 'Failed to retrieve agent state',
            };
        }
    }

    /**
     * Set the agent's role
     * @param roleId Role ID
     */
    setRole(roleId: string): void {
        this.role = roleId;
    }

    /**
     * Handle a collaboration message
     * @param message Collaboration message
     */
async handleCollaborationMessage(message: CollaborationMessage): Promise<void> {
    console.log(`Agent ${this.id} received collaboration message from ${message.senderId} (originated at ${message.timestamp}):`, message);

    if (!message || typeof message !== 'object' || !message.type || !message.payload) {
        console.error(`Agent ${this.id} received malformed collaboration message:`, message);
        // Optionally, send an error response or log more details
        return;
    }

    switch (message.type) {
        case CollaborationMessageType.TASK_UPDATE:
            const taskUpdatePayload = message.payload as TaskUpdatePayload;
            if (!taskUpdatePayload || !taskUpdatePayload.stepId) {
                console.error(`Agent ${this.id}: Received TASK_UPDATE with missing stepId. Payload:`, message.payload);
                this.logEvent({ eventType: 'collaboration_task_update_error', agentId: this.id, error: 'Missing stepId in TASK_UPDATE', payload: message.payload });
                break;
            }
            const stepToUpdate = this.steps.find(s => s.id === taskUpdatePayload.stepId);
            if (stepToUpdate) {
                console.log(`Agent ${this.id}: Processing TASK_UPDATE for step ${taskUpdatePayload.stepId}. Current details:`, JSON.stringify(stepToUpdate));
                let updated = false;
                if (taskUpdatePayload.status) {
                    stepToUpdate.status = taskUpdatePayload.status;
                    console.log(`Agent ${this.id}: Step ${stepToUpdate.id} status updated to ${taskUpdatePayload.status}.`);
                    updated = true;
                }
                if (taskUpdatePayload.description) {
                    stepToUpdate.description = taskUpdatePayload.description;
                    console.log(`Agent ${this.id}: Step ${stepToUpdate.id} description updated.`);
                    updated = true;
                }
                if (taskUpdatePayload.newInputs) {
                    stepToUpdate.inputs = new Map(Object.entries(taskUpdatePayload.newInputs));
                    console.log(`Agent ${this.id}: Step ${stepToUpdate.id} inputs replaced.`);
                    updated = true;
                }
                if (taskUpdatePayload.updateInputs) {
                    for (const [key, value] of Object.entries(taskUpdatePayload.updateInputs)) {
                        stepToUpdate.inputs.set(key, value);
                    }
                    console.log(`Agent ${this.id}: Step ${stepToUpdate.id} inputs updated/merged.`);
                    updated = true;
                }

                if (updated) {
                    this.logEvent({ eventType: 'collaboration_task_updated', agentId: this.id, stepId: stepToUpdate.id, changes: taskUpdatePayload });
                    // If status changed to PENDING, agent loop will pick it up.
                    // If it was RUNNING and changed to PAUSED/ERROR, effects depend on runAgent logic.
                    await this.notifyTrafficManager(); // Notify if significant changes occurred
                    await this.saveAgentState();
                } else {
                    console.log(`Agent ${this.id}: TASK_UPDATE for step ${taskUpdatePayload.stepId} resulted in no changes.`, taskUpdatePayload);
                }
            } else {
                console.warn(`Agent ${this.id}: Received TASK_UPDATE for unknown stepId: ${taskUpdatePayload.stepId}.`);
                this.logEvent({ eventType: 'collaboration_task_update_error', agentId: this.id, error: 'StepId not found for TASK_UPDATE', stepId: taskUpdatePayload.stepId });
            }
            break;
        case CollaborationMessageType.INFO_SHARE:
            this.conversation.push({
                role: `info_share_from_${message.senderId}`,
                content: JSON.stringify(message.payload)
            });
            this.logEvent({
                eventType: 'info_share_received',
                agentId: this.id,
                senderId: message.senderId,
                payload: message.payload,
                timestamp: new Date().toISOString()
            });
            console.log(`Agent ${this.id} stored INFO_SHARE from ${message.senderId}:`, message.payload);
            break;
        case CollaborationMessageType.RESOURCE_SHARE_REQUEST:
            console.log(`Agent ${this.id} received RESOURCE_SHARE_REQUEST from ${message.senderId}:`, message.payload);
            // Example: Queue or directly process resource request
            // For now, directly calling processResourceRequest if it matches expected structure.
            // This assumes message.payload is compatible with what processResourceRequest expects.
            if (message.payload && typeof message.payload === 'object' && 'id' in message.payload && 'resource' in message.payload) {
                await this.processResourceRequest(message.payload);
                // Assuming processResourceRequest might change state that needs saving, like availableResources
                await this.saveAgentState();
            } else {
                const warningMsg = `Agent ${this.id} received RESOURCE_SHARE_REQUEST with incompatible payload:`;
                console.warn(warningMsg, message.payload);
                this.logEvent({
                    eventType: 'collaboration_resource_request_payload_error',
                    agentId: this.id,
                    error: 'Incompatible payload for RESOURCE_SHARE_REQUEST',
                    payload: message.payload,
                    senderId: message.senderId,
                    timestamp: new Date().toISOString()
                });
            }
            break;
        default:
            console.warn(`Agent ${this.id} received unrecognized collaboration message type: '${(message as any).type}' from sender ${message.senderId}. Full message:`, message);
            this.logEvent({
                eventType: 'unrecognized_collaboration_message',
                agentId: this.id,
                senderId: message.senderId,
                messageType: (message as any).type,
                payload: message.payload,
                timestamp: new Date().toISOString()
            });
            break;
    }
}

    /**
     * Process a conflict resolution
     * @param resolution Conflict resolution
     */
    async processConflictResolution(resolution: ConflictResolution): Promise<void> {
        console.log(`Agent ${this.id} processing conflict resolution:`, resolution);
        this.logEvent({
            eventType: 'conflict_resolution_received',
            agentId: this.id,
            resolution: resolution,
            timestamp: new Date().toISOString()
        });

        if (!resolution || !resolution.chosenAction) {
            console.error(`Agent ${this.id}: Invalid or malformed conflict resolution data received.`, resolution);
            this.logEvent({
                eventType: 'conflict_resolution_error',
                agentId: this.id,
                error: 'Malformed resolution data',
                resolution: resolution,
                timestamp: new Date().toISOString()
            });
            return;
        }

        const { resolvedStepId, chosenAction, reasoning, stepModifications, newPlan } = resolution;

        try {
            switch (chosenAction) {
                case 'MODIFY_STEP':
                    if (!resolvedStepId || !stepModifications) {
                        console.error(`Agent ${this.id}: MODIFY_STEP action requires resolvedStepId and stepModifications.`, resolution);
                        this.logEvent({ eventType: 'conflict_resolution_error', agentId: this.id, error: 'Missing data for MODIFY_STEP', resolution });
                        return;
                    }
                    const stepToModify = this.steps.find(s => s.id === resolvedStepId);
                    if (stepToModify) {
                        console.log(`Agent ${this.id}: Modifying step ${resolvedStepId}. Current details:`, JSON.stringify(stepToModify));
                        stepToModify.applyModifications(stepModifications);
                        // Reset step status to PENDING to allow re-evaluation/re-execution
                        stepToModify.status = StepStatus.PENDING;
                        console.log(`Agent ${this.id}: Step ${resolvedStepId} modified and status set to PENDING. New details:`, JSON.stringify(stepToModify));
                        this.logEvent({ eventType: 'conflict_step_modified', agentId: this.id, stepId: resolvedStepId, modifications: stepModifications, reasoning });
                        await this.notifyTrafficManager(); // Notify about potential plan change
                    } else {
                        console.warn(`Agent ${this.id}: Step ${resolvedStepId} not found for modification.`);
                        this.logEvent({ eventType: 'conflict_resolution_error', agentId: this.id, error: 'Step not found for MODIFY_STEP', resolvedStepId });
                    }
                    break;

                case 'REPLACE_PLAN':
                    if (!newPlan || !Array.isArray(newPlan)) {
                        console.error(`Agent ${this.id}: REPLACE_PLAN action requires a newPlan array.`, resolution);
                        this.logEvent({ eventType: 'conflict_resolution_error', agentId: this.id, error: 'Missing newPlan for REPLACE_PLAN', resolution });
                        return;
                    }
                    console.log(`Agent ${this.id}: Replacing current plan with new plan containing ${newPlan.length} tasks. Reasoning: ${reasoning}`);
                    // This is a simple replacement strategy. More complex merging or targeted replacement might be needed.
                    // For instance, finding the index of resolvedStepId and replacing subsequent steps,
                    // or removing all PENDING steps and appending the new plan.
                    // Current: Remove all PENDING or RUNNING steps and append the new plan.
                    this.steps = this.steps.filter(s => s.status === StepStatus.COMPLETED || s.status === StepStatus.ERROR);
                    const startingStepNo = this.steps.length > 0 ? Math.max(...this.steps.map(s => s.stepNo)) + 1 : 1;
                    const newSteps = createFromPlan(newPlan, startingStepNo, this.agentPersistenceManager);
                    this.steps.push(...newSteps);
                    console.log(`Agent ${this.id}: Plan replaced. New step count: ${this.steps.length}.`);
                    this.logEvent({ eventType: 'conflict_plan_replaced', agentId: this.id, newPlanCount: newPlan.length, reasoning });
                    this.status = AgentStatus.RUNNING; // Ensure agent continues if it was stalled
                    await this.notifyTrafficManager(); // Notify about significant plan change
                    break;

                case 'RETRY_STEP':
                    if (!resolvedStepId) {
                        console.error(`Agent ${this.id}: RETRY_STEP action requires resolvedStepId.`, resolution);
                        this.logEvent({ eventType: 'conflict_resolution_error', agentId: this.id, error: 'Missing resolvedStepId for RETRY_STEP', resolution });
                        return;
                    }
                    const stepToRetry = this.steps.find(s => s.id === resolvedStepId);
                    if (stepToRetry) {
                        if (stepToRetry.status === StepStatus.ERROR || stepToRetry.status === StepStatus.PENDING || stepToRetry.status === StepStatus.COMPLETED) { // Allow retry for completed if resolution says so
                            stepToRetry.status = StepStatus.PENDING; // Reset to PENDING for re-execution
                            stepToRetry.clearTempData?.(); // Clear any temporary data from previous attempt
                            console.log(`Agent ${this.id}: Step ${resolvedStepId} marked for retry. Reasoning: ${reasoning}`);
                            this.logEvent({ eventType: 'conflict_step_retry', agentId: this.id, stepId: resolvedStepId, reasoning });
                            await this.notifyTrafficManager();
                        } else {
                             console.warn(`Agent ${this.id}: Step ${resolvedStepId} is not in a retryable state. Current status: ${stepToRetry.status}`);
                             this.logEvent({ eventType: 'conflict_resolution_error', agentId: this.id, error: 'Step not in retryable state for RETRY_STEP', stepId: resolvedStepId, currentStatus: stepToRetry.status });
                        }
                    } else {
                        console.warn(`Agent ${this.id}: Step ${resolvedStepId} not found for retry.`);
                        this.logEvent({ eventType: 'conflict_resolution_error', agentId: this.id, error: 'Step not found for RETRY_STEP', resolvedStepId });
                    }
                    break;

                case 'NO_CHANGE':
                    console.log(`Agent ${this.id}: Conflict resolution indicates NO_CHANGE. Reasoning: ${reasoning}`);
                    this.logEvent({ eventType: 'conflict_no_change', agentId: this.id, reasoning });
                    // Agent might need to be unblocked or its status re-evaluated if it was waiting for this resolution
                    if (this.status === AgentStatus.PAUSED || this.steps.every(s => s.status === StepStatus.COMPLETED || s.status === StepStatus.ERROR)) {
                        // If agent was paused or stuck (all steps done but agent not completed)
                        this.status = AgentStatus.RUNNING;
                        console.log(`Agent ${this.id}: Resuming/Re-evaluating operation after NO_CHANGE resolution.`);
                        // No specific step to retry, but the agent loop will pick up PENDING steps if any, or complete if all done.
                    }
                    break;

                default:
                    console.warn(`Agent ${this.id}: Unrecognized chosenAction in conflict resolution: ${(resolution as any).chosenAction}`, resolution);
                    this.logEvent({ eventType: 'conflict_resolution_error', agentId: this.id, error: 'Unrecognized chosenAction', chosenAction: (resolution as any).chosenAction });
                    break;
            }
            await this.saveAgentState(); // Save state after processing resolution
        } catch (error) {
            console.error(`Agent ${this.id}: Error processing conflict resolution:`, error, resolution);
            this.logEvent({
                eventType: 'conflict_resolution_processing_error',
                agentId: this.id,
                error: error instanceof Error ? error.message : String(error),
                resolution: resolution,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Delegate a step to a specialized agent with the appropriate role
     * @param step Step to delegate
     * @returns Result of delegation
     */
    private async delegateStepToSpecializedAgent(step: Step): Promise<{ success: boolean, result: any }> {
        const recommendedRole = step.recommendedRole || 'executor'; // Default if not specified
        this.logEvent({ eventType: 'delegation_attempt', agentId: this.id, stepId: step.id, recommendedRole });
        console.log(`Agent ${this.id}: Attempting to delegate step ${step.id} (Action: ${step.actionVerb}) to an agent with role '${recommendedRole}'.`);

        if (!this.authenticatedApi) {
            const errorMsg = `Agent ${this.id}: Authenticated API is not available for step delegation.`;
            console.error(errorMsg);
            this.logEvent({ eventType: 'delegation_error', agentId: this.id, stepId: step.id, error: errorMsg });
            return { success: false, result: { error: errorMsg } };
        }
        if (!this.agentSetUrl) {
            const errorMsg = `Agent ${this.id}: AgentSet URL is not configured for step delegation.`;
            console.error(errorMsg);
            this.logEvent({ eventType: 'delegation_error', agentId: this.id, stepId: step.id, error: errorMsg });
            return { success: false, result: { error: errorMsg } };
        }

        const delegationRequest = {
            taskId: uuidv4(), // Unique ID for this delegation task
            taskType: step.actionVerb,
            description: step.description || `Execute ${step.actionVerb} for step ${step.id}`,
            inputs: MapSerializer.transformForSerialization(step.inputs),
            priority: 'normal', // This could be configurable or based on step priority
            context: {
                sourceAgentId: this.id,
                sourceStepId: step.id,
                recommendedRole: recommendedRole,
                missionId: this.missionId
            }
        };

        let findAgentResponse;
        try {
            console.log(`Agent ${this.id}: Attempting to find agent with role '${recommendedRole}' via AgentSet: ${this.agentSetUrl}`);
            findAgentResponse = await this.authenticatedApi.post(`http://${this.agentSetUrl}/findAgentWithRole`, {
                roleId: recommendedRole,
                missionId: this.missionId
                // We could add other criteria like 'available', 'not_overloaded' in the future
            });

            if (!findAgentResponse || findAgentResponse.status < 200 || findAgentResponse.status >= 300) {
                const errorMsg = `Failed to find agent: AgentSet returned status ${findAgentResponse?.status}. Response: ${JSON.stringify(findAgentResponse?.data)}`;
                console.error(`Agent ${this.id}: ${errorMsg}`);
                this.logEvent({ eventType: 'delegation_find_agent_failed', agentId: this.id, stepId: step.id, recommendedRole, responseStatus: findAgentResponse?.status, responseData: findAgentResponse?.data });
                return { success: false, result: { error: errorMsg, details: findAgentResponse?.data } };
            }

            if (!findAgentResponse.data || !findAgentResponse.data.agentId) {
                const errorMsg = `No agent found with role '${recommendedRole}' for mission ${this.missionId}.`;
                console.log(`Agent ${this.id}: ${errorMsg}`);
                this.logEvent({ eventType: 'delegation_no_agent_found', agentId: this.id, stepId: step.id, recommendedRole });
                return { success: false, result: { error: errorMsg } };
            }

        } catch (error) {
            const errorMsg = `Error during findAgentWithRole call for role '${recommendedRole}'.`;
            console.error(`Agent ${this.id}: ${errorMsg}`, error);
            analyzeError(error as Error);
            this.logEvent({ eventType: 'delegation_find_agent_exception', agentId: this.id, stepId: step.id, recommendedRole, errorMessage: (error as Error).message });
            return { success: false, result: { error: errorMsg, exception: (error as Error).message } };
        }

        const recipientId = findAgentResponse.data.agentId; // Assuming agentId is the correct field
        console.log(`Agent ${this.id}: Found agent '${recipientId}' with role '${recommendedRole}'. Attempting to delegate task for step ${step.id}.`);

        try {
            const delegationResponse = await this.authenticatedApi.post(`http://${this.agentSetUrl}/delegateTask`, {
                delegatorId: this.id,
                recipientId: recipientId,
                request: delegationRequest
            });

            if (!delegationResponse || delegationResponse.status < 200 || delegationResponse.status >= 300) {
                const errorMsg = `Delegation to agent '${recipientId}' failed: AgentSet returned status ${delegationResponse?.status}. Response: ${JSON.stringify(delegationResponse?.data)}`;
                console.error(`Agent ${this.id}: ${errorMsg}`);
                this.logEvent({ eventType: 'delegation_delegate_task_failed', agentId: this.id, stepId: step.id, recipientId, responseStatus: delegationResponse?.status, responseData: delegationResponse?.data });
                return { success: false, result: { error: errorMsg, details: delegationResponse?.data } };
            }

            if (delegationResponse.data && delegationResponse.data.accepted) {
                const successMsg = `Successfully delegated step ${step.id} to agent '${recipientId}'. Task ID: ${delegationResponse.data.taskId}`;
                console.log(`Agent ${this.id}: ${successMsg}`);
                this.logEvent({ eventType: 'delegation_success', agentId: this.id, stepId: step.id, recipientId, delegatedTaskId: delegationResponse.data.taskId });
                return {
                    success: true,
                    result: {
                        taskId: delegationResponse.data.taskId,
                        recipientId: recipientId,
                        estimatedCompletion: delegationResponse.data.estimatedCompletion // Assuming this field exists
                    }
                };
            } else {
                const reason = delegationResponse.data?.reason || 'No reason provided.';
                const errorMsg = `Agent '${recipientId}' rejected delegation for step ${step.id}. Reason: ${reason}`;
                console.log(`Agent ${this.id}: ${errorMsg}`);
                this.logEvent({ eventType: 'delegation_rejected', agentId: this.id, stepId: step.id, recipientId, reason });
                return { success: false, result: { error: errorMsg, reason } };
            }

        } catch (error) {
            const errorMsg = `Error during delegateTask call to agent '${recipientId}' for step ${step.id}.`;
            console.error(`Agent ${this.id}: ${errorMsg}`, error);
            analyzeError(error as Error);
            this.logEvent({ eventType: 'delegation_delegate_task_exception', agentId: this.id, stepId: step.id, recipientId, errorMessage: (error as Error).message });
            return { success: false, result: { error: errorMsg, exception: (error as Error).message } };
        }
    }

    /**
     * Generate a vote for a conflict (production-ready)
     * @param conflict Conflict
     * @returns Vote
     */
    async generateConflictVote(conflict: any): Promise<{ vote: string, explanation: string, chosenOptionDetails?: any }> {
        const agentRole = this.role || 'undefined'; // Handle case where role might not be set
        this.logEvent({ eventType: 'conflict_vote_generation_started', agentId: this.id, conflictId: conflict?.id, agentRole });

        if (!conflict || typeof conflict !== 'object') {
            const explanation = `Agent ${this.id} (${agentRole}) abstains: Invalid conflict data received.`;
            console.warn(explanation, conflict);
            this.logEvent({ eventType: 'conflict_vote_abstain_invalid_data', agentId: this.id, conflictId: conflict?.id, reason: explanation });
            return { vote: 'abstain', explanation };
        }

        if (!Array.isArray(conflict.options) || conflict.options.length === 0) {
            const explanation = `Agent ${this.id} (${agentRole}) abstains: No valid options provided in conflict ${conflict.id || 'N/A'}.`;
            console.warn(explanation, conflict.options);
            this.logEvent({ eventType: 'conflict_vote_abstain_no_options', agentId: this.id, conflictId: conflict.id, reason: explanation });
            return { vote: 'abstain', explanation };
        }

        // Enhanced logic:
        // 1. Try to find an option that explicitly matches the agent's role (case-insensitive).
        // 2. If no role match, check if any option contains keywords related to common preferred actions (e.g., "retry", "modify_conservative").
        // 3. If still no match, fall back to the first option or a predefined default like "abstain" or a "least_impact" option if identifiable.
        // For this enhancement, we'll stick to role match and then first option, but with better logging and structure.

        let chosenOption: any = null;
        let explanation = '';

        const roleBasedOption = conflict.options.find((opt: any) =>
            opt && typeof opt.action === 'string' && opt.action.toLowerCase().includes(agentRole.toLowerCase())
        );

        if (roleBasedOption) {
            chosenOption = roleBasedOption;
            explanation = `Agent ${this.id} (Role: ${agentRole}) voted for option based on role match. Option: ${JSON.stringify(chosenOption)}`;
        } else {
            // Fallback to the first valid option if no role match
            chosenOption = conflict.options[0];
            explanation = `Agent ${this.id} (Role: ${agentRole}) voted for the first available option as no direct role match found. Option: ${JSON.stringify(chosenOption)}`;
        }

        // Ensure chosenOption has a 'value' or similar property to cast to a vote string
        // This depends on the actual structure of 'conflict.options' items.
        // Assuming options are objects like { value: "action_X", details: {...} } or simple strings.
        let voteValue: string;
        if (typeof chosenOption === 'string') {
            voteValue = chosenOption;
        } else if (chosenOption && typeof chosenOption.value === 'string') {
            voteValue = chosenOption.value;
        } else if (chosenOption && typeof chosenOption.action === 'string') { // If option itself is the action string
            voteValue = chosenOption.action;
        }
        else {
            // If the chosenOption structure is unknown or doesn't yield a clear vote string
            explanation = `Agent ${this.id} (${agentRole}) abstains: Chosen option structure is unrecognized or lacks a clear vote value. Fallback option: ${JSON.stringify(chosenOption)}`;
            console.warn(explanation, conflict);
            this.logEvent({ eventType: 'conflict_vote_abstain_unclear_option', agentId: this.id, conflictId: conflict.id, reason: explanation, chosenOption });
            return { vote: 'abstain', explanation };
        }

        console.log(`Agent ${this.id}: Conflict vote generated. Vote: '${voteValue}'. Explanation: ${explanation}`);
        this.logEvent({
            eventType: 'conflict_vote_generated',
            agentId: this.id,
            conflictId: conflict.id,
            vote: voteValue,
            explanation,
            chosenOptionDetails: typeof chosenOption === 'object' ? chosenOption : { value: chosenOption }
        });

        return {
            vote: voteValue,
            explanation,
            chosenOptionDetails: typeof chosenOption === 'object' ? chosenOption : { value: chosenOption }
        };
    }

    /**
     * Handle coordination
     * @param coordination Coordination
     */
    async handleCoordination(coordination: CoordinationData): Promise<void> {
        console.log(`Agent ${this.id} received coordination data from ${coordination.senderId}:`, coordination);
        this.logEvent({
            eventType: 'coordination_received',
            agentId: this.id,
            coordinationData: coordination,
            timestamp: new Date().toISOString()
        });

        if (!coordination || !coordination.type) {
            console.error(`Agent ${this.id}: Invalid or malformed coordination data received.`, coordination);
            this.logEvent({
                eventType: 'coordination_error',
                agentId: this.id,
                error: 'Malformed coordination data',
                coordinationData: coordination,
                timestamp: new Date().toISOString()
            });
            return;
        }

        try {
            switch (coordination.type) {
                case CoordinationType.SYNC_STATE:
                    console.log(`Agent ${this.id}: Processing SYNC_STATE from ${coordination.senderId}. Payload:`, coordination.payload);
                    // For now, just logging what might be shared or requested.
                    // Example: If payload requests specific state keys:
                    if (coordination.payload?.requestedStateKeys && Array.isArray(coordination.payload.requestedStateKeys)) {
                        const stateToSend: Record<string, any> = {};
                        for (const key of coordination.payload.requestedStateKeys) {
                            if (Object.prototype.hasOwnProperty.call(this, key)) {
                                stateToSend[key] = (this as any)[key];
                            } else if (this.sharedKnowledge.has(key)) {
                                stateToSend[key] = this.sharedKnowledge.get(key);
                            } else {
                                stateToSend[key] = null; // Or some indicator that key is not found
                            }
                        }
                        console.log(`Agent ${this.id}: Sending requested state for keys: ${coordination.payload.requestedStateKeys.join(', ')} to ${coordination.senderId}.`);
                        await this.sendMessage(
                            MessageType.COORDINATION_MESSAGE,
                            coordination.senderId,
                            {
                                type: 'SYNC_STATE_RESPONSE',
                                originalSignalId: coordination.signalId,
                                payload: stateToSend,
                                timestamp: new Date().toISOString()
                            }
                        );
                        this.logEvent({ eventType: 'coordination_sync_state_sent', agentId: this.id, recipientId: coordination.senderId, requestedKeys: coordination.payload.requestedStateKeys, stateSent: stateToSend });
                    } else if (coordination.payload?.sharedState && typeof coordination.payload.sharedState === 'object') {
                        console.log(`Agent ${this.id}: Received shared state from ${coordination.senderId}:`, coordination.payload.sharedState);
                        for (const [key, value] of Object.entries(coordination.payload.sharedState)) {
                            this.sharedKnowledge.set(key, value);
                        }
                        this.logEvent({ eventType: 'coordination_shared_state_received', agentId: this.id, senderId: coordination.senderId, sharedState: coordination.payload.sharedState });
                        // Potentially save state if sharedKnowledge is critical to persist immediately
                        // await this.saveAgentState(); // Decided to save at the end of handleCoordination
                    } else {
                        console.log(`Agent ${this.id}: General SYNC_STATE received without specific sharedState or requestedStateKeys. Current status: ${this.status}`);
                    }
                    this.logEvent({ eventType: 'coordination_sync_state_processed', agentId: this.id, senderId: coordination.senderId, payload: coordination.payload });
                    break;

                case CoordinationType.AWAIT_SIGNAL:
                    const signalId = coordination.signalId || 'default_signal';
                    console.log(`Agent ${this.id}: Processing AWAIT_SIGNAL for signalId '${signalId}' from ${coordination.senderId}.`);

                    if (coordination.payload?.signalReceived && coordination.payload.signalId === signalId) {
                        console.log(`Agent ${this.id}: Signal '${signalId}' has been received from ${coordination.senderId}!`);
                        let unpausedSteps = 0;
                        this.steps.forEach(step => {
                            if (step.awaitsSignal === signalId && step.status === StepStatus.PAUSED) {
                                step.status = StepStatus.PENDING;
                                console.log(`Agent ${this.id}: Step ${step.id} unpaused and set to PENDING as signal '${signalId}' received.`);
                                this.logEvent({ eventType: 'step_unpaused_by_signal', agentId: this.id, stepId: step.id, signalId });
                                unpausedSteps++;
                            }
                        });
                        if (unpausedSteps > 0) {
                            await this.notifyTrafficManager(); // Notify if steps were unpaused
                        }
                    } else {
                        // Logic for agent or step to enter a PAUSED state upon receiving an AWAIT_SIGNAL (without signalReceived)
                        // This is more complex: requires identifying which step should pause, or if the agent itself should.
                        // For now, we log that an await signal was registered if a step is already configured for it.
                        const waitingStep = this.steps.find(step => step.awaitsSignal === signalId && (step.status === StepStatus.PENDING || step.status === StepStatus.PAUSED));
                        if (waitingStep) {
                            console.log(`Agent ${this.id}: Step ${waitingStep.id} is noted to be awaiting signal '${signalId}'. If not already PAUSED, its execution logic should handle pausing.`);
                             // A step's own execution logic would typically set itself to PAUSED if it determines it needs to wait for this signal.
                        } else {
                            console.log(`Agent ${this.id}: Received AWAIT_SIGNAL for '${signalId}', but no specific step is currently configured to await it or in a PAUSED state for it. This signal might be for future steps or agent-level coordination.`);
                        }
                    }
                    this.logEvent({ eventType: 'coordination_await_signal_processed', agentId: this.id, senderId: coordination.senderId, signalId, payload: coordination.payload });
                    break;

                case CoordinationType.PROVIDE_INFO:
                    console.log(`Agent ${this.id}: Processing PROVIDE_INFO request from ${coordination.senderId}. Requested info keys:`, coordination.infoKeys);
                    if (coordination.infoKeys && coordination.infoKeys.length > 0) {
                        const infoPayload: any = {};
                        for (const key of coordination.infoKeys) {
                            // Retrieve info from agent's state, conversation, or work products
                            if (key === 'status') infoPayload.status = this.status;
                            else if (key === 'currentStep') infoPayload.currentStep = this.steps.find(s => s.status === StepStatus.RUNNING)?.id;
                            else if (key === 'lastCompletedStep') infoPayload.lastCompletedStep = this.steps.filter(s => s.status === StepStatus.COMPLETED).pop()?.id;
                            // Add more complex info retrieval logic as needed, e.g., from work products
                            // else if (key.startsWith('workProduct_')) { // Example for future extension
                            //     const stepId = key.substring('workProduct_'.length);
                            //     const wp = await this.agentPersistenceManager.loadWorkProduct(this.id, stepId);
                            //     if (wp) infoPayload[key] = wp.data;
                            // }
                            else if (this.sharedKnowledge.has(key)) { // Check sharedKnowledge
                                infoPayload[key] = this.sharedKnowledge.get(key);
                            }
                            else {
                                infoPayload[key] = `Information for key '${key}' not readily available or not implemented.`;
                            }
                        }
                        console.log(`Agent ${this.id}: Attempting to send requested info to ${coordination.senderId}:`, infoPayload);
                        await this.sendMessage(
                            MessageType.COORDINATION_MESSAGE,
                            coordination.senderId,
                            {
                                type: 'PROVIDE_INFO_RESPONSE',
                                originalSignalId: coordination.signalId,
                                payload: infoPayload,
                                timestamp: new Date().toISOString()
                            }
                        );
                        this.logEvent({ eventType: 'coordination_provide_info_sent', agentId: this.id, recipientId: coordination.senderId, requestedKeys: coordination.infoKeys, providedInfo: infoPayload });

                    } else {
                        console.warn(`Agent ${this.id}: PROVIDE_INFO request from ${coordination.senderId} had no infoKeys specified.`);
                        this.logEvent({ eventType: 'coordination_error', agentId: this.id, error: 'Missing infoKeys for PROVIDE_INFO', senderId: coordination.senderId });
                    }
                    break;

                default:
                    console.warn(`Agent ${this.id}: Unrecognized coordination type: ${(coordination as any).type} from ${coordination.senderId}. Full data:`, coordination);
                    this.logEvent({ eventType: 'coordination_error', agentId: this.id, error: 'Unrecognized coordination type', coordinationType: (coordination as any).type, senderId: coordination.senderId });
                    break;
            }
            await this.saveAgentState();
        } catch (error) {
            console.error(`Agent ${this.id}: Error processing coordination data from ${coordination.senderId}:`, error, coordination);
            this.logEvent({
                eventType: 'coordination_processing_error',
                agentId: this.id,
                error: error instanceof Error ? error.message : String(error),
                coordinationData: coordination,
                timestamp: new Date().toISOString()
            });
        }
    }

    /**
     * Process a resource request
     * @param request Resource request
     * @returns Resource response
     */
    async processResourceRequest(request: { id: string, resource: string, amount?: number }): Promise<{ requestId: string, granted: boolean, resource: string, message?: string, reason?: string }> {
        console.log(`Agent ${this.id} received resource request:`, request);
        this.logEvent({
            eventType: 'resource_request_received',
            agentId: this.id,
            request,
            timestamp: new Date().toISOString()
        });

        const { id: requestId, resource, amount = 1 } = request; // Default amount to 1 if not specified

        if (!resource || typeof resource !== 'string') {
            const msg = `Malformed resource request: 'resource' field is missing or invalid.`;
            console.error(`Agent ${this.id}: ${msg}`, request);
            this.logEvent({ eventType: 'resource_request_error', agentId: this.id, error: msg, request });
            return { requestId: requestId || 'unknown', granted: false, resource: resource || 'unknown', reason: msg };
        }

        if (typeof amount !== 'number' || amount <= 0) {
            const msg = `Malformed resource request: 'amount' field must be a positive number. Received: ${amount}`;
            console.error(`Agent ${this.id}: ${msg}`, request);
            this.logEvent({ eventType: 'resource_request_error', agentId: this.id, error: msg, request });
            return { requestId: requestId || 'unknown', granted: false, resource, reason: msg };
        }

        if (!this.manageableResources.includes(resource)) {
            const reason = `Resource type '${resource}' is not managed by this agent.`;
            console.log(`Agent ${this.id}: ${reason}`);
            this.logEvent({ eventType: 'resource_request_denied', agentId: this.id, requestId, resource, reason });
            return { requestId, granted: false, resource, reason };
        }

        const currentAmount = this.availableResources.get(resource) || 0;
        if (currentAmount >= amount) {
            this.availableResources.set(resource, currentAmount - amount);
            const message = `Resource '${resource}' (amount: ${amount}) granted. Remaining: ${this.availableResources.get(resource)}.`;
            console.log(`Agent ${this.id}: ${message}`);
            this.logEvent({ eventType: 'resource_request_granted', agentId: this.id, requestId, resource, amountGranted: amount, remaining: this.availableResources.get(resource) });
            return { requestId, granted: true, resource, message };
        } else {
            const reason = `Resource type '${resource}' is currently unavailable or insufficient amount. Requested: ${amount}, Available: ${currentAmount}.`;
            console.log(`Agent ${this.id}: ${reason}`);
            this.logEvent({ eventType: 'resource_request_denied', agentId: this.id, requestId, resource, reason, requestedAmount: amount, availableAmount: currentAmount });
            return { requestId, granted: false, resource, reason };
        }
    }

    /**
     * Process a resource response
     * @param response Resource response
     * @param requestId Request ID
     */
    async processResourceResponse(response: ResourceResponse): Promise<void> {
        console.log(`Agent ${this.id} received resource response from ${response.senderId}:`, response);
        this.logEvent({
            eventType: 'resource_response_received',
            agentId: this.id,
            response,
            timestamp: new Date().toISOString()
        });

        const { requestId, granted, resource, data, message } = response;

        const pendingRequestInfo = this.pendingResourceRequests.get(requestId);

        if (!pendingRequestInfo) {
            console.warn(`Agent ${this.id}: Received resource response for an unknown or already processed requestId: ${requestId}. Ignoring.`);
            this.logEvent({ eventType: 'resource_response_orphaned', agentId: this.id, requestId, response });
            return;
        }

        if (granted) {
            console.log(`Agent ${this.id}: Resource request ${requestId} for '${resource}' was GRANTED. Data:`, data);
            this.logEvent({ eventType: 'resource_response_granted', agentId: this.id, requestId, resource, data, messageFromSender: message });

            // Store/use the granted resource data
            if (data) {
                console.log(`Agent ${this.id}: Storing granted resource data for request ${requestId}. Associated step: ${pendingRequestInfo.stepId}. Data:`, data);
                const targetStep = this.steps.find(s => s.id === pendingRequestInfo.stepId);
                if (targetStep) {
                    // Ensure inputs map exists
                    if (!targetStep.inputs) {
                        targetStep.inputs = new Map<string, PluginInput>();
                    }
                    targetStep.inputs.set(`granted_${resource}_${requestId}`, { inputName: `granted_${resource}_${requestId}`, inputValue: data, args: {} });

                    // If the step was PAUSED specifically for this resource, getting data might make it PENDING.
                    // The subsequent block handles unblocking PAUSED steps.
                    // This logging confirms data application.
                    console.log(`Agent ${this.id}: Updated inputs for step ${targetStep.id} with granted resource data. Current status: ${targetStep.status}.`);
                    this.logEvent({ eventType: 'step_inputs_updated_by_resource', agentId: this.id, stepId: targetStep.id, requestId, resource });
                } else {
                    console.warn(`Agent ${this.id}: Step ${pendingRequestInfo.stepId} not found to apply granted resource data.`);
                    this.logEvent({ eventType: 'resource_data_step_not_found', agentId: this.id, stepId: pendingRequestInfo.stepId, requestId });
                }
            }

            // Unblock the step that was waiting for this resource
            const waitingStep = this.steps.find(s => s.id === pendingRequestInfo.stepId);
            if (waitingStep && waitingStep.status === StepStatus.PAUSED) { // Assuming a PAUSED status for steps waiting on resources
                waitingStep.status = StepStatus.PENDING; // Or RUNNING if it can proceed immediately
                console.log(`Agent ${this.id}: Unblocked step ${waitingStep.id} which was waiting for resource ${resource} (request ${requestId}).`);
                this.logEvent({ eventType: 'step_unblocked_by_resource', agentId: this.id, stepId: waitingStep.id, requestId, resource });
                // Potentially notify TrafficManager if agent status changes or to re-evaluate agent's ability to run
                await this.notifyTrafficManager();
            }
        } else {
            console.warn(`Agent ${this.id}: Resource request ${requestId} for '${resource}' was DENIED. Reason: ${message || 'No reason provided'}`);
            this.logEvent({ eventType: 'resource_response_denied', agentId: this.id, requestId, resource, reason: message });

            // Consider re-planning or alternative actions
            console.log(`Agent ${this.id}: Considering re-planning due to denial of resource ${resource} for step ${pendingRequestInfo.stepId}.`);
            // This might involve:
            // - Marking the original step as FAILED or BLOCKED.
            // - Triggering a new planning phase (e.g., using useBrainForReasoning with context of failure).
            // - Or, if the step has defined alternatives, try those.
            const affectedStep = this.steps.find(s => s.id === pendingRequestInfo.stepId);
            if (affectedStep) {
                affectedStep.status = StepStatus.ERROR; // Mark step as errored due to resource denial
                this.logEvent({ eventType: 'step_failed_resource_denial', agentId: this.id, stepId: affectedStep.id, requestId, resource });

                // Trigger re-planning
                console.warn(`Agent ${this.id}: Step ${affectedStep.id} marked as ERROR due to resource denial for request ${requestId}. Triggering re-planning.`);
                this.status = AgentStatus.PLANNING; // Set agent status to initiate re-planning
                await this.notifyTrafficManager(); // Important to signal change, including new agent status
            }
        }

        this.pendingResourceRequests.delete(requestId); // Clean up the pending request
        await this.saveAgentState();
    }

    /**
     * Get the agent's action verb
     * @returns Action verb
     */
    getActionVerb(): string {
        return this.steps[0]?.actionVerb || '';
    }

    /**
     * Get the agent's role
     * @returns The agent's role
     */
    getRole(): string {
        return this.role;
    }

    /**
     * Get the agent's mission ID
     * @returns Mission ID
     */
    getMissionId(): string {
        return this.missionId;
    }

    /**
     * Get the agent's mission context
     * @returns Mission context
     */
    getMissionContext(): string {
        return this.missionContext;
    }

    /**
     * Get the agent's steps
     * @returns Steps
     */
    getSteps(): Step[] {
        return this.steps;
    }

    /**
     * Execute a plan template directly
     * This creates a new step that executes the plan template
     * @param templateId - The ID of the plan template to execute
     * @param inputs - Inputs for the plan template
     * @param executionMode - Execution mode (automatic, interactive, debug)
     * @returns Promise resolving to the execution result
     */
    async executePlanTemplate(templateId: string, inputs: any, executionMode: string = 'automatic'): Promise<PluginOutput[]> {
        console.log(`Agent ${this.id} executing plan template: ${templateId}`);

        // Create a new step for plan template execution
        const planStep = new Step({
            actionVerb: 'EXECUTE_PLAN_TEMPLATE',
            stepNo: this.steps.length + 1,
            inputs: new Map([
                ['templateId', { inputName: 'templateId', inputValue: templateId, args: {} }],
                ['inputs', { inputName: 'inputs', inputValue: inputs, args: {} }],
                ['userId', { inputName: 'userId', inputValue: this.id, args: {} }],
                ['executionMode', { inputName: 'executionMode', inputValue: executionMode, args: {} }]
            ]),
            description: `Execute plan template: ${templateId}`,
            persistenceManager: this.agentPersistenceManager
        });

        // Add the step to the agent's steps
        this.steps.push(planStep);

        // Execute the step
        const result = await planStep.execute(
            this.executeActionWithCapabilitiesManager.bind(this),
            this.useBrainForReasoning.bind(this),
            this.createSubAgent.bind(this),
            this.handleAskStep.bind(this)
        );

        // Save the work product
        // For a planStep executed this way, it's considered an endpoint for this agent's current flow.
        const isAgentEndpointForPlan = planStep.isEndpoint(this.steps);
        const hasDependentsForPlan = await this.hasDependentAgents();
        await this.saveWorkProductWithClassification(planStep.id, result, isAgentEndpointForPlan, this.getAllAgentsInMission());

        console.log(`Agent ${this.id} completed plan template execution: ${templateId}`);
        return result;
    }

    /**
     * Monitor a plan template execution
     * @param executionId - The execution ID to monitor
     * @returns Promise resolving to the final execution context
     */
    async monitorPlanExecution(executionId: string): Promise<PlanExecutionContext | null> {
        console.log(`Agent ${this.id} monitoring plan execution: ${executionId}`);

        let attempts = 0;
        const maxAttempts = 120; // 2 minutes with 1-second intervals

        while (attempts < maxAttempts) {
            try {
                const response = await this.authenticatedApi.get(`http://${this.capabilitiesManagerUrl}/executions/${executionId}`);
                const context: PlanExecutionContext = response.data;

                if (context.status === 'completed' || context.status === 'failed') {
                    console.log(`Plan execution ${executionId} finished with status: ${context.status}`);
                    return context;
                }

                // Wait 1 second before checking again
                await new Promise(resolve => setTimeout(resolve, 1000));
                attempts++;

            } catch (error) {
                console.error(`Error monitoring plan execution ${executionId}:`, error instanceof Error ? error.message : error);
                attempts++;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        console.warn(`Plan execution monitoring timed out for ${executionId}`);
        return null;
    }

    /**
     * Execute a plan template and wait for completion
     * @param templateId - The ID of the plan template to execute
     * @param inputs - Inputs for the plan template
     * @param executionMode - Execution mode (automatic, interactive, debug)
     * @returns Promise resolving to the final execution context
     */
    async executePlanTemplateAndWait(templateId: string, inputs: any, executionMode: string = 'automatic'): Promise<PlanExecutionContext | null> {
        console.log(`Agent ${this.id} executing plan template and waiting: ${templateId}`);

        // Execute the plan template
        const result = await this.executePlanTemplate(templateId, inputs, executionMode);

        // Extract the execution ID from the result
        const executionResult = result.find(r => r.name === 'planExecution');
        if (!executionResult || !executionResult.success) {
            console.error('Failed to start plan template execution');
            return null;
        }

        const executionData = executionResult.result as any;
        const executionId = executionData.executionId;

        if (!executionId) {
            console.error('No execution ID returned from plan template execution');
            return null;
        }

        // Monitor the execution until completion
        return await this.monitorPlanExecution(executionId);
    }
}