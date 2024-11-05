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
    subAgents: Agent[] = [];
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
            dependencies: new Map<string,number>(),
            status: 'pending'
        };
        this.steps.push(initialStep);

        this.initializeAgent();
    }

    private async initializeAgent() {
        try {
            const { capabilitiesManagerUrl, brainUrl, trafficManagerUrl, librarianUrl } = await getServiceUrls();
            this.capabilitiesManagerUrl = capabilitiesManagerUrl;
            this.brainUrl = brainUrl;
            this.trafficManagerUrl = trafficManagerUrl;
            this.librarianUrl = librarianUrl;

            console.log('Service URLs retrieved:', { capabilitiesManagerUrl, brainUrl, trafficManagerUrl, librarianUrl });
            if (this.missionContext && this.steps[0]?.actionVerb === 'ACCOMPLISH') {
                await this.prepareOpeningInstruction();
            }
            this.status = AgentStatus.RUNNING;
            await this.runAgent();
        } catch (error) {
            console.error('Error initializing agent:', error);
            this.status = AgentStatus.ERROR;
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
        } catch (error) {
            console.error('Error fetching available plugins:', error);
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
            await this.notifyTrafficManager();
        } catch (error) {
            console.error('Error running agent:', error);
            this.status = AgentStatus.ERROR;
            await this.notifyTrafficManager();
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
        } catch (error) {
            console.error('Error checking blocked agents:', error);
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
                step.dependencies.forEach((dependentStepNo, inputKey) => {
                    const dependentStep = this.steps.find(s => s.stepNo === dependentStepNo);
                    if (dependentStep && dependentStep.result) {
                        step.inputs = step.inputs || new Map();
                        step.inputs.set(inputKey, {
                            inputName: inputKey,
                            inputValue: dependentStep.result,
                            args: { [inputKey]: dependentStep.result }
                        });
                    }
                });
            }
            console.log('Populated Inputs:', MapSerializer.transformForSerialization(step.inputs));
            let result: PluginOutput;

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
                case 'ACCOMPLISH':
                    result = await this.executeActionWithCapabilitiesManager(step);
                    break;
                default:
                    result = await this.executeActionWithCapabilitiesManager(step);
            }

            if (result.success && result.resultType === 'plan') {
                this.addPlanSteps(result.result, step.stepNo);
            }
            if (!result.mimeType) { result.mimeType = 'text/plain'; }
            step.result = result.result;
            step.status = result.success ? 'completed' : 'error';
            console.log(`Completed ${step.id}: ${result.resultType} ${step.result}`);
            await this.saveWorkProduct(step.id, result.resultType, result.resultDescription, step.result, step.stepNo === this.steps.length, result.mimeType);
            
        } catch (error) {
            this.logAndSay(`There was an error processing step ${step.stepNo}: ${JSON.stringify(error)}`);
            console.log('Error processing step:', error);
            step.status = 'error';
            step.result = { 
                success: false, 
                resultType: PluginParameterType.ERROR, 
                resultDescription: 'Error', 
                result: error instanceof Error ? error.message : String(error) ,
                error: error instanceof Error ? error.message : String(error) };
        }
    }

    public async handleMessage(message: any): Promise<void> {
        console.log(`Agent ${this.id} received message:`, message);
        // Handle base entity messages (handles ANSWER)
        await super.handleBaseMessage(message);
        // Add message handling as new types are defined
    }

    private addPlanSteps(plan: ActionVerbTask[], currentStepNo: number) {
        console.log('Adding plan steps:', MapSerializer.transformForSerialization(plan));
        const currentStepCount = this.steps.length;
        const newSteps: Step[] = plan.map((task, index) => {
            console.log(`Adding plan step ${task.verb} with ${task.inputs.size} inputs and ${task.dependencies?.size} dependencies`);
            return {
            id: uuidv4(),
            stepNo: currentStepCount + index + 1,
            actionVerb: task.verb,
            inputs: task.inputs,
            description: task.description,
            dependencies: this.adjustStepDependencies(task.dependencies, currentStepCount),
            status: 'pending',
            result: undefined,
            timeout: undefined
        }});
        this.steps.push(...newSteps);
    
        // Adjust dependencies for steps that were dependent on the current step
        this.steps.forEach(step => {
            step.dependencies.forEach((value, key) => {
                if (value === currentStepNo) {
                    step.dependencies.set(key, currentStepCount + newSteps.length);
                }
            });
        });

        // Reset dependencies for all steps after the current one
        for (let i = currentStepNo; i < this.steps.length; i++) {
            if (this.steps[i].dependencies) {
                this.steps[i].dependencies = new Map(
                    Array.from(this.steps[i].dependencies)
                        .filter(([_, value]) => value < currentStepNo)
                );
            }
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
        return Array.from(step.dependencies.values()).every(depStepNo => {
            const depStep = this.steps.find(s => s.stepNo === depStepNo);
            return depStep && depStep.status === 'completed';
        });
    }

    
    private getStepDependencyOutputs(step: Step): Record<string, any> {
        const outputs: Record<string, any> = {};
        step.dependencies.forEach(depStepNo => {
            const depStep = this.steps.find(s => s.stepNo === depStepNo);
            if (depStep && depStep.result) {
                outputs[`step_${depStepNo}`] = depStep.result;
            }
        });
        return outputs;
    }
    private async handleAskStep(inputs: Map<string, PluginInput>): Promise<PluginOutput> {
        const input = inputs.get('question');
        if (!input) {
            this.logAndSay('Question is required for ASK plugin');
            return {
                success: false,
                resultType: PluginParameterType.ERROR,
                resultDescription: 'Error',
                result: null,
                error: 'Question is required for ASK plugin'
            }
        }
        const question = input.args.question || input.inputValue;
        const choices = input.args.choices;
        const timeout = input.args.timeout || 300000; // Default timeout of 5 minutes if not specified
    
        try {
            const response = await Promise.race([
                this.askUser(question, choices),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Question timeout')), timeout))
            ]);
    
            return {
                success: true,
                resultType: PluginParameterType.STRING,
                resultDescription: 'User response',
                result: response
            };
        } catch (error) {
            if (error instanceof Error && error.message === 'Question timeout') {
                console.error(`Question timed out after ${timeout}ms: ${question}`);
                return {
                    success: false,
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Question to user timed out',
                    result: null,
                    error: 'Question timed out'
                };
            }
            return {
                success: false,
                resultType: PluginParameterType.ERROR,
                result: null,
                resultDescription: 'Error',
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
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
        } catch (error) {
          console.error('Error sending message:', error);
        }
      }

      private async saveWorkProduct(stepId: string, resultType: string, resultDescription: string, data: any, isFinal: boolean, mimeType: string): Promise<void> {
        const workProductId = stepId;
        const workProduct = new WorkProduct(this.id, stepId, resultType, data, mimeType);
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
                    name: resultDescription,
                    agentId: this.id,
                    stepId: stepId,
                    missionId: this.missionId,
                    mimeType: mimeType
                }
            };
            await this.sendMessage(message);
        } catch (error) {
            console.error('Error saving work product:', error);
        }
    }

    private async createSubAgent(inputs: Map<string, PluginInput>): Promise<PluginOutput> {
        try {
            const subAgent = new Agent({
                actionVerb: 'ACCOMPLISH',
                inputs: inputs,
                missionId: this.missionId,
                dependencies: [this.id, ...(this.dependencies || [])],
                postOfficeUrl: this.postOfficeUrl,
                agentSetUrl: this.agentSetUrl,
                id: uuidv4(),
                missionContext: this.missionContext
            });
            this.subAgents.push(subAgent);
            await subAgent.initializeAgent();
            
            return {
                success: true,
                resultType: PluginParameterType.OBJECT,
                resultDescription: 'Sub-agent created',
                result: {
                    subAgentId: subAgent.id,
                    status: subAgent.status
                }
            };
        } catch (error) {
            console.error('Error creating sub-agent:', error);
            return {
                success: false,
                resultType: PluginParameterType.ERROR,
                resultDescription:'Error',
                result: null,
                error: error instanceof Error ? error.message : 'Unknown error occurred while creating sub-agent'
            };
        }
    }
    private async useBrainForReasoning(inputs: Map<string, PluginInput>): Promise<PluginOutput> {
        const args = inputs.get('query');
        const userMessage = args ? args.inputValue : '';
        this.conversation.push({ role: 'user', content: userMessage });
        const reasoningInput = {
            exchanges: [{ role: 'user', message: this.conversation }],
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
                resultType: PluginParameterType.OBJECT,
                result: brainResponse,
                resultDescription: 'Brain reasoning output',
                mimeType: mimeType
            };
             
            return result;
        } catch (error) {
            console.error('Error using Brain for reasoning:', error);
            throw error;
        }
    }

    private async executeActionWithCapabilitiesManager(step: Step): Promise<PluginOutput> {
        this.logAndSay(`Agent: Executing action ${step.actionVerb} with CapabilitiesManager`);
        console.log(`${step.actionVerb} Inputs are `, MapSerializer.transformForSerialization(step.inputs));
        try {
            const response = await api.post(`http://${this.capabilitiesManagerUrl}/executeAction`, 
                MapSerializer.transformForSerialization({ step }));
            return MapSerializer.transformFromSerialization(response.data);
        } catch (error) {
            this.logAndSay(`Error executing action ${step.actionVerb} with CapabilitiesManager: ${error}`);
            throw error;
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
            this.subAgents = state.subAgents;
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

    async launchSubAgent(actionVerb: string, inputs: Map<string, PluginInput>) {
        this.logAndSay(`Launching new sub-agent `);
        const newSubAgent = new Agent({ actionVerb, inputs, missionId: this.missionId, id: uuidv4(), agentSetUrl: this.agentSetUrl, postOfficeUrl: this.postOfficeUrl, missionContext: this.missionContext });
        this.subAgents.push(newSubAgent);
        await newSubAgent.initializeAgent();
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
        } catch (error) {
            console.error(`Failed to notify TrafficManager about agent ${this.id}:`, error);
        }
    }

    private async hasDependentAgents(): Promise<boolean> {
        try {
          const response = await axios.get(`http://${this.trafficManagerUrl}/dependentAgents/${this.id}`);
          const dependentAgents = response.data;
          return dependentAgents.length > 0;
        } catch (error) {
          console.error('Error checking for dependent agents:', error);
          return false;
        }
      }
    
}