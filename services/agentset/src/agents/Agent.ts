import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import express from 'express';
import { AgentStatus } from '../utils/agentStatus';
import { getServiceUrls } from '../utils/postOfficeInterface';
import { WorkProduct } from '../utils/WorkProduct';
import { MapSerializer, BaseEntity } from '@cktmcs/shared';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { PluginInput, PluginOutput, PluginParameterType } from '@cktmcs/shared';
import { ActionVerbTask } from '@cktmcs/shared';
import { AgentConfig, AgentStatistics } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { Step, StepStatus, createFromPlan } from './Step';
import { StateManager } from '../utils/StateManager';
import { CollaborationMessage } from '../collaboration/CollaborationProtocol';
import { DelegatedTask } from '../collaboration/TaskDelegation';
import { AuthenticatedApiClient } from '@cktmcs/shared';

// Create a simple axios instance for non-authenticated calls
const simpleApi = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

export class Agent extends BaseEntity {
    missionContext: string = '';
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
    authenticatedApi: AuthenticatedApiClient;

    // Agent lifecycle properties
    private paused: boolean = false;
    private checkpointInterval: NodeJS.Timeout | null = null;
    private lastCheckpoint: string = '';

    // Agent collaboration properties
    private context: Map<string, any> = new Map();
    private delegatedTasks: Map<string, DelegatedTask> = new Map();
    private pendingResponses: Map<string, { resolve: Function, reject: Function }> = new Map();

    // Agent specialization properties
    private role: string = '';
    private capabilities: string[] = [];
    private systemPrompt: string = '';
    private taskHistory: Array<{ id: string, type: string, success: boolean, duration: number }> = [];

    private currentQuestionResolve: ((value: string) => void) | null = null;
    private currentQuestionReject: ((reason?: any) => void) | null = null;

    constructor(config: AgentConfig) {
        super(config.id, 'Agent', `agentset`, process.env.PORT || '9000');
        console.log(`Agent ${config.id} created. missionId=${config.missionId}. Inputs: ${JSON.stringify(config.inputs)}` );
        this.agentPersistenceManager = new AgentPersistenceManager();
        this.stateManager = new StateManager(config.id, this.agentPersistenceManager);
        this.inputs = new Map(config.inputs instanceof Map ? config.inputs : Object.entries(config.inputs||{}));
        this.missionId = config.missionId;
        this.agentSetUrl = config.agentSetUrl;
        this.status = AgentStatus.INITIALIZING;
        this.dependencies = config.dependencies || [];
        if (config.missionContext) {
            this.missionContext = config.missionContext;
        }

        // Initialize the authenticated API client
        this.authenticatedApi = new AuthenticatedApiClient(this);

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

        this.initializeAgent().then(() => {
            this.runUntilDone();
        }).catch(error => {
            this.status = AgentStatus.ERROR;
        });
    }

    private async runUntilDone() {
        while (this.status !== AgentStatus.COMPLETED &&
               this.status !== AgentStatus.ERROR &&
               this.status !== AgentStatus.ABORTED) {
            await this.runAgent();
        }
        return this.status;
    }

