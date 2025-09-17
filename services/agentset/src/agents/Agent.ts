import { BaseEntity, MessageType, PluginOutput, PluginParameterType, InputValue } from '@cktmcs/shared';
import { Step, StepStatus, createFromPlan } from './Step';
import { StateManager } from '../utils/StateManager';
import { AgentErrorRecovery } from './AgentErrorRecovery';
import { AgentWorkProductManager } from './AgentWorkProductManager';
import { AgentStepExecutor } from './AgentStepExecutor';
import { AgentCollaboration } from './AgentCollaboration';
import { CollaborationMessageType, TaskDelegationRequest, TaskResult, KnowledgeSharing, ConflictResolutionResponse } from '../collaboration/CollaborationProtocol';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { getServiceUrls } from '../utils/postOfficeInterface';

export enum AgentStatus {
    INITIALIZING = 'initializing',
    RUNNING = 'running',
    PAUSED = 'paused',
    COMPLETED = 'completed',
    ERROR = 'error',
    ABORTED = 'aborted',
    WAITING_FOR_USER_INPUT = 'waiting_for_user_input'
}

export class Agent extends BaseEntity {
    id: string;
    goal: string;
    steps: Step[] = [];
    status: AgentStatus = AgentStatus.INITIALIZING;
    missionId: string;
    agentPersistenceManager: AgentPersistenceManager;
    stateManager: StateManager;
    
    // Service URLs
    capabilitiesManagerUrl: string = '';
    trafficManagerUrl: string = '';
    librarianUrl: string = '';
    missionControlUrl: string = '';
    
    // Agent modules
    private errorRecovery: AgentErrorRecovery;
    private workProductManager: AgentWorkProductManager;
    private stepExecutor: AgentStepExecutor;
    private collaboration: AgentCollaboration;
    
    // Agent properties
    conversation: Array<{ role: string, content: string }> = [];
    role: string = 'executor';
    roleCustomizations?: any;

    constructor(id: string, goal: string, missionId: string, steps: Step[] = []) {
        super(id, 'Agent', 'localhost', '0');
        this.id = id;
        this.goal = goal;
        this.missionId = missionId;
        this.steps = steps;
        this.agentPersistenceManager = new AgentPersistenceManager(this.id);
        this.stateManager = new StateManager(this.id, this.agentPersistenceManager);
        
        // Initialize modules
        this.errorRecovery = new AgentErrorRecovery(this.id, this);
        this.workProductManager = new AgentWorkProductManager(this.id, this.missionId, this, this.agentPersistenceManager);
        this.stepExecutor = new AgentStepExecutor(this.id, this.missionId, this, this.errorRecovery, this.workProductManager);
        this.collaboration = new AgentCollaboration(this.id, this.missionId, this);
    }

    async initialize(): Promise<void> {
        try {
            await this.initializeServiceDiscovery();
            await this.loadServiceUrls();
            await this.loadAgentState();
            this.status = AgentStatus.RUNNING;
            console.log(`Agent ${this.id} initialized successfully`);
        } catch (error) {
            console.error(`Failed to initialize agent ${this.id}:`, error);
            this.status = AgentStatus.ERROR;
            throw error;
        }
    }

    async runAgent(): Promise<void> {
        try {
            if (this.status !== AgentStatus.RUNNING) {
                return;
            }

            // Run proactive error resolution before checking for executable steps
            await this.errorRecovery.proactiveErrorResolution(this.steps);

            const executableSteps = this.stepExecutor.getExecutableSteps(this.steps);

            if (executableSteps.length > 0) {
                const executionPromises = executableSteps.map(step => this.stepExecutor.executeStep(step, this.steps));
                await Promise.all(executionPromises);
            } else if (this.stepExecutor.hasPendingSteps(this.steps)) {
                // Check if any steps are waiting for user input that might have been resolved
                await this.stepExecutor.checkAndResumeWaitingSteps(this.steps);
                
                // Re-check for executable steps after potential resumption
                const newExecutableSteps = this.stepExecutor.getExecutableSteps(this.steps);
                if (newExecutableSteps.length > 0) {
                    const executionPromises = newExecutableSteps.map(step => this.stepExecutor.executeStep(step, this.steps));
                    await Promise.all(executionPromises);
                } else {
                    // Cancel steps with permanently unsatisfied dependencies
                    this.stepExecutor.cancelUnsatisfiedSteps(this.steps);
                }
            } else if (!this.hasActiveWork()) {
                this.status = AgentStatus.COMPLETED;
                const finalStep = this.steps.filter(s => s.status === StepStatus.COMPLETED).pop();
                if (finalStep && finalStep.result) {
                    await this.workProductManager.saveWorkProductWithClassification(
                        finalStep.id, 
                        finalStep.result, 
                        true, 
                        this.steps
                    );
                }
                console.log(`Agent ${this.id} completed all work`);
            }

            await this.saveAgentState();
            await this.notifyTrafficManager();

        } catch (error) {
            console.error(`Error in runAgent for ${this.id}:`, error);
            this.status = AgentStatus.ERROR;
            await this.saveAgentState();
        }
    }

    async handleBaseMessage(message: any): Promise<void> {
        await super.handleBaseMessage(message);
        switch (message.type) {
            case MessageType.USER_MESSAGE:
                this.addToConversation('user', message.content.message);
                break;
            case 'USER_INPUT_RESPONSE':
                const { requestId, answer } = message.content;
                const handled = await this.stepExecutor.handleUserInputResponse(requestId, answer, this.steps);
                if (handled) {
                    await this.notifyTrafficManager();
                    this.runAgent();
                }
                break;
            case CollaborationMessageType.TASK_DELEGATION:
                await this.collaboration.handleTaskDelegation(message.content as TaskDelegationRequest, this.steps);
                break;
            case CollaborationMessageType.TASK_RESULT:
                await this.collaboration.handleTaskResult(message.content as TaskResult, this.steps);
                break;
            case CollaborationMessageType.KNOWLEDGE_SHARE:
                await this.collaboration.handleKnowledgeShare(message.content as KnowledgeSharing, this.steps);
                break;
            case CollaborationMessageType.CONFLICT_RESOLUTION:
                await this.collaboration.handleConflictResolution(message.content as ConflictResolutionResponse);
                break;
            default:
                break;
        }
    }

