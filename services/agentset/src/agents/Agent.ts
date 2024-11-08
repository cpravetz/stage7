import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import express from 'express';
import { AgentStatus } from '../utils/agentStatus';
import { getServiceUrls } from '../utils/postOffice';
import { WorkProduct } from '../utils/WorkProduct';
import { MapSerializer, BaseEntity } from '@cktmcs/shared';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { PluginInput, PluginOutput, PluginParameterType } from '@cktmcs/shared';
import { Step, ActionVerbTask } from '@cktmcs/shared';
import { AgentStatistics } from '@cktmcs/shared';
import { Message, MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';

const api = axios.create({
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });

export interface AgentConfig {
    actionVerb: string;
    inputs? : Map<string, PluginInput>;
    missionId: string;
    dependencies?: string[];
    postOfficeUrl: string;
    agentSetUrl: string;
    id: string;
    missionContext: string;
}

export class Agent extends BaseEntity {
    private missionContext: string = '';
    private agentSetUrl: string;
    private agentPersistenceManager: AgentPersistenceManager;
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
    workProducts: Map<string, WorkProduct> = new Map();
    conversation: Array<{ role: string, content: string }> = [];


    private currentQuestionResolve: ((value: string) => void) | null = null;
    private currentQuestionReject: ((reason?: any) => void) | null = null;

    constructor(config: AgentConfig) {
        super(config.id, 'Agent', `agentset`, process.env.PORT || '9000');
        console.log(`Agent ${config.id} created. missionId=${config.missionId}. Inputs: ${JSON.stringify(config.inputs)}` );
        this.agentPersistenceManager = new AgentPersistenceManager();
        this.inputs = config.inputs;
        this.missionId = config.missionId;
        this.agentSetUrl = config.agentSetUrl;
        this.status = AgentStatus.INITIALIZING;
        this.dependencies = config.dependencies || [];
        if (config.missionContext) {
            this.missionContext = config.missionContext;
        }
        const initialStep: Step = {
            id: uuidv4(),
            stepNo: 1,
            actionVerb: config.actionVerb,
            inputs: config.inputs || new Map(),
            dependencies: new Map<string, string>(),
            status: 'pending'
        };
        this.steps.push(initialStep);

        this.initializeAgent().then(() => {
            this.runUntilDone();
        }).catch(error => {
            this.status = AgentStatus.ERROR;
        });

    }

    private async runUntilDone() {
        while (this.status !== AgentStatus.COMPLETED && this.status !== AgentStatus.ERROR && this.status !== AgentStatus.ABORTED) {
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
        const availablePlugins : Array<String >= await this.getAvailablePlugins();
        const openingInstruction = `
Mission Context: ${this.missionContext}

Available Plugins:
${availablePlugins.map(plugin => `- ${plugin}`).join('\n')}

Please consider this context and the available plugins when planning and executing the mission. Provide detailed and well-structured responses, and use the most appropriate plugins for each task.
        `;

        this.conversation.push({ role: 'system', content: openingInstruction });
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
            while ((this.status === AgentStatus.RUNNING) && (this.steps.some(step => step.status === 'pending' || step.status === 'running'))) {
                for (const step of this.steps.filter(s => s.status === 'pending')) {
                    if (this.status === AgentStatus.RUNNING && await this.areStepDependenciesSatisfied(step)) {
                        await this.processStep(step);
                    }
                }
                await this.checkAndResumeBlockedAgents();
            }
            if (this.status === AgentStatus.RUNNING) {
                this.output = this.steps[this.steps.length - 1].result;
                this.status = AgentStatus.COMPLETED;
                this.say(`Agent has completed its work.`);
                this.say(`Result ${this.output}`)
            }
            this.notifyTrafficManager();
        } catch (error) { analyzeError(error as Error);
            console.error('Error running agent:', error instanceof Error ? error.message : error);
            this.status = AgentStatus.ERROR;
            this.notifyTrafficManager();
        }
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
    
        const finalWorkProduct = this.workProducts.get(lastCompletedStep.id);
    
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
            await api.post(`http://${this.trafficManagerUrl}/checkBlockedAgents`, { completedAgentId: this.id });
        } catch (error) { analyzeError(error as Error);
            console.error('Error checking blocked agents:', error instanceof Error ? error.message : error);
        }
    }

    private async processStep(step: Step): Promise<void> {
        try {
            step.status = 'running';
            step.inputs = step.inputs || new Map();
            this.logAndSay(`Processing step ${step.stepNo}: ${step.actionVerb} with ${step.inputs.size} inputs`);
            console.log('processStep: Details:', MapSerializer.transformForSerialization(step));
            // Populate inputs from dependent steps
            if (step.dependencies) {
                step.dependencies.forEach((depStepId, inputKey) => {
                    const dependentStep = this.steps.find(s => s.id === depStepId);
                    if (dependentStep && dependentStep.result) {
                        step.inputs = step.inputs || new Map();
                        const inputData = step.inputs.get(inputKey);
                        if (inputData && inputData.args && inputData.args.outputKey) {
                            step.inputs.set(inputKey, {
                                inputName: inputKey,
                                inputValue: dependentStep.result[inputData.args.outputKey],
                                args: { ...inputData.args }
                            });
                        }
                    }
                });
            }
            console.log('Populated Inputs:', MapSerializer.transformForSerialization(step.inputs));
            let result;

            switch (step.actionVerb) {
                case 'THINK':
                    result = await this.useBrainForReasoning(step.inputs);
                    break;
                case 'DELEGATE':
                    result = await this.createSubAgent(step.inputs);
                    break;
                case MessageType.REQUEST:
                    result = await this.handleAskStep(step.inputs);
                    break;
                default:
                    result = await this.executeActionWithCapabilitiesManager(step);
            }

            step.status = 'completed';
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
            if (resultItem.success && resultItem.resultType === 'plan') {
                this.addPlanSteps(resultItem.result, step.id);
            }
            if (!resultItem.mimeType) { resultItem.mimeType = 'text/plain'; }
            if (!resultItem.success) { step.status = 'error'; }
        });

        step.result = result;
        console.log(`Completed ${step.id}: ${step.status}`);
        await this.saveWorkProduct(step.id, step.result, this.stepIsEndPoint(step));            
        } catch (error) { analyzeError(error as Error);
            this.logAndSay(`There was an error processing step ${step.stepNo}: ${error instanceof Error ? error.message : JSON.stringify(error)}`);
            step.status = 'error';
            step.result = [{ 
                success: false, 
                name: 'error',
                resultType: PluginParameterType.ERROR, 
                resultDescription: 'Error', 
                result: error instanceof Error ? error.message : String(error) ,
                error: error instanceof Error ? error.message : String(error) }];
        }
    }

    private stepIsEndPoint(step: Step): boolean {
        const dependents = this.steps.filter(s => [...s.dependencies.values()].some(depId => depId === step.id));
        return (dependents.length === 0);
    }

    public async handleMessage(message: any): Promise<void> {
        console.log(`Agent ${this.id} received message:`, message);
        // Handle base entity messages (handles ANSWER)
        await super.handleBaseMessage(message);
        // Add message handling as new types are defined
    }

    private addPlanSteps(plan: ActionVerbTask[], currentStepId: string) {
        const newSteps: Step[] = plan.map((task) => {
            const step: Step = {
                id: uuidv4(),
                stepNo: this.steps.length + 1,
                actionVerb: task.verb,
                inputs: task.inputs,
                description: task.description,
                dependencies: new Map<string, string>(),
                status: 'pending',
                result: undefined,
                timeout: undefined
            };

            // Set dependencies for this step
            if (task.dependencies) {
                Object.entries(task.dependencies).forEach(([inputKey, depStepId]) => {
                    step.dependencies.set(inputKey, depStepId);
                });
            }

            return step;
        });

        // Add new steps to the main steps array
        this.steps.push(...newSteps);

        // Find steps in the new plan that have no internal dependencies
        const endpointSteps = newSteps.filter(step => 
            ![...step.dependencies.values()].some(depId => 
                newSteps.some(s => s.id === depId)
            )
        );

        // Update the dependencies of the current step
        const currentStep = this.steps.find(s => s.id === currentStepId);
        if (currentStep) {
            endpointSteps.forEach(step => {
                currentStep.dependencies.set(step.id, step.id);
            });
        }
    }

    private adjustStepDependencies(dependencies: Map<string, number> | undefined, currentStepCount: number): Map<string, number> {
        if (!dependencies) {
            return new Map();
        }
        return new Map(
            Array.from(dependencies).map(([key, value]) => [key, value + currentStepCount])
        );
    }

    private areStepDependenciesSatisfied(step: Step): boolean {
        return Array.from(step.dependencies.values()).every(depStepId => {
            const depStep = this.steps.find(s => s.id === depStepId);
            return depStep && depStep.status === 'completed';
        });
    }

    
    private getStepDependencyOutputs(step: Step): Record<string, any> {
        const outputs: Record<string, any> = {};
        step.dependencies.forEach((depStepId, inputKey) => {
            const depStep = this.steps.find(s => s.id === depStepId);
            if (depStep && depStep.result) {
                outputs[inputKey] = depStep.result;
            }
        });
        return outputs;
    }

    private async handleAskStep(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        const input = inputs.get('question');
        if (!input) {
            this.logAndSay('Question is required for ASK plugin');
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error',
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
                resultDescription: 'Error',
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
    
    async loadDependencyWorkProducts(dependencies: string[]): Promise<void> {
        for (const depId of dependencies) {
            const depWorkProducts = await this.agentPersistenceManager.loadAllWorkProducts(depId);
            for (const wp of depWorkProducts) {
                this.workProducts.set(`${depId}_${wp.stepId}`, wp);
            }
        }
    }

    async loadWorkProduct(stepId: string): Promise<WorkProduct | null> {
        const workProduct = await this.agentPersistenceManager.loadWorkProduct(this.id, stepId);
        if (workProduct) {
            this.workProducts.set(stepId, workProduct);
        }
        return workProduct;
    }    

    private async sendMessage(message: Message): Promise<void> {
        try {
          await axios.post(`http://${this.postOfficeUrl}/message`, message);
        } catch (error) { analyzeError(error as Error);
          console.error('Error sending message:', error instanceof Error ? error.message : error);
        }
      }

      private async saveWorkProduct(stepId: string, data: PluginOutput[], isFinal: boolean): Promise<void> {
        const workProductId = stepId;
        const workProduct = new WorkProduct(this.id, stepId, data);
        try {
            // Save to Librarian
            await this.agentPersistenceManager.saveWorkProduct(workProduct);
    
            // Determine if this is a mission output
            const isMissionOutput = this.steps.length === 1 || (isFinal && !(await this.hasDependentAgents()));
    
            // Send message to client
            const message: Message = {
                type: MessageType.WORK_PRODUCT_UPDATE,
                sender: this.id,
                recipient: 'user',
                content: {
                    id: workProductId,
                    type: isFinal ? 'Final' : 'Interim',
                    scope: isMissionOutput ? 'MissionOutput' : (isFinal ? 'AgentOutput' : 'AgentStep'),
                    name: data[0]? data[0].resultDescription :  'Step Output',
                    agentId: this.id,
                    stepId: stepId,
                    missionId: this.missionId,
                    mimeType: data[0]?.mimeType || 'text/plain'
                }
            };
            await this.sendMessage(message);
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
                inputs: Object.fromEntries(newInputs),
                missionId: this.missionId,
                dependencies: [this.id, ...(this.dependencies || [])],
                missionContext: this.missionContext
            };
    
            const response = await axios.post(`http://${this.agentSetUrl}/addAgent`, subAgentConfig);
    
            if (response.status !== 200) {
                throw new Error(`Failed to create sub-agent: ${response.data.error || 'Unknown error'}`);
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
                resultDescription:'Error',
                result: null,
                error: error instanceof Error ? error.message : 'Unknown error occurred while creating sub-agent'
            }];
        }
    }

    private async useBrainForReasoning(inputs: Map<string, PluginInput>): Promise<PluginOutput[]> {
        const args = inputs.get('query');
        const userMessage = args ? args.inputValue : '';
        this.conversation.push({ role: 'user', content: userMessage });
        const reasoningInput = {
            exchanges: this.conversation,
            optimization: 'accuracy'
        };

        try {
            const response = await api.post(`http://${this.brainUrl}/chat`, reasoningInput);
            console.log(`Brain result: ${response.data.response}`);
            const brainResponse = response.data.response;
            const mimeType = response.data.mimeType || 'text/plain';            
            this.conversation.push({ role: 'assistant', content: response.data.response });
            const result : PluginOutput = {
                success: true,
                name: 'answer',
                resultType: PluginParameterType.OBJECT,
                result: brainResponse,
                resultDescription: 'Brain reasoning output',
                mimeType: mimeType
            };
             
            return [result];
        } catch (error) { analyzeError(error as Error);
            console.error('Error using Brain for reasoning:', error instanceof Error ? error.message : error);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error',
                result: null,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }];
        }
    }

    private isPluginOutput(obj: any): obj is PluginOutput {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            'success' in obj &&
            'name' in obj &&
            'resultType' in obj &&
            'resultDescription' in obj &&
            'result' in obj
        );
    }

    private async executeActionWithCapabilitiesManager(step: Step): Promise<PluginOutput[]> {
        this.logAndSay(`Agent: Executing action ${step.actionVerb} with CapabilitiesManager`);
        try {
            const payload = MapSerializer.transformForSerialization({ step });
            const response = await api.post(`http://${this.capabilitiesManagerUrl}/executeAction`, payload);
            const serializedresponse = MapSerializer.transformFromSerialization(response.data);
            if (Array.isArray(serializedresponse) && serializedresponse.every(item => this.isPluginOutput(item))) {
                return serializedresponse;
            } else if (this.isPluginOutput(serializedresponse)) {
                return [serializedresponse];
            } else {
                console.warn('Unexpected response type from CapabilitiesManager');
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Unexpected response type',
                    result: null,
                    error: 'Unexpected response type from CapabilitiesManager'
                }];
            }
        } catch (error) { analyzeError(error as Error);
            this.logAndSay(`Error executing action ${step.actionVerb} with CapabilitiesManager: ${error instanceof Error ? error.message : error}`);
            return [{
                success: false,
                name: 'error',
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error executing action',
                result: null,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            }];
        }
    }

    async saveAgentState(): Promise<void> {
        await this.agentPersistenceManager.saveAgent({
            ...this,
            conversation: this.conversation
        });
    }

    async loadAgentState(): Promise<void> {
        const state = await this.agentPersistenceManager.loadAgent(this.id);
        if (state) {
            // Restore all properties
            this.status = state.status;
            this.output = state.output;
            this.inputs = state.inputs;
            this.missionId = state.missionId;
            this.steps = state.steps;
            this.dependencies = state.dependencies;
            this.capabilitiesManagerUrl = state.capabilitiesManagerUrl;
            this.brainUrl = state.brainUrl;
            this.trafficManagerUrl = state.trafficManagerUrl;
            this.librarianUrl = state.librarianUrl;
            this.questions = state.questions;
            this.conversation = state.conversation || [];
            this.workProducts = new Map(JSON.parse(state.workProducts));
        }
        console.log('Agent state loaded successfully.');
    }

    async pause() {
        console.log(`Pausing agent ${this.id}`);
        this.status = AgentStatus.PAUSED;
        await this.notifyTrafficManager();
        await this.saveAgentState();
    }

    async abort() {
        this.status = AgentStatus.ABORTED;
        await this.notifyTrafficManager();
        await this.saveAgentState();
    }

    async resume() {
        if (this.status === AgentStatus.PAUSED || this.status === AgentStatus.INITIALIZING) {
            this.status = AgentStatus.RUNNING;
            await this.notifyTrafficManager();
            this.runAgent();
        }
    }

    getMissionId(): string {
        return this.missionId;
    }

    getStatus(): string {
        return this.status;
    }

    async getStatistics(): Promise<AgentStatistics> {
        const statistics: AgentStatistics = {
            id : this.id,
            status: this.status,
            taskCount: this.steps.length,
            currenTaskNo: this.steps.length,
            currentTaskVerb: this.steps[this.steps.length - 1]?.actionVerb || 'Unknown'
        };
        return statistics;
    }

    private async notifyTrafficManager(): Promise<void> {
        try {
            const message: Message = {
                type: MessageType.AGENT_UPDATE,
                sender: this.id,
                recipient: 'trafficmanager',
                content: {
                  status: this.status,
                }
              };
              this.sendMessage(message);
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
    
}