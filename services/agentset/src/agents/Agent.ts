import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import axios from 'axios';
import { AgentStatus } from '../utils/agentStatus';
import { getServiceUrls } from '../utils/postOfficeInterface';
import { WorkProduct } from '../utils/WorkProduct';
import { MapSerializer, BaseEntity } from '@cktmcs/shared';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { PluginOutput, PluginParameterType, InputValue, ExecutionContext as PlanExecutionContext } from '@cktmcs/shared';
import { ActionVerbTask } from '@cktmcs/shared';
import { AgentConfig, AgentStatistics } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { Step, StepStatus, createFromPlan } from './Step';
import { StateManager } from '../utils/StateManager';


export class Agent extends BaseEntity {
    private missionContext: string = '';
    private agentSetUrl: string;
    private agentPersistenceManager: AgentPersistenceManager;
    private stateManager: StateManager;
    inputValues: Map<string, InputValue> | undefined;
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

    // Properties for lifecycle management
    private checkpointInterval: NodeJS.Timeout | null = null;

    private currentQuestionResolve: ((value: string) => void) | null = null;

    constructor(config: AgentConfig) {
        super(config.id, 'AgentSet', `agentset`, process.env.PORT || '9000');
        console.log(`Agent ${config.id} created. missionId=${config.missionId}. Inputs: ${JSON.stringify(config.inputValues)}` );
        this.agentPersistenceManager = new AgentPersistenceManager();
        this.stateManager = new StateManager(config.id, this.agentPersistenceManager);
        this.inputValues = config.inputValues instanceof Map ? config.inputValues : new Map(Object.entries(config.inputValues||{}));
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
            inputValues: this.inputValues,
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
            inputValues: MapSerializer.transformForSerialization(this.inputValues),
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

                        result = await step.execute(
                            this.executeActionWithCapabilitiesManager.bind(this),
                            this.useBrainForReasoning.bind(this),
                            this.createSubAgent.bind(this),
                            this.handleAskStep.bind(this)
                        );

                        console.log(`Step ${step.actionVerb} result:`, result);
                        this.say(`Completed step: ${step.actionVerb}`);

                        if (result[0]?.resultType === PluginParameterType.PLAN) {
                            const planningStepResult = result[0]?.result; // Added optional chaining here for safety
                            let actualPlanArray: ActionVerbTask[] | undefined = undefined;
                            let planSourceDescription = "direct array"; // For logging

                            if (Array.isArray(planningStepResult)) {
                                actualPlanArray = planningStepResult as ActionVerbTask[];
                            } else if (typeof planningStepResult === 'object' && planningStepResult !== null) {
                                if (planningStepResult.plan && Array.isArray(planningStepResult.plan)) {
                                    console.log(`[Agent.ts] runAgent (${this.id}): Plan received is a direct array. Using it directly.`);
                                    actualPlanArray = planningStepResult.plan as ActionVerbTask[];
                                    planSourceDescription = "direct array";
                                } else {
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

            // if (this.status === AgentStatus.COMPLETED) {
            //     // The agent is now retained in the agent set for statistical purposes.
            //     // The call to remove the agent from the agent set has been removed.
            //     console.log(`Agent ${this.id} has completed. It will be retained in the AgentSet.`);
            // }
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
                    step.inputValues.set(dep.inputName, {
                        inputName: dep.inputName,
                        value: outputValue,
                        valueType: PluginParameterType.STRING,
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

    private async handleAskStep(inputs: Map<string, InputValue>): Promise<PluginOutput[]> {
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
        const question = input.value || input.args?.question;
        const choices = input.args?.choices;
        const timeout = input.args?.timeout || 300000; // Default timeout of 5 minutes if not specified

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

    private async createSubAgent(inputs: Map<string, InputValue>): Promise<PluginOutput[]> {
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
            const roleId = inputs.get('roleId')?.value as string;
            if (roleId) {
                newInputs.delete('roleId');
            }

            // Check if role customizations are specified
            const roleCustomizations = inputs.get('roleCustomizations')?.value;
            if (roleCustomizations) {
                newInputs.delete('roleCustomizations');
            }

            // Check if a recommended role is specified in the task
            const recommendedRole = inputs.get('recommendedRole')?.value as string;
            if (recommendedRole) {
                newInputs.delete('recommendedRole');
            }

            // Determine the final role to use (explicit roleId takes precedence over recommendedRole)
            const finalRoleId = roleId || recommendedRole || 'executor'; // Default to executor if no role is specified

            const subAgentId = uuidv4();
            const subAgentConfig = {
                agentId: subAgentId,
                actionVerb: 'ACCOMPLISH',
                inputValues: MapSerializer.transformForSerialization(newInputs),
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

    private async useBrainForReasoning(inputs: Map<string, InputValue>): Promise<PluginOutput[]> {
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
        const prompt = inputs.get('prompt')?.value as string;
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

        const optimization = (inputs.get('optimization')?.value as string) || 'accuracy';
        const ConversationType = (inputs.get('ConversationType')?.value as string) || 'text/text';

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
            exchanges: [...this.conversation, { role: 'user', content: prompt }], // Combine history with current prompt
            optimization: optimization,
            ConversationType: ConversationType,
            // Optionally include missionContext directly if not already in openingInstruction
            // missionContext: this.missionContext
        };
        console.log(`[Agent ${this.id}] useBrainForReasoning: Sending exchanges to Brain:`, JSON.stringify(reasoningInput.exchanges, null, 2));

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
                return this.handleAskStep(step.inputValues);
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
        // if (this.status === AgentStatus.ABORTED) {
        //     // The agent is now retained in the agent set for statistical purposes.
        //     // The call to remove the agent from the agent set has been removed.
        //     console.log(`Agent ${this.id} has aborted. It will be retained in the AgentSet.`);
        // }
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

    getStatus(): string {
        return this.status;
    }

    async getStatistics(globalStepMap?: Map<string, { agentId: string, step: any }>): Promise<AgentStatistics> {

        const stepStats = this.steps.map(step => {
            // Ensure step and its properties are defined before accessing
            const stepId = step?.id || 'unknown-id';
            const stepActionVerb = step?.actionVerb || 'undefined-actionVerb';
            const stepStatus = step?.status || StepStatus.PENDING; // Default to PENDING if status is undefined

            let dependencies: string[] = [];
            if (step?.dependencies && Array.isArray(step.dependencies)) {
                dependencies = step.dependencies.map(dep => dep?.sourceStepId || 'unknown-sourceStepId');
            }
            // If a globalStepMap is provided, include any additional dependencies found there
            if (globalStepMap) {
                // Optionally, you could enhance this to include cross-agent dependencies if not already present
                // For now, we assume step.dependencies is complete, but you could cross-check here if needed
            }

            const stepNo = step?.stepNo || 0;

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
    async handleCollaborationMessage(message: any): Promise<void> {
        console.log(`Agent ${this.id} received collaboration message:`, message);
        // TODO: Implement full collaboration message handling logic
        // Placeholder for actual handling logic
        // Example: Store message in a relevant property or trigger specific actions
    }

    /**
     * Process a conflict resolution
     * @param resolution Conflict resolution
     */
    async processConflictResolution(resolution: any): Promise<void> {
        console.log(`Agent ${this.id} processing conflict resolution:`, resolution);
        // TODO: Implement full conflict resolution processing logic
        // Placeholder for actual handling logic
    }

    /**
     * Delegate a step to a specialized agent with the appropriate role
     * @param step Step to delegate
     * @returns Result of delegation
     */
    private async delegateStepToSpecializedAgent(step: Step): Promise<{ success: boolean, result: any }> {
        try {
            console.log(`Attempting to delegate step ${step.id} to an agent with role ${step.recommendedRole}`);

            // Create a task delegation request
            const delegationRequest = {
                taskId: uuidv4(),
                taskType: step.actionVerb,
                description: step.description || `Execute ${step.actionVerb}`,
                inputValues: MapSerializer.transformForSerialization(step.inputValues),
                priority: 'normal',
                context: {
                    sourceAgentId: this.id,
                    sourceStepId: step.id,
                    recommendedRole: step.recommendedRole
                }
            };

            // Find an agent with the appropriate role
            try {
                const response = await this.authenticatedApi.post(`http://${this.agentSetUrl}/findAgentWithRole`, {
                    roleId: step.recommendedRole,
                    missionId: this.missionId
                });

                if (response.data && response.data.agentId) {
                    const recipientId = response.data.agentId;
                    console.log(`Found agent ${recipientId} with role ${step.recommendedRole}`);

                    // Delegate the task to the specialized agent
                    const delegationResponse = await this.authenticatedApi.post(`http://${this.agentSetUrl}/delegateTask`, {
                        delegatorId: this.id,
                        recipientId: recipientId,
                        request: delegationRequest
                    });

                    if (delegationResponse.data && delegationResponse.data.accepted) {
                        console.log(`Successfully delegated step ${step.id} to agent ${recipientId}`);
                        return {
                            success: true,
                            result: {
                                taskId: delegationResponse.data.taskId,
                                recipientId: recipientId,
                                estimatedCompletion: delegationResponse.data.estimatedCompletion
                            }
                        };
                    } else {
                        console.log(`Agent ${recipientId} rejected delegation: ${delegationResponse.data.reason}`);
                        return { success: false, result: null };
                    }
                } else {
                    console.log(`No agent found with role ${step.recommendedRole}`);
                    return { success: false, result: null };
                }
            } catch (error) {
                console.error(`Error finding agent with role ${step.recommendedRole}:`, error);
                return { success: false, result: null };
            }
        } catch (error) {
            console.error(`Error delegating step ${step.id}:`, error);
            return { success: false, result: null };
        }
    }

    /**
     * Generate a vote for a conflict (production-ready)
     * @param conflict Conflict
     * @returns Vote
     */
    async generateConflictVote(conflict: any): Promise<any> {
        // Example: Use agent's role, context, and conflict details to make a decision
        if (!conflict || !Array.isArray(conflict.options) || conflict.options.length === 0) {
            return {
                vote: 'abstain',
                explanation: `Agent ${this.id} abstains: no valid options provided.`
            };
        }
        // Example: Prefer options matching agent's role, otherwise pick the first
        const preferred = conflict.options.find((opt: string) =>
            typeof opt === 'string' && opt.toLowerCase().includes(this.role.toLowerCase())
        );
        const vote = preferred || conflict.options[0];
        // Optionally, use more advanced logic here (e.g., context, past votes, negotiation)
        return {
            vote,
            explanation: `Agent ${this.id} (${this.role}) voted for '${vote}' based on role/context.`
        };
    }

    /**
     * Handle coordination
     * @param coordination Coordination
     */
    async handleCoordination(coordination: any): Promise<void> {
        console.log(`Agent ${this.id} handling coordination:`, coordination);
        // TODO: Implement full coordination handling logic
    }

    /**
     * Process a resource request
     * @param request Resource request
     * @returns Resource response
     */
    async processResourceRequest(request: any): Promise<any> {
        console.log(`Agent ${this.id} processing resource request:`, request);
        // Simple implementation - in a real system, would check available resources
        return {
            requestId: request.id,
            granted: true,
            resource: request.resource,
            message: `Resource ${request.resource} granted by agent ${this.id}`
        };
    }

    /**
     * Process a resource response
     * @param response Resource response
     * @param requestId Request ID
     */
    async processResourceResponse(response: any, requestId?: string): Promise<void> {
        console.log(`Agent ${this.id} processing resource response:`, response);
        // Placeholder for actual handling logic
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
            inputReferences: new Map([
                ['templateId', { inputName: 'templateId', value: templateId, valueType: PluginParameterType.STRING, args: {} }],
                ['inputs', { inputName: 'inputs', value: inputs, valueType: PluginParameterType.OBJECT, args: {} }],
                ['userId', { inputName: 'userId', value: this.id, valueType: PluginParameterType.STRING, args: {} }],
                ['executionMode', { inputName: 'executionMode', value: executionMode, valueType: PluginParameterType.STRING, args: {} }]
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

    setSystemPrompt(prompt: string): void {
        // Set a system prompt for the agent (for LLMs or prompt-based agents)
        (this as any).systemPrompt = prompt;
    }

    setCapabilities(capabilities: string[]): void {
        // Set agent's capabilities (for specialization, etc.)
        (this as any).capabilities = capabilities;
    }

    async storeInContext(key: string, value: any): Promise<void> {
        // Store arbitrary data in agent's context (for specialization, etc.)
        if (!(this as any).context) (this as any).context = {};
        (this as any).context[key] = value;
    }

    async processTaskResult(result: any): Promise<void> {
        // Minimal stub: log the result and update agent state
        this.logEvent({ eventType: 'task_result_received', agentId: this.id, result, timestamp: new Date().toISOString() });
        // Optionally, update step status or agent state here
        await this.saveAgentState();
    }

    // Add a method to resume a paused step with user input
    public async resumeStepWithUserInput(stepId: string, userInput: any) {
        const step = this.steps.find(s => s.id === stepId);
        if (step && step.status === StepStatus.PAUSED) {
            // Set the user input as an input value for the step
            step.inputValues.set('userInput', { inputName: 'userInput', value: userInput, valueType: PluginParameterType.STRING, args: {} });
            step.status = StepStatus.PENDING;
            // Resume agent execution
            await this.runAgent();
        }
    }
}