    // Public methods for external access
    async delegateStep(stepId: string, targetAgentId: string): Promise<void> {
        const step = this.steps.find(s => s.id === stepId);
        if (step) {
            await this.collaboration.delegateStep(step, targetAgentId);
        }
    }

    async shareKnowledge(knowledge: any, targetAgents: string[] = []): Promise<void> {
        await this.collaboration.shareKnowledge(knowledge, targetAgents);
    }

    addToConversation(role: string, content: string): void {
        this.conversation.push({ role, content });
    }

    async say(message: string): Promise<void> {
        console.log(`[Agent ${this.id}] ${message}`);
        this.sendMessage(MessageType.AGENT_MESSAGE, 'user', {
            agentId: this.id,
            message: message,
            timestamp: new Date().toISOString()
        });
    }

    async addStepsFromPlan(plan: any): Promise<void> {
        try {
            const newSteps = createFromPlan(plan, this.steps.length + 1, this.agentPersistenceManager);
            this.steps.push(...newSteps);
            await this.saveAgentState();
            console.log(`Agent ${this.id} added ${newSteps.length} steps from plan`);
        } catch (error) {
            console.error(`Error adding steps from plan:`, error);
            throw error;
        }
    }

    // Legacy compatibility methods
    getMissionId(): string { return this.missionId; }
    getStatus(): AgentStatus { return this.status; }
    getSteps(): Step[] { return this.steps; }
    async pause(): Promise<void> { this.status = AgentStatus.PAUSED; }
    async resume(): Promise<void> { this.status = AgentStatus.RUNNING; await this.runAgent(); }
    async abort(): Promise<void> { this.status = AgentStatus.ABORTED; }
    async cleanup(): Promise<void> { /* cleanup logic */ }
    async start(): Promise<void> { await this.runAgent(); }
    async getAgentState(): Promise<any> { return { id: this.id, status: this.status, steps: this.steps }; }
    async getOutput(): Promise<any> { return this.steps.filter(s => s.status === StepStatus.COMPLETED).map(s => s.result); }
    handleMessage(message: any): Promise<void> { return this.handleBaseMessage(message); }
    handleCollaborationMessage(message: any): Promise<void> { return this.handleBaseMessage(message); }
    getActionVerb(): string { return 'AGENT'; }
    setRole(roleId: string): void { this.role = roleId; }
    setSystemPrompt(prompt: string): void { /* set system prompt */ }
    setCapabilities(capabilities: any): void { /* set capabilities */ }
    async storeInContext(key: string, value: any): Promise<void> { /* store in context */ }
    setupCheckpointing(interval: number): void { /* setup checkpointing */ }
    getLastFailedStep(): Step | undefined { return this.steps.find(s => s.status === StepStatus.ERROR); }
    async replanFromFailure(step: Step): Promise<void> { /* replan from failure */ }
    async getStatistics(): Promise<any> { return {}; }
    getMissionContext(): string { return ''; }
    inputValues: Map<string, any> = new Map();

    private async loadServiceUrls(): Promise<void> {
        try {
            const urls = await getServiceUrls(this);
            this.capabilitiesManagerUrl = urls.capabilitiesManagerUrl;
            this.trafficManagerUrl = urls.trafficManagerUrl;
            this.librarianUrl = urls.librarianUrl;
            this.missionControlUrl = urls.missionControlUrl;
        } catch (error) {
            console.error(`Failed to load service URLs for agent ${this.id}:`, error);
            throw error;
        }
    }

    async saveAgentState(): Promise<void> {
        try {
            await this.stateManager.saveState({
                id: this.id,
                goal: this.goal,
                status: this.status,
                steps: this.steps,
                conversation: this.conversation,
                missionId: this.missionId
            });
        } catch (error) {
            console.error(`Failed to save state for agent ${this.id}:`, error);
        }
    }

    private async loadAgentState(): Promise<void> {
        try {
            const state = await this.stateManager.loadState();
            if (state) {
                this.goal = state.goal || this.goal;
                this.status = state.status || this.status;
                this.steps = state.steps || this.steps;
                this.conversation = state.conversation || this.conversation;
                console.log(`Loaded state for agent ${this.id}`);
            }
        } catch (error) {
            console.error(`Failed to load state for agent ${this.id}:`, error);
        }
    }

    private async notifyTrafficManager(): Promise<void> {
        try {
            if (this.trafficManagerUrl) {
                await this.authenticatedApi.post(`http://${this.trafficManagerUrl}/agentStatusUpdate`, {
                    agentId: this.id,
                    status: this.status,
                    missionId: this.missionId,
                    activeSteps: this.steps.filter(s => s.status === StepStatus.RUNNING).length,
                    completedSteps: this.steps.filter(s => s.status === StepStatus.COMPLETED).length,
                    errorSteps: this.steps.filter(s => s.status === StepStatus.ERROR).length
                });
            }
        } catch (error) {
            console.error(`Failed to notify TrafficManager for agent ${this.id}:`, error);
        }
    }

    private hasActiveWork(): boolean {
        return this.steps.some(step => 
            step.status === StepStatus.PENDING || 
            step.status === StepStatus.RUNNING || 
            step.status === StepStatus.WAITING
        );
    }
}