    private async initializeAgent() {
        try {
            const { capabilitiesManagerUrl, brainUrl, trafficManagerUrl, librarianUrl } = await getServiceUrls();
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
        try {
            const response = await axios.get(`http://${this.capabilitiesManagerUrl}/availablePlugins`);
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
            this.say(`Agent is starting ...`);

            while (this.status === AgentStatus.RUNNING &&
                   this.steps.some(step => step.status === StepStatus.PENDING || step.status === StepStatus.RUNNING)) {

                for (const step of this.steps.filter(s => s.status === StepStatus.PENDING)) {
                    if (this.status === AgentStatus.RUNNING && step.areDependenciesSatisfied(this.steps)) {
                        await this.populateInputsFromLibrarian(step);
                        const result = await step.execute(
                            this.executeActionWithCapabilitiesManager.bind(this),
                            this.useBrainForReasoning.bind(this),
                            this.createSubAgent.bind(this),
                            this.handleAskStep.bind(this)
                        );

                        if (result[0]?.resultType === PluginParameterType.PLAN) {
                            const plan = result[0].result as ActionVerbTask[];
                            this.addStepsFromPlan(plan);
                        }

                        await this.saveWorkProduct(step.id, result, step.isEndpoint(this.steps));
                    }
                }

                await this.checkAndResumeBlockedAgents();
            }

            if (this.status === AgentStatus.RUNNING) {
                const finalStep = this.steps[this.steps.length - 1];
                this.output = await this.agentPersistenceManager.loadWorkProduct(this.id, finalStep.id);                this.status = AgentStatus.COMPLETED;
                this.say(`Agent ${this.id} has completed its work.`);
                this.say(`Result ${JSON.stringify(this.output)}`);
            }

            this.notifyTrafficManager();
        } catch (error) {
            console.error('Error running agent:', error instanceof Error ? error.message : error);
            this.status = AgentStatus.ERROR;
            this.notifyTrafficManager();
        }
    }

    private async populateInputsFromLibrarian(step: Step) {
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
        try {
            // Use simpleApi for non-authenticated calls
            await simpleApi.post(`http://${this.trafficManagerUrl}/checkBlockedAgents`, { completedAgentId: this.id });
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
                await this.addToConversation('user', message.content.message);
                break;
            default:
                break;
        }
    }

    private addToConversation(role: string, content: string) {
        this.conversation.push({ role, content });
    }

    private async handleAskStep(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
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
        return new Promise((resolve, reject) => {
            this.currentQuestionResolve = resolve;
            this.currentQuestionReject = reject;
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
            this.currentQuestionReject = null;
        }
    }

    private async saveWorkProduct(stepId: string, data: PluginOutput[], isFinal: boolean): Promise<void> {
        const serializedData = MapSerializer.transformForSerialization(data);
        const workProduct = new WorkProduct(this.id, stepId, serializedData);
        try {
            await this.agentPersistenceManager.saveWorkProduct(workProduct);

            // Determine if this is a mission output
            const isMissionOutput = this.steps.length === 1 || (isFinal && !(await this.hasDependentAgents()));

            // Send message to client
            this.sendMessage(MessageType.WORK_PRODUCT_UPDATE,'user', {
                id: stepId,
                type: isFinal ? 'Final' : 'Interim',
                scope: isMissionOutput ? 'MissionOutput' : (isFinal ? 'AgentOutput' : 'AgentStep'),
                name: data[0]? data[0].resultDescription :  'Step Output',
                agentId: this.id,
                stepId: stepId,
                missionId: this.missionId,
                mimeType: data[0]?.mimeType || 'text/plain'
            });
        } catch (error) { analyzeError(error as Error);
            console.error('Error saving work product:', error instanceof Error ? error.message : error);
        }
    }

    private async createSubAgent(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        try {
            const subAgentGoal = inputs.get('subAgentGoal');
            const newInputs = new Map(inputs);

            if (subAgentGoal) {
                newInputs.delete('subAgentGoal');
                newInputs.set('goal', subAgentGoal);
            }

            const subAgentId = uuidv4();
            const subAgentConfig = {
                agentId: subAgentId,
                actionVerb: 'ACCOMPLISH',
                inputs: MapSerializer.transformForSerialization(newInputs),
                missionId: this.missionId,
                dependencies: [this.id, ...(this.dependencies || [])],
                missionContext: this.missionContext
            };

            // Use simpleApi for non-authenticated calls
            const response = await simpleApi.post(`http://${this.agentSetUrl}/addAgent`, subAgentConfig);

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
                    status: 'created'
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
            // Use the authenticated API client for Brain requests
            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, reasoningInput);
            const brainResponse = response.data.response;
            const mimeType = response.data.mimeType || 'text/plain';

            let resultType: PluginParameterType;
            switch (ConversationType) {
                case 'text/image':
                    resultType = PluginParameterType.OBJECT; // Assuming image data is returned as an object
                    break;
                case 'text/audio':
                case 'text/video':
                    resultType = PluginParameterType.OBJECT; // Assuming audio/video data is returned as an object
                    break;
                case 'text/code':
                    resultType = PluginParameterType.STRING;
                    break;
                default:
                    resultType = PluginParameterType.STRING;
            }

            const result: PluginOutput = {
                success: true,
                name: 'answer',
                resultType: resultType,
                result: brainResponse,
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
            const response = await simpleApi.post(
                `http://${this.capabilitiesManagerUrl}/executeAction`,
                payload
            );

            return MapSerializer.transformFromSerialization(response.data);
        } catch (error) {
            console.error('Error executing action with CapabilitiesManager:', error instanceof Error ? error.message : error);

            step.updateStatus(StepStatus.ERROR, undefined, undefined, error instanceof Error ? error.message : String(error));

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
                step.updateStatus(status, undefined, undefined, `Dependent on failed step ${failedStepId}`);
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
                    await axios.post(`http://${this.trafficManagerUrl}/handleStepFailure`, {
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

    // Helper method to check if a step has any dependent steps
    private hasDependentSteps(stepId: string): boolean {
        return this.steps.some(step =>
            step.dependencies.some(dep => dep.sourceStepId === stepId)
        );
    }

    // Update the cleanupFailedStep method to include proper error handling
    private async cleanupFailedStep(step: Step): Promise<void> {
        try {
            console.log(`Starting cleanup for failed step ${step.id}`);

            // Clear any temporary data
            step.clearTempData?.();

            // If this step's failure affects the entire agent, update agent status
            if (!this.hasDependentSteps(step.id)) {
                this.status = AgentStatus.ERROR;
                await this.notifyTrafficManager();
            }

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

    async saveAgentState(): Promise<void> {
        await this.stateManager.saveState(this);
    }

    async loadAgentState(): Promise<void> {
        await this.stateManager.loadState(this);
    }

    async abort() {
        this.status = AgentStatus.ABORTED;
        await this.notifyTrafficManager();
        await this.saveAgentState();
    }


    getMissionId(): string {
        return this.missionId;
    }

    async getStatistics(): Promise<AgentStatistics> {
        const totalDeps = this.steps.reduce((sum, step) => sum + step.dependencies.length, 0);
        //console.log(`Total dependencies across all steps: ${totalDeps}`);

        const stepStats = this.steps.map(step => ({
            id: step.id,
            verb: step.actionVerb,
            status: step.status,
            dependencies: step.dependencies.map(dep => dep.sourceStepId) || [],
            stepNo: step.stepNo
        }));

        const statistics: AgentStatistics = {
            id: this.id,
            status: this.status,
            taskCount: this.steps.length,
            currentTaskNo: this.steps.length,
            currentTaskVerb: this.steps[this.steps.length - 1]?.actionVerb || 'Unknown',
            steps: stepStats,
            color: this.getAgentColor()
        };
        //console.log(`Agent ${this.id} statistics:`, statistics);
        return statistics;
    }

    private getAgentColor(): string {
        // Generate a consistent color based on agent ID
        let hash = 0;
        for (let i = 0; i < this.id.length; i++) {
            hash = this.id.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = hash % 360;
        return `hsl(${hue}, 70%, 50%)`;
    }

    private async notifyTrafficManager(): Promise<void> {
        try {

              this.sendMessage(MessageType.AGENT_UPDATE, 'trafficmanager', {
                status: this.status,
              });
              axios.post(`http://${this.agentSetUrl}/updateFromAgent`, { agentId: this.id, status: this.status });
        } catch (error) { analyzeError(error as Error);
            console.error(`Failed to notify TrafficManager about agent ${this.id}:`, error instanceof Error ? error.message : error);
        }
    }

    private async hasDependentAgents(): Promise<boolean> {
        try {
          const response = await axios.get(`http://${this.trafficManagerUrl}/dependentAgents/${this.id}`);
          const dependentAgents = response.data;
          return dependentAgents.length > 0;
        } catch (error) { analyzeError(error as Error);
          console.error('Error checking for dependent agents:', error instanceof Error ? error.message : error);
          return false;
        }
    }

    // ===== Agent Lifecycle Methods =====

    /**
     * Pause the agent
     */
    async pause(): Promise<void> {
        if (this.status === AgentStatus.RUNNING) {
            this.paused = true;
            this.status = AgentStatus.PAUSED;
            await this.saveAgentState();
            await this.notifyTrafficManager();
            console.log(`Agent ${this.id} paused`);
        }
    }

    /**
     * Resume the agent
     */
    async resume(): Promise<void> {
        if (this.status === AgentStatus.PAUSED) {
            this.paused = false;
            this.status = AgentStatus.RUNNING;
            await this.notifyTrafficManager();
            console.log(`Agent ${this.id} resumed`);
            this.runUntilDone();
        }
    }

    /**
     * Create a checkpoint
     */
    async createCheckpoint(): Promise<void> {
        await this.saveAgentState();
        this.lastCheckpoint = new Date().toISOString();
        console.log(`Checkpoint created for agent ${this.id}`);
    }

    /**
     * Set up automatic checkpointing
     * @param intervalMinutes Checkpoint interval in minutes
     */
    setupCheckpointing(intervalMinutes: number = 15): void {
        // Clear existing interval if any
        if (this.checkpointInterval) {
            clearInterval(this.checkpointInterval);
        }

        // Set up new interval
        this.checkpointInterval = setInterval(() => {
            this.createCheckpoint()
                .catch(error => console.error(`Failed to create checkpoint for agent ${this.id}:`, error));
        }, intervalMinutes * 60 * 1000);

        console.log(`Automatic checkpointing set up for agent ${this.id} every ${intervalMinutes} minutes`);
    }

    /**
     * Get agent status
     * @returns Agent status
     */
    getStatus(): AgentStatus {
        return this.status;
    }

    /**
     * Get agent steps
     * @returns Agent steps
     */
    getSteps(): Step[] {
        return this.steps;
    }

    /**
     * Get agent action verb
     * @returns Agent action verb
     */
    getActionVerb(): string {
        return this.steps[0]?.actionVerb || '';
    }

    // ===== Agent Collaboration Methods =====

    /**
     * Handle a collaboration message
     * @param message Collaboration message
     */
    async handleCollaborationMessage(message: CollaborationMessage): Promise<void> {
        console.log(`Agent ${this.id} received collaboration message:`, message);

        // Check if this is a response to a pending request
        if (message.inReplyTo && this.pendingResponses.has(message.inReplyTo)) {
            const { resolve } = this.pendingResponses.get(message.inReplyTo)!;
            this.pendingResponses.delete(message.inReplyTo);
            resolve(message.content);
            return;
        }

        // Handle message based on type
        switch (message.type) {
            case 'task_delegation':
                await this.handleTaskDelegation(message.content);
                break;

            case 'knowledge_share':
                await this.handleKnowledgeShare(message.content);
                break;

            case 'conflict_resolution':
                await this.handleConflictResolution(message.content);
                break;

            case 'coordination':
                await this.handleCoordination(message.content);
                break;

            default:
                console.log(`Unknown collaboration message type: ${message.type}`);
        }
    }

    /**
     * Handle a task delegation message
     * @param task Delegated task
     */
    private async handleTaskDelegation(task: DelegatedTask): Promise<void> {
        console.log(`Agent ${this.id} handling task delegation:`, task);

        // Store task
        this.delegatedTasks.set(task.id, task);

        // Create a step for the task
        await this.createStepForTask(task);
    }

    /**
     * Create a step for a delegated task
     * @param task Delegated task
     */
    async createStepForTask(task: DelegatedTask): Promise<void> {
        // Create inputs for the step
        const inputs = new Map<string, PluginInput>();

        for (const [key, value] of Object.entries(task.inputs)) {
            inputs.set(key, {
                inputName: key,
                inputValue: value,
                args: {}
            });
        }

        // Create step
        const step = new Step({
            actionVerb: task.type,
            stepNo: this.steps.length + 1,
            inputs,
            description: task.description,
            persistenceManager: this.agentPersistenceManager
        });

        // Add step
        this.steps.push(step);

        // Save state
        await this.saveAgentState();

        console.log(`Created step for task ${task.id}`);
    }

    /**
     * Handle a knowledge share message
     * @param knowledge Knowledge
     */
    private async handleKnowledgeShare(knowledge: any): Promise<void> {
        console.log(`Agent ${this.id} handling knowledge share:`, knowledge);

        // Store knowledge in context
        await this.storeInContext(`knowledge:${knowledge.topic}`, knowledge.content);
    }

    /**
     * Handle a conflict resolution message
     * @param conflict Conflict
     */
    private async handleConflictResolution(conflict: any): Promise<void> {
        console.log(`Agent ${this.id} handling conflict resolution:`, conflict);

        if (conflict.status === 'resolved') {
            // Process resolution
            await this.processConflictResolution(conflict);
        } else {
            // Generate vote
            const vote = await this.generateConflictVote(conflict);

            // Send vote back
            if (vote) {
                this.sendMessage(MessageType.AGENT_MESSAGE, 'agentset', {
                    type: 'conflict_vote',
                    conflictId: conflict.conflictId,
                    vote: vote.vote,
                    explanation: vote.explanation
                });
            }
        }
    }

    /**
     * Process a conflict resolution
     * @param resolution Conflict resolution
     */
    async processConflictResolution(resolution: any): Promise<void> {
        console.log(`Agent ${this.id} processing conflict resolution:`, resolution);

        // Store resolution in context
        await this.storeInContext(`conflict:${resolution.conflictId}`, resolution);

        // Check if any steps are waiting for this resolution
        for (const step of this.steps) {
            if (step.status === StepStatus.WAITING && step.waitingFor === `conflict:${resolution.conflictId}`) {
                // Update step status using the enhanced updateStatus method
                step.updateStatus(StepStatus.PENDING);

                // Store resolution in step data
                step.storeTempData('conflictResolution', resolution);
            }
        }

        // Save state
        await this.saveAgentState();
    }

    /**
     * Generate a vote for a conflict
     * @param conflict Conflict
     * @returns Vote and explanation
     */
    async generateConflictVote(conflict: any): Promise<{ vote: any, explanation: string } | null> {
        try {
            // Use brain to generate vote with authenticated API client
            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/chat`, {
                exchanges: [
                    {
                        role: 'system',
                        content: `You are an AI agent that helps resolve conflicts. You will be given a conflict description and conflicting data. Your job is to analyze the conflict and provide a resolution.`
                    },
                    {
                        role: 'user',
                        content: `Conflict: ${conflict.description}\n\nConflicting Data: ${JSON.stringify(conflict.conflictingData, null, 2)}\n\nPlease provide a resolution and explain your reasoning.`
                    }
                ],
                optimization: 'accuracy'
            });

            // Parse response
            const brainResponse = response.data.response;

            // Extract vote and explanation
            const voteMatch = brainResponse.match(/Resolution:\s*(.*?)(?:\n\n|$)/s);
            const explanationMatch = brainResponse.match(/Explanation:\s*(.*?)(?:\n\n|$)/s);

            const vote = voteMatch ? voteMatch[1].trim() : brainResponse;
            const explanation = explanationMatch ? explanationMatch[1].trim() : 'No explanation provided';

            return { vote, explanation };
        } catch (error) {
            analyzeError(error as Error);
            console.error(`Error generating conflict vote:`, error);
            return null;
        }
    }

    /**
     * Handle a coordination message
     * @param coordination Coordination
     */
    async handleCoordination(coordination: any): Promise<void> {
        console.log(`Agent ${this.id} handling coordination:`, coordination);

        // Store coordination in context
        await this.storeInContext(`coordination:${coordination.id}`, coordination);

        // Process coordination based on type
        if (coordination.type === 'task_update') {
            // Update task status
            const taskId = coordination.taskId;
            const task = this.delegatedTasks.get(taskId);

            if (task) {
                task.status = coordination.status;
                task.updatedAt = new Date().toISOString();

                if (coordination.result) {
                    task.result = coordination.result;
                }

                if (coordination.error) {
                    task.error = coordination.error;
                }
            }
        }
    }

    /**
     * Process a task result
     * @param result Task result
     */
    async processTaskResult(result: any): Promise<void> {
        console.log(`Agent ${this.id} processing task result:`, result);

        // Find step associated with this task
        const step = this.steps.find(s => s.id === result.taskId);

        if (step) {
            // Update step status using the enhanced updateStatus method
            if (result.success) {
                step.updateStatus(StepStatus.COMPLETED, result.result);
            } else {
                step.updateStatus(StepStatus.ERROR, undefined, undefined, result.error);
            }

            // Save state
            await this.saveAgentState();
        }
    }

    /**
     * Process a resource request
     * @param request Resource request
     * @returns Resource response
     */
    async processResourceRequest(request: any): Promise<any> {
        console.log(`Agent ${this.id} processing resource request:`, request);

        // Check if resource is available in context
        if (request.resourceType === 'context' && this.context.has(request.resourceId)) {
            return {
                success: true,
                resource: this.context.get(request.resourceId)
            };
        }

        // Check if resource is a work product
        if (request.resourceType === 'work_product') {
            try {
                // Extract agentId and stepId from the resourceId (format: agentId_stepId)
                const [agentId, stepId] = request.resourceId.split('_');
                if (!agentId || !stepId) {
                    return {
                        success: false,
                        error: `Invalid resource ID format: ${request.resourceId}. Expected format: agentId_stepId`
                    };
                }

                const workProduct = await this.agentPersistenceManager.loadWorkProduct(agentId, stepId);

                if (workProduct) {
                    return {
                        success: true,
                        resource: workProduct
                    };
                }
            } catch (error) {
                analyzeError(error as Error);
                console.error(`Error loading work product:`, error);
            }
        }

        return {
            success: false,
            error: `Resource not found: ${request.resourceType}/${request.resourceId}`
        };
    }

    /**
     * Process a resource response
     * @param response Resource response
     * @param requestId Request ID
     */
    async processResourceResponse(response: any, requestId?: string): Promise<void> {
        console.log(`Agent ${this.id} processing resource response:`, response);

        if (requestId && this.pendingResponses.has(requestId)) {
            const { resolve } = this.pendingResponses.get(requestId)!;
            this.pendingResponses.delete(requestId);
            resolve(response);
        }
    }

    /**
     * Store data in agent context
     * @param key Context key
     * @param value Context value
     */
    async storeInContext(key: string, value: any): Promise<void> {
        this.context.set(key, value);
        await this.saveAgentState();
    }

    /**
     * Get data from agent context
     * @param key Context key
     * @returns Context value or undefined if not found
     */
    getFromContext(key: string): any {
        return this.context.get(key);
    }

    // ===== Agent Specialization Methods =====

    /**
     * Set agent role
     * @param role Role ID
     */
    setRole(role: string): void {
        this.role = role;
    }

    /**
     * Get agent role
     * @returns Role ID
     */
    getRole(): string {
        return this.role;
    }

    /**
     * Set agent capabilities
     * @param capabilities Capabilities
     */
    setCapabilities(capabilities: string[]): void {
        this.capabilities = capabilities;
    }

    /**
     * Get agent capabilities
     * @returns Capabilities
     */
    getCapabilities(): string[] {
        return this.capabilities;
    }

    /**
     * Set agent system prompt
     * @param prompt System prompt
     */
    setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
    }

    /**
     * Get agent system prompt
     * @returns System prompt
     */
    getSystemPrompt(): string {
        return this.systemPrompt;
    }

    /**
     * Record task in history
     * @param taskId Task ID
     * @param taskType Task type
     * @param success Whether the task was successful
     * @param duration Task duration in seconds
     */
    recordTask(taskId: string, taskType: string, success: boolean, duration: number): void {
        this.taskHistory.push({ id: taskId, type: taskType, success, duration });
    }

    /**
     * Get task history
     * @returns Task history
     */
    async getTaskHistory(): Promise<Array<{ id: string, type: string, success: boolean, duration: number }>> {
        return this.taskHistory;
    }
}