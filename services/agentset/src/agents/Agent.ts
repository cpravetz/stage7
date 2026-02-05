import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import axios from 'axios';
import { AgentStatus } from '../utils/agentStatus';
import { getServiceUrls } from '../utils/postOfficeInterface';
import { MapSerializer, BaseEntity, LLMConversationType } from '@cktmcs/shared';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { PluginOutput, PluginParameterType, InputValue, ExecutionContext as PlanExecutionContext, ActionVerbTask, StepDependency } from '@cktmcs/shared';
import { AgentConfig, AgentStatistics, OutputType } from '@cktmcs/shared';
import * as MessageModule from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { Step, StepStatus, createFromPlan, StepExecutionAgentContext } from './Step';
import { CrossAgentDependencyResolver } from '../utils/CrossAgentDependencyResolver';
import { AgentSet } from '../AgentSet';
import { StateManager } from '../utils/StateManager';
import { CollaborationManager } from './CollaborationManager';
import { ReflectionManager } from './ReflectionManager';
import { MessageQueueManager } from './MessageQueueManager';
import { BrainClient } from './BrainClient';
import { UserInteractionManager } from './UserInteractionManager';
import { LifecycleManager } from './LifecycleManager';

export class Agent extends BaseEntity {

    public lastActivityTime: number = Date.now();
    private cleanupHandlers: Array<() => Promise<void>> = [];

    private missionContext: string = '';
    private agentSetUrl: string;
    public agentPersistenceManager: AgentPersistenceManager;
    private stateManager: StateManager;
    inputValues: Map<string, InputValue> | undefined;
    status: AgentStatus;
    steps: Step[] = [];
    dependencies: string[];
    output: any;
    missionId: string;
    userId?: string;
    agentClass?: string;
    instanceId?: string;
    capabilitiesManagerUrl: string = '';
    brainUrl: string = '';
    librarianUrl: string = '';
    conversation: Array<{ role: string, content: string }> = [];
    role: string = 'executor';
    roleCustomizations?: any;
    private waitingSteps: Map<string, string> = new Map();
    private lastFailedStep: Step | null = null;
    private _initializationPromise: Promise<boolean>;
    private agentSet: AgentSet;
    private crossAgentResolver: CrossAgentDependencyResolver;
    public delegatedStepIds: Set<string> = new Set();
    private systemPrompt: string = '';
    private capabilities: string[] = [];
    private agentContext: Map<string, any> = new Map();
    
    // Managers
    private collaborationManager: CollaborationManager;
    private reflectionManager: ReflectionManager;
    private messageQueueManager: MessageQueueManager;
    private brainClient: BrainClient;
    private userInteractionManager: UserInteractionManager;
    private lifecycleManager: LifecycleManager;
    
    // Lifecycle state
    public executionAbortController: AbortController | null = null;

    public get initialized(): Promise<boolean> {
        return this._initializationPromise;
    }

    constructor(config: AgentConfig & { agentSet: AgentSet }) {
        super(config.id, 'Agent', config.agentSet.id, config.agentSet.port, true);
        this.agentSet = config.agentSet;
        this.crossAgentResolver = new CrossAgentDependencyResolver(this.agentSet);
        this.agentPersistenceManager = new AgentPersistenceManager(undefined, this.authenticatedApi);
        this.stateManager = new StateManager(config.id, this.agentPersistenceManager, this.crossAgentResolver);
        this.inputValues = config.inputValues instanceof Map ? config.inputValues : new Map(Object.entries(config.inputValues||{}));
        this.missionId = config.missionId;
        this.userId = config.userId;
        this.agentClass = config.agentClass;
        this.instanceId = config.instanceId;
        this.agentSetUrl = config.agentSetUrl;
        this.status = AgentStatus.INITIALIZING;
        this.dependencies = config.dependencies || [];
        
        if (config.missionContext && config.missionContext.trim() !== '') {
            this.missionContext = config.missionContext;
        } else if (this.inputValues?.has('goal')) {
            const goalInput = this.inputValues.get('goal');
            if (goalInput?.value && typeof goalInput.value === 'string') {
                this.missionContext = goalInput.value;
            }
        }
        if ('role' in config && typeof config.role === 'string') {
            this.role = config.role;
        }
        if ('roleCustomizations' in config && config.roleCustomizations) {
            this.roleCustomizations = config.roleCustomizations;
        }

        // Only create an initial ACCOMPLISH step if this is a root agent (no parent dependency)
        if (this.dependencies.length === 0) {
            if (!config.actionVerb) {
                throw new Error(`Missing required property 'actionVerb' for root agent config`);
            }
            const initialStep = this.createStep(
                config.actionVerb,
                this.inputValues,
                'Initial mission step',
                StepStatus.PENDING,
            );
            this.steps.push(initialStep);
        }
        
        this.setAgentStatus(this.status,{eventType: 'agent_created', inputValues: MapSerializer.transformForSerialization(this.inputValues)});

        this.updateStatus = this.updateStatus.bind(this);
        
        // Initialize managers
        this.collaborationManager = new CollaborationManager(this.createCollaborationContext(), this.agentSet, this.crossAgentResolver);
        this.reflectionManager = new ReflectionManager(this.createReflectionContext());
        this.messageQueueManager = new MessageQueueManager({ id: this.id, setAgentStatus: this.setAgentStatus.bind(this) });
        this.brainClient = new BrainClient(this.createBrainContext());
        this.userInteractionManager = new UserInteractionManager(this.createUserInteractionContext());
        this.lifecycleManager = new LifecycleManager(this.createLifecycleContext());
        this.lifecycleManager.setResolveQuestionCallback(() => this.userInteractionManager.resolveWithEmpty());

        // Await RabbitMQ initialization before proceeding
        this._initializationPromise = this.messageQueueManager.initialize()
            .then(() => this.initializeAgent())
            .then(() => {
                this.say(`Agent ${this.id} initialized and commencing operations.`);
                this.runUntilDone();
                return true;
            }).catch((error) => {
                this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_initialization_failed', error: error instanceof Error ? error.message : String(error)});
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`Agent ${this.id} failed during initialization or before starting execution loop. Error: ${errorMessage}`);
                this.say(`Agent ${this.id} failed to initialize or start. Error: ${errorMessage}`);
                return false;
            });
    }

    // Context factory methods for managers
    private createReflectionContext() {
        return {
            id: this.id,
            missionId: this.missionId,
            role: this.role,
            status: this.status,
            steps: this.steps,
            agentPersistenceManager: this.agentPersistenceManager,
            crossAgentResolver: this.crossAgentResolver,
            createStep: this.createStep.bind(this),
            logEvent: this.logEvent.bind(this),
            updateStatus: this.updateStatus.bind(this),
            say: this.say.bind(this),
            setAgentStatus: this.setAgentStatus.bind(this),
            addStepsFromPlan: this.addStepsFromPlan.bind(this),
            addToConversation: this.addToConversation.bind(this)
        };
    }

    private createBrainContext() {
        return {
            id: this.id,
            status: this.status,
            brainUrl: this.brainUrl,
            missionContext: this.missionContext,
            conversation: this.conversation,
            authenticatedApi: this.authenticatedApi
        };
    }

    private createCollaborationContext() {
        return {
            id: this.id,
            missionId: this.missionId,
            brainUrl: this.brainUrl,
            steps: this.steps,
            agentPersistenceManager: this.agentPersistenceManager,
            authenticatedApi: this.authenticatedApi,
            delegatedStepIds: this.delegatedStepIds,
            say: this.say.bind(this),
            storeInContext: this.storeInContext.bind(this)
        };
    }

    private createUserInteractionContext() {
        return {
            id: this.id,
            status: this.status,
            questions: this.questions,
            say: this.say.bind(this),
            logAndSay: this.logAndSay.bind(this),
            ask: this.ask.bind(this)
        };
    }

    private createLifecycleContext() {
        return {
            id: this.id,
            status: this.status,
            stateManager: this.stateManager,
            executionAbortController: this.executionAbortController,
            setAgentStatus: this.setAgentStatus.bind(this),
            saveAgentState: this.saveAgentState.bind(this),
            runAgent: this.runAgent.bind(this),
            toAgentState: this.toAgentState.bind(this)
        };
    }

    private createStepExecutionContext(): StepExecutionAgentContext {
        return {
            id: this.id,
            agentSetUrl: this.agentSetUrl,
            steps: this.steps,
            agentSet: this.agentSet
        };
    }

    public setSystemPrompt(prompt: string): void {
        this.systemPrompt = prompt;
        const systemMessageIndex = this.conversation.findIndex(m => m.role === 'system');
        if (systemMessageIndex !== -1) {
            this.conversation[systemMessageIndex].content = prompt;
        } else {
            this.conversation.unshift({ role: 'system', content: prompt });
        }
        this.logEvent({
            eventType: 'system_prompt_updated',
            agentId: this.id,
            prompt: prompt,
        });
    }

    public setCapabilities(capabilities: string[]): void {
        this.capabilities = capabilities;
        this.logEvent({
            eventType: 'capabilities_updated',
            agentId: this.id,
            capabilities: capabilities,
        });
    }

    public storeInContext(key: string, value: any): void {
        this.agentContext.set(key, value);
        this.logEvent({
            eventType: 'context_stored',
            agentId: this.id,
            key: key,
            value: this.truncateLargeStrings(value)
        });
    }

    public createStep(actionVerb: string, inputValues: Map<string, InputValue> | undefined, description: string, status: StepStatus, dependencies: StepDependency[] = []): Step {
        const newStep = new Step({
            actionVerb: actionVerb,
            missionId: this.missionId,
            ownerAgentId: this.id,
            inputValues: inputValues,
            description: description,
            status: status,
            dependencies: dependencies,
            persistenceManager: this.agentPersistenceManager,
            crossAgentResolver: this.crossAgentResolver
        });
        this.agentSet.registerStepLocation(newStep.id, this.id, this.agentSet.url);
        return newStep;
    }

    async cleanup(): Promise<void> {
        this.lastActivityTime = Date.now();
        await this.messageQueueManager.cleanup();
        return Promise.all(this.cleanupHandlers.map(handler => handler())).then(() => {});
    }

    public getLastActivityTime(): number {
        return this.lastActivityTime;
    }

    public addCleanupHandler(handler: () => Promise<void>): void {
        this.cleanupHandlers.push(handler);
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
        await this.updateStatus();
        while (true) {
            while (await this.hasActiveWork()) {
                await this.runAgent();
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            if (!this.reflectionManager.reflectionDone && this.status === AgentStatus.RUNNING) {
                console.log(`[Agent ${this.id}] runUntilDone: No active work left — creating end-of-mission REFLECT.`);
                try {
                    const sourceStepIds = new Set<string>();
                    this.steps.forEach(step => {
                        step.dependencies.forEach(dep => {
                            sourceStepIds.add(dep.sourceStepId);
                        });
                    });
                    const finalSteps = this.steps.filter(step => !sourceStepIds.has(step.id));
                    await this.reflectionManager.createEndOfMissionReflect(finalSteps);
                    this.reflectionManager.reflectionDone = true;
                    continue;
                } catch (e) {
                    console.error(`Agent ${this.id} failed to create end-of-mission REFLECT:`, e instanceof Error ? e.message : e);
                }
            }

            if (!this.hasActiveWork() && this.reflectionManager.reflectionDone && this.status === AgentStatus.RUNNING) {
                console.log(`[Agent ${this.id}] runUntilDone: No active work and reflection done. Finalizing mission.`);
                this.setAgentStatus(AgentStatus.COMPLETED, { eventType: 'agent_completed' });
                const finalStep = this.steps.filter(s => s.status === StepStatus.COMPLETED).pop();
                if (finalStep) {
                    this.output = await this.agentPersistenceManager.loadStepWorkProduct(this.id, finalStep.id);
                }
            } else if (this.status !== AgentStatus.COMPLETED) {
                console.log(`[Agent ${this.id}] runUntilDone: Agent loop exited with status: ${this.status}. No active work remaining.`);
            }

            return this.status;
        }
    }

    public start(): void {
        console.log(`Starting agent ${this.id}`);
        this.runUntilDone().catch(error => {
            console.error(`Error running agent ${this.id}:`, error instanceof Error ? error.message : error);
            this.status = AgentStatus.ERROR;
            this.logEvent({
                eventType: 'agent_error',
                agentId: this.id,
                missionId: this.missionId,
                status: this.status,
                timestamp: new Date().toISOString()
            });
        });
    }

    public async updateStatus(): Promise<void> {
        const agentId = this.id;
        const agentStatus = this.status || AgentStatus.UNKNOWN;
        const missionId = this.missionId || 'unknown-mission-id';
        const timestamp = new Date().toISOString();

        const results = await Promise.allSettled([
            (async () => {
                this.messageQueueManager.publish('agent.events', 'agent.status.update', { agentId, status: agentStatus, missionId, timestamp });
            })(),
            (async () => {
                const stats = await this.getStatistics();
                const missionControlMessage = { agentId, status: agentStatus, statistics: stats, missionId, timestamp };
                await this.sendMessage(MessageModule.MessageType.AGENT_UPDATE, 'missioncontrol', missionControlMessage, false, 'developer');
            })()
        ]);

        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const channel = index === 0 ? 'RabbitMQ' : 'MissionControl';
                if (result.reason instanceof Error) {
                    console.error(`[Agent ${this.id}] Failed to send status update to ${channel}: ${result.reason.message}`, result.reason.stack);
                    analyzeError(result.reason);
                } else {
                    console.error(`[Agent ${this.id}] Failed to send status update to ${channel} with unknown error:`, result.reason);
                }
            }
        });
    }

    public async setAgentStatus(status = AgentStatus.UNKNOWN, logData: any = {}) {
        this.status = status;
        logData = {...logData, agentId: this.id, missionId: this.missionId, status: this.status, timestamp: new Date().toISOString()};
        this.logEvent(logData);
        await this.updateStatus();
    }

    private async initializeAgent() {
        console.log(`[Agent ${this.id}] calling initializeAgent()`);
        try {
            const { capabilitiesManagerUrl, brainUrl, librarianUrl } = await getServiceUrls(this);
            this.capabilitiesManagerUrl = capabilitiesManagerUrl;
            this.brainUrl = brainUrl;
            this.librarianUrl = librarianUrl;
            console.log(`[Agent ${this.id}] Initialized capabilitiesManagerUrl: ${this.capabilitiesManagerUrl}`);

            this.setAgentStatus(AgentStatus.RUNNING, {eventType: 'agent_initialized'});
            console.log(`[Agent ${this.id}] initialized with status ${this.status}`);
            if (this.missionContext && this.steps[0]?.actionVerb === 'ACCOMPLISH') {
                await this.prepareOpeningInstruction();
            }
            return true;
        } catch (error) {
            analyzeError(error as Error);
            console.error('Error initializing agent:', error instanceof Error ? error.message : error);
            this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_initialization_failed'});
            return false;
        }
    }

    private async prepareOpeningInstruction() {
        const openingInstruction = `
Mission Context: ${this.missionContext}

Please consider this context when planning and executing the mission. Provide detailed and well-structured responses, and use the most appropriate actionVerbs for each task.
        `;
        this.addToConversation('system', openingInstruction);
    }

    private async hasActiveWork(): Promise<boolean> {
        const localActiveSteps = this.steps.filter(step =>
            step.status === StepStatus.PENDING ||
            step.status === StepStatus.RUNNING ||
            step.status === StepStatus.WAITING
        );
        if (localActiveSteps.length > 0) return true;
        if (this.delegatedStepIds.size > 0) return true;
        return false;
    }

    private async executeStep(step: Step): Promise<void> {
        try {
            if (this.status !== AgentStatus.RUNNING) return;

            step.inputValues = await step.dereferenceInputsForExecution(this.steps, this.missionId);
            this.say(`Executing step: ${step.actionVerb} - ${step.description || 'No description'}`);

            const result = await step.execute(
                this.executeActionWithCapabilitiesManager.bind(this),
                this.useBrainForReasoning.bind(this),
                this.createSubAgent.bind(this),
                this.handleAskStep.bind(this),
                this.steps,
                this.createStepExecutionContext()
            );

            if (result && result.length > 0 && !result[0].success && result[0].resultType === PluginParameterType.ERROR) {
                const error = new Error(result[0].error || result[0].result || 'Step execution failed');
                await this.handleStepFailure(step, error);
                return;
            }

            console.log(`[Agent ${this.id}] executeStep: Checking result for pending_user_input. Result: ${JSON.stringify(this.truncateLargeStrings(result))}`);

            if (result && result.length > 0 && result[0].name === 'pending_user_input') {
                console.log(`[Agent ${this.id}] executeStep: Detected pending_user_input. RequestId: ${(result[0] as any).request_id}`);
                const requestId = (result[0] as any).request_id;
                if (requestId) {
                    if (await this.stepHasUnresolvedPlaceholders(step)) {
                        console.log(`[Agent ${this.id}] Step ${step.id} has unresolved placeholders, retrying with resolved values`);
                        await this.retryStepWithResolvedPlaceholders(step);
                        return;
                    }
                    step.status = StepStatus.WAITING;
                    this.waitingSteps.set(requestId, step.id);
                    console.log(`[Agent ${this.id}] Step ${step.id} is now WAITING for user input with requestId: ${requestId}.`);
                    return;
                }
            } else if (result && result.length > 0 && result[0].name === 'status' && result[0].result === StepStatus.WAITING) {
                console.log(`[Agent ${this.id}] executeStep: REGROUP step ${step.id} is WAITING for dependent steps.`);
                step.status = StepStatus.WAITING;
                return;
            }

            this.say(`Completed step: ${step.actionVerb}`);

            if (step.actionVerb === 'REFLECT') {
                await this.reflectionManager.handleReflectionResult(result, step);
                await this.handleStepSuccess(step, result);
                return;
            } else if (result.some(r => r.resultType === PluginParameterType.PLAN)) {
                const mappedResult = await step.mapPluginOutputsToCustomNames(result);
                const planOutput = mappedResult.find(r => r.resultType === PluginParameterType.PLAN);
                
                if (!planOutput) {
                    const errorMessage = `Error: A result of type 'plan' was expected but not found in the output.`;
                    console.error(`[Agent.ts] runAgent (${this.id}): ${errorMessage}`);
                    this.say(`Failed to process a generated plan.`);
                    await this.handleStepFailure(step, new Error(errorMessage));
                    return;
                }

                const planningStepResult = planOutput.result;
                let actualPlanArray: ActionVerbTask[] | undefined = undefined;

                if (Array.isArray(planningStepResult)) {
                    actualPlanArray = planningStepResult as ActionVerbTask[];
                } else if (typeof planningStepResult === 'object' && planningStepResult !== null) {
                    if (planningStepResult.plan && Array.isArray(planningStepResult.plan)) {
                        actualPlanArray = planningStepResult.plan as ActionVerbTask[];
                    } else if ((planningStepResult as any).tasks && Array.isArray((planningStepResult as any).tasks)) {
                        actualPlanArray = (planningStepResult as any).tasks as ActionVerbTask[];
                    } else if ((planningStepResult as any).steps && Array.isArray((planningStepResult as any).steps)) {
                        actualPlanArray = (planningStepResult as any).steps as ActionVerbTask[];
                    }
                }

                if (actualPlanArray && Array.isArray(actualPlanArray)) {
                    this.say(`Generated a plan with ${actualPlanArray.length} steps`);
                    console.log(`[Agent ${this.id}] runAgent: Planning step ${step.id} generated plan:`, JSON.stringify(actualPlanArray));
                    await this.saveWorkProductWithClassification(step, mappedResult);
                    const workstreamStartIndex = this.steps.length;
                    this.addStepsFromPlan(actualPlanArray, step);
                    const workstreamSteps = this.steps.slice(workstreamStartIndex);
                    this.rewireDependenciesForReplacedStep(step, workstreamSteps);
                    step.status = StepStatus.REPLACED;
                    step.result = mappedResult;
                    await this.updateStatus();
                    return;
                } else {
                    const errorMessage = `Error: Expected a plan, but received: ${JSON.stringify(planningStepResult)}`;
                    console.error(`[Agent.ts] runAgent (${this.id}): ${errorMessage}`);
                    this.say(`Failed to generate a valid plan.`);
                    this.setAgentStatus(AgentStatus.ERROR, { eventType: 'agent_error', error: errorMessage });
                }
            }

            if ((this.status as AgentStatus) !== AgentStatus.ERROR) {
                await this.handleStepSuccess(step, result);
            }
        } catch (error) {
            await this.handleStepFailure(step, error as Error);
        }
    }

    public async runAgent() {
        try {
            if (this.status !== AgentStatus.RUNNING) {
                console.log(`[Agent ${this.id}] runAgent() exiting early because status is: ${this.status}`);
                return;
            }

            const pendingSteps = this.steps.filter(step => step.status === StepStatus.PENDING);
            const executableSteps: Step[] = [];
            for (const step of pendingSteps) {
                if (await step.areDependenciesSatisfied(this.steps)) {
                    executableSteps.push(step);
                }
            }

            if (executableSteps.length > 0) {
                const stepsToDelegate = new Map<string, Step[]>();
                const stepsToExecuteLocally: Step[] = [];

                for (const step of executableSteps) {
                    const role = step.recommendedRole;
                    if (role && role !== this.role && this.role !== 'coordinator') {
                        if (!stepsToDelegate.has(role)) {
                            stepsToDelegate.set(role, []);
                        }
                        stepsToDelegate.get(role)!.push(step);
                    } else {
                        stepsToExecuteLocally.push(step);
                    }
                }

                const allPromises: Promise<any>[] = [];

                for (const [role, steps] of stepsToDelegate.entries()) {
                    const delegationPromise = (async () => {
                        const recipientId = await this.collaborationManager.getOrCreateSpecializedAgent(role);
                        if (recipientId) {
                            for (const step of steps) {
                                const migrationResult = await this.collaborationManager.migrateStepToSpecializedAgent(step, recipientId);
                                if (migrationResult.success) {
                                    this.steps = this.steps.filter(s => s.id !== step.id);
                                    console.log(`[Agent ${this.id}] Removed migrated step ${step.id} from local steps.`);
                                }
                            }
                        } else {
                            console.error(`[Agent ${this.id}] Could not find or create agent for role ${role}. Moving ${steps.length} steps to local execution.`);
                            stepsToExecuteLocally.push(...steps);
                        }
                    })();
                    allPromises.push(delegationPromise);
                }

                if (stepsToExecuteLocally.length > 0) {
                    const localExecutionPromises = stepsToExecuteLocally.map(step => this.executeStep(step));
                    allPromises.push(...localExecutionPromises);
                }
                
                await Promise.all(allPromises);

            } else if (pendingSteps.length > 0) {
                for (const step of pendingSteps) {
                    if (await step.areDependenciesPermanentlyUnsatisfied(this.steps)) {
                        step.status = StepStatus.CANCELLED;
                        this.logEvent({
                            eventType: 'step_cancelled_dependency_unsatisfied',
                            agentId: this.id,
                            stepId: step.id,
                            dependencies: step.dependencies,
                            timestamp: new Date().toISOString()
                        });
                        console.log(`[Agent ${this.id}] Cancelling step ${step.id} (${step.actionVerb}) due to permanently unsatisfied dependencies.`);
                    }
                }
            }
        } catch (error) {
            console.error('Error in agent main loop:', error instanceof Error ? error.message : error);
            this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_error', error: error instanceof Error ? error.message : String(error)});
            this.say(`Error in agent execution: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    public addStepsFromPlan(plan: ActionVerbTask[], parentStep: Step) {
        console.log(`[Agent ${this.id}] DEBUG: Agent.addStepsFromPlan: Received plan with ${plan.length} steps.`);
        const newSteps = createFromPlan(plan, this.agentPersistenceManager, this.crossAgentResolver, parentStep, this);
        this.steps.push(...newSteps);
        console.log(`[Agent ${this.id}] DEBUG: Agent.addStepsFromPlan: this.steps now contains ${this.steps.length} steps.`);
        for (const step of newSteps) {
            this.agentSet.registerStepLocation(step.id, this.id, this.agentSet.url);
        }
    }

    private rewireDependenciesForReplacedStep(replacedStep: Step, workstreamSteps: Step[]): void {
        if (workstreamSteps.length === 0) {
            console.warn(`[Agent ${this.id}] rewireDependenciesForReplacedStep: No workstream steps provided for replaced step ${replacedStep.id}`);
            return;
        }
    
        const workstreamStepIds = new Set(workstreamSteps.map(s => s.id));
        const finalSteps = workstreamSteps.filter(step => {
            const hasDependents = workstreamSteps.some(otherStep =>
                otherStep.dependencies.some(dep => dep.sourceStepId === step.id)
            );
            return !hasDependents;
        });
    
        if (finalSteps.length === 0) {
            console.warn(`[Agent ${this.id}] rewireDependenciesForReplacedStep: No final steps found in workstream for replaced step ${replacedStep.id}. Using last step as fallback.`);
            finalSteps.push(workstreamSteps[workstreamSteps.length - 1]);
        }
    
        console.log(`[Agent ${this.id}] rewireDependenciesForReplacedStep: Identified ${finalSteps.length} final step(s) in workstream: ${finalSteps.map(s => s.id).join(', ')}`);
    
        const allMissionSteps: Step[] = [];
        for (const agent of this.agentSet.agents.values()) {
            if (agent.missionId === this.missionId) {
                allMissionSteps.push(...agent.getSteps());
            }
        }

        const dependentSteps = allMissionSteps.filter(step =>
            step.dependencies.some(dep => dep.sourceStepId === replacedStep.id)
        );
    
        console.log(`[Agent ${this.id}] rewireDependenciesForReplacedStep: Found ${dependentSteps.length} mission-wide step(s) that depend on replaced step ${replacedStep.id}`);
    
        for (const dependentStep of dependentSteps) {
            console.log(`[Agent ${this.id}] rewireDependenciesForReplacedStep: Rewiring dependencies for step ${dependentStep.id} (${dependentStep.actionVerb})`);
            const depsOnReplacedStep = dependentStep.dependencies.filter(dep => dep.sourceStepId === replacedStep.id);
    
            for (const dep of depsOnReplacedStep) {
                dependentStep.dependencies = dependentStep.dependencies.filter(d => d !== dep);
                let targetFinalStep = finalSteps[0];
                const matchingFinalStep = finalSteps.find(fs => fs.outputs && fs.outputs.has(dep.outputName));
                if (matchingFinalStep) {
                    targetFinalStep = matchingFinalStep;
                } else {
                    console.warn(`[Agent ${this.id}] rewireDependenciesForReplacedStep: Could not find final step with output '${dep.outputName}'. Using first final step ${finalSteps[0].id}`);
                }
    
                const newDep: StepDependency = {
                    inputName: dep.inputName,
                    sourceStepId: targetFinalStep.id,
                    outputName: dep.outputName
                };
                dependentStep.dependencies.push(newDep);
    
                if (dependentStep.inputReferences.has(dep.inputName)) {
                    const inputRef = dependentStep.inputReferences.get(dep.inputName)!;
                    inputRef.sourceId = targetFinalStep.id;
                    dependentStep.inputReferences.set(dep.inputName, inputRef);
                }
    
                console.log(`[Agent ${this.id}] rewireDependenciesForReplacedStep: Rewired dependency '${dep.inputName}' for step ${dependentStep.id} from ${replacedStep.id} to ${targetFinalStep.id}`);
            }
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

        const lastCompletedStep = [...this.steps].reverse().find(step => step.status === 'completed');
        if (!lastCompletedStep) {
            return {
                agentId: this.id,
                status: this.status,
                message: "No completed steps found."
            };
        }

        const finalWorkProduct = await this.agentPersistenceManager.loadStepWorkProduct(this.id, lastCompletedStep.id);
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

    public async handleMessage(message: any): Promise<void> {
        console.log(`Agent ${this.id} received message:`, this.truncateLargeStrings(message));

        if (message.type === 'userMessage') {
            const messageContent = message.content?.message;
            
            // Check if the message content is actually a tool invocation wrapped in a string
            // These should NOT be processed as user chat messages
            if (typeof messageContent === 'string') {
                try {
                    // Try to parse as JSON to detect tool invocations
                    if (messageContent.startsWith('{') || messageContent.startsWith('[')) {
                        const parsed = JSON.parse(messageContent);
                        // Check if it's a tool invocation structure
                        if (parsed.type === 'userMessage' && parsed.content?.type === 'toolInvocation') {
                            console.log(`[Agent ${this.id}] Ignoring wrapped tool invocation - not a chat message`);
                            return;
                        }
                        if (parsed.type === 'toolInvocation' || (parsed.content?.destinationApi && parsed.content?.toolName)) {
                            console.log(`[Agent ${this.id}] Ignoring tool invocation message - not a chat message`);
                            return;
                        }
                    }
                } catch (e) {
                    // Not JSON, treat as normal message
                }
            }
            
            // Also check if content itself has toolInvocation type
            if (message.content?.type === 'toolInvocation') {
                console.log(`[Agent ${this.id}] Ignoring tool invocation - not a chat message`);
                return;
            }

            this.addToConversation('user', messageContent);

            if (this.status === AgentStatus.ERROR || this.status === AgentStatus.COMPLETED) {
                console.log(`[Agent ${this.id}] Resetting agent status from ${this.status} to RUNNING due to new user message.`);
                this.setAgentStatus(AgentStatus.RUNNING, { eventType: 'agent_resumed_from_user_message' });
                this.reflectionManager.reset();
            }

            // For simple conversational messages, respond directly without complex planning
            // Simple messages are short greetings, questions, or statements that don't require task decomposition
            const isSimpleConversationalMessage = this.isSimpleConversationalMessage(messageContent);
            
            if (isSimpleConversationalMessage) {
                console.log(`[Agent ${this.id}] Handling simple conversational message directly`);
                await this.handleSimpleConversationalMessage(messageContent);
                return;
            }

            // For complex messages that require planning, create an ACCOMPLISH step
            const newInputs = new Map<string, InputValue>();
            newInputs.set('goal', {
                inputName: 'goal',
                value: messageContent,
                valueType: PluginParameterType.STRING,
                args: {}
            });

            const newStep = this.createStep(
                'ACCOMPLISH',
                newInputs,
                `Process user message: ${messageContent.substring(0, 50)}...`,
                StepStatus.PENDING,
                []
            );
            this.steps.push(newStep);

            console.log(`[Agent ${this.id}] Agent status is ${this.status} before calling runAgent()`);
            this.runAgent();
            return;
        }

        await super.handleBaseMessage(message);
        switch (message.type) {
            case 'USER_INPUT_RESPONSE': {
                const { requestId, response } = message.content;
                console.log(`[Agent ${this.id}] Received USER_INPUT_RESPONSE for requestId: ${requestId}. Current waitingSteps size: ${this.waitingSteps.size}`);
                const waitingStepId = this.waitingSteps.get(requestId);
                if (waitingStepId) {
                    const step = this.steps.find(s => s.id === waitingStepId);
                    if (step) {
                        const outputName = step.outputs?.keys().next().value || 'answer';
                        let finalAnswer = response;
                        if (typeof response === 'object' && response !== null && (response as any).text) {
                            finalAnswer = (response as any).text;
                        }
                        step.result = [{
                            success: true,
                            name: outputName,
                            resultType: PluginParameterType.STRING,
                            result: finalAnswer,
                            resultDescription: 'User response'
                        }];
                        step.status = StepStatus.COMPLETED;
                        this.waitingSteps.delete(requestId);
                        console.log(`[Agent ${this.id}] Processed user input for requestId: ${requestId}. Step ${step.id} is now COMPLETED.`);
                    } else {
                        console.warn(`[Agent ${this.id}] Step with ID ${waitingStepId} not found for requestId ${requestId}.`);
                    }
                } else {
                    console.warn(`[Agent ${this.id}] No waiting step found for requestId: ${requestId}. It might have been already processed or is invalid.`);
                }
                break;
            }
            default:
                break;
        }
    }

    public addToConversation(role: string, content: string) {
        this.conversation.push({ role, content });
    }

    private async handleAskStep(inputs: Map<string, InputValue>): Promise<PluginOutput[]> {
        return this.userInteractionManager.handleAskStep(inputs);
    }

    override onAnswer(answer: express.Request): void {
        if (answer.body.questionGuid && this.questions.includes(answer.body.questionGuid)) {
            this.questions = this.questions.filter(q => q !== answer.body.questionGuid);
        }
        this.userInteractionManager.onAnswer(answer);
    }

    private async saveWorkProductWithClassification(step: Step, data: PluginOutput[]): Promise<void> {
        if (this.status in [AgentStatus.PAUSED, AgentStatus.ABORTED]) {
            console.log(`Agent ${this.id} is in status ${this.status}, skipping saveWorkProduct for step ${step.id}.`);
            return;
        }

        try {
            const outputType = step.getOutputType(this.steps);
            await this.agentPersistenceManager.saveWorkProduct(step, data, outputType);

            const type = outputType === OutputType.FINAL ? 'Final' : outputType === OutputType.PLAN ? 'Plan' : 'Interim';
            const hasDeliverables = step.hasDeliverableOutputs();
            const workproductContent = data[0]?.result;

            const workProductPayload: any = {
                id: step.id,
                type: type,
                scope: step.isEndpoint(this.steps) ? 'AgentOutput' : 'AgentStep',
                name: data[0] ? data[0].resultDescription : 'Step Output',
                agentId: this.id,
                stepId: step.id,
                missionId: this.missionId,
                mimeType: data[0]?.mimeType || 'text/plain',
                fileName: data[0]?.fileName,
                isDeliverable: hasDeliverables,
                workproduct: (type === 'Plan' && data[0]?.result) ?
                    `Plan with ${Array.isArray(data[0].result) ? data[0].result.length : Object.keys(data[0].result).length} steps` : workproductContent
            };

            const visibility = outputType === OutputType.FINAL ? 'user' : 'developer';
            await this.sendMessage(MessageModule.MessageType.WORK_PRODUCT_UPDATE, 'user', workProductPayload, false, visibility);

        } catch (error) {
            analyzeError(error as Error);
            console.error('Error in simplified saveWorkProductWithClassification:', error instanceof Error ? error.message : error);
        }
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

            const roleId = inputs.get('roleId')?.value as string;
            if (roleId) newInputs.delete('roleId');

            const roleCustomizations = inputs.get('roleCustomizations')?.value;
            if (roleCustomizations) newInputs.delete('roleCustomizations');

            const recommendedRole = inputs.get('recommendedRole')?.value as string;
            if (recommendedRole) newInputs.delete('recommendedRole');

            const finalRoleId = roleId || recommendedRole || 'executor';

            const subAgentId = uuidv4();
            const subAgentConfig = {
                agentId: subAgentId,
                actionVerb: 'ACCOMPLISH',
                inputValues: MapSerializer.transformForSerialization(newInputs),
                missionId: this.missionId,
                dependencies: [this.id, ...(this.dependencies || [])],
                userId: this.userId,
                agentClass: this.agentClass,
                instanceId: this.instanceId,
                roleId: finalRoleId,
                roleCustomizations: roleCustomizations
            };

            console.log(`Creating sub-agent with role: ${finalRoleId}`);
            const response = await this.authenticatedApi.post(`${this.agentSetUrl}/addAgent`, subAgentConfig);

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
        } catch (error) {
            analyzeError(error as Error);
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

    private async useBrainForReasoning(inputs: Map<string, InputValue>, actionVerb: string): Promise<PluginOutput[]> {
        return this.brainClient.useBrainForReasoning(inputs, actionVerb);
    }

    private async stepHasUnresolvedPlaceholders(step: Step): Promise<boolean> {
        try {
            const inputsForExecution = await step.dereferenceInputsForExecution(this.steps, this.missionId);
            for (const inputValue of inputsForExecution.values()) {
                if (typeof inputValue.value === 'string') {
                    const placeholderRegex = /\{([^\}]+)\}/g;
                    if (placeholderRegex.test(inputValue.value)) {
                        console.log(`[Agent ${this.id}] Found unresolved placeholder in step ${step.id} input ${inputValue.inputName}`);
                        return true;
                    }
                }
            }
            return false;
        } catch (error) {
            console.error(`[Agent ${this.id}] Error checking placeholders for step ${step.id}:`, error);
            return false;
        }
    }

    private async retryStepWithResolvedPlaceholders(step: Step): Promise<void> {
        console.log(`[Agent ${this.id}] Retrying step ${step.id} (${step.actionVerb}) with resolved placeholders`);
        step.status = StepStatus.PENDING;
        step.result = undefined;

        for (const [requestId, stepId] of this.waitingSteps.entries()) {
            if (stepId === step.id) {
                this.waitingSteps.delete(requestId);
                break;
            }
        }

        this.setAgentStatus(AgentStatus.RUNNING, {eventType: 'agent_resumed_from_waiting'});
        await this.runAgent();
    }

    public async checkAndFixStuckUserInput(): Promise<boolean> {
        for (const [requestId, stepId] of this.waitingSteps.entries()) {
            const step = this.steps.find(s => s.id === stepId);
            if (step && step.status === StepStatus.WAITING) {
                if (await this.stepHasUnresolvedPlaceholders(step)) {
                    console.log(`[Agent ${this.id}] Found stuck step ${step.id} with unresolved placeholders, fixing...`);
                    await this.retryStepWithResolvedPlaceholders(step);
                    return true;
                }
            }
        }
        return false;
    }

    private async executeActionWithCapabilitiesManager(step: Step): Promise<PluginOutput[]> {
        const MAX_RETRIES = 3;
        let attempt = 0;

        while (attempt < MAX_RETRIES) {
            try {
                if (step.actionVerb === 'ASK' || step.actionVerb === 'ASK_USER_QUESTION') {
                    return this.handleAskStep(step.inputValues);
                }

                const payload: Record<string, any> = {
                    actionVerb: step.actionVerb,
                    description: step.description,
                    missionId: step.missionId,
                    outputs: step.outputs,
                    inputValues: MapSerializer.transformForSerialization(step.inputValues),
                    recommendedRole: step.recommendedRole,
                    status: step.status,
                    id: step.id
                };

                step.storeTempData('payload', payload);
                const timeout = step.actionVerb === 'ACCOMPLISH' ? 3600000 : 1800000;

                if (!this.executionAbortController) {
                    this.executionAbortController = new AbortController();
                }
                const signal = this.executionAbortController.signal;

                const response = await this.authenticatedApi.post(
                    `${this.capabilitiesManagerUrl}/executeAction`,
                    payload,
                    { timeout, signal }
                );

                return response.data;
            } catch (error) {
                const isAbort = (error && ((error as any).name === 'AbortError' || (error as any).code === 'ERR_CANCELED' || (error as any).message?.toLowerCase?.().includes('canceled')));
                if (isAbort) {
                    console.log(`[Agent ${this.id}] Execution aborted due to pause/abort. Marking step ${step.id} as PENDING for later retry.`);
                    try { this.executionAbortController = null; } catch {}
                    step.status = StepStatus.PENDING;
                    return [{
                        success: false,
                        name: 'error',
                        resultType: PluginParameterType.ERROR,
                        resultDescription: 'Execution aborted due to pause/abort',
                        result: null,
                        error: 'Execution aborted due to pause/abort'
                    }];
                }

                console.error(`[Attempt ${attempt + 1}/${MAX_RETRIES}] Error executing action with CapabilitiesManager:`, error instanceof Error ? error.message : error);
                attempt++;

                if (attempt >= MAX_RETRIES) {
                    step.status = StepStatus.ERROR;

                    if (axios.isAxiosError(error) && (error.code === 'ECONNABORTED' || !error.response)) {
                        this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_error', details: 'CapabilitiesManager timeout or unreachable'});
                        await this.saveAgentState();
                    }

                    const stepError = error instanceof Error ? error : new Error(`Unknown error occurred ${error}`);
                    try {
                        await this.handleStepFailure(step, stepError);
                    } catch (replanError) {
                        console.error(`[Agent ${this.id}] CRITICAL: Failed to handle step failure and replan. Mission may be stalled. Error:`, replanError);
                        this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_error', details: 'Failed to handle step failure and replan'});
                    }

                    return [{
                        success: false,
                        name: 'error',
                        resultType: PluginParameterType.ERROR,
                        resultDescription: 'Error in executeActionWithCapabilitiesManager',
                        result: null,
                        error: stepError.message
                    }];
                }

                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }

        return [{
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            resultDescription: 'Error in executeActionWithCapabilitiesManager after all retries',
            result: null,
            error: 'Failed to execute action after multiple retries.'
        }];
    }
    
    private async handleStepSuccess(step: Step, result: PluginOutput[]) {
        step.status = StepStatus.COMPLETED;
        step.result = result;
        await this.saveWorkProductWithClassification(step, result);

        const completionOutput: PluginOutput = {
            success: true,
            name: '_step_completed',
            resultType: PluginParameterType.BOOLEAN,
            result: true,
            resultDescription: 'Step has completed successfully.'
        };
        step.result.push(completionOutput);
        
        await this.logEvent({
            eventType: 'step_completed',
            agentId: this.id,
            stepId: step.id,
            result: result,
            timestamp: new Date().toISOString()
        });

        await this.notifyStepCompletion(step);
        await this.updateStatus();
    }
    
    private async handleStepFailure(step: Step, error: Error) {
        step.status = StepStatus.ERROR;
        step.lastError = error;
        await this.logEvent({
            eventType: 'step_failed',
            agentId: this.id,
            stepId: step.id,
            error: error.message,
            timestamp: new Date().toISOString()
        });

        await this.notifyStepCompletion(step);
        await this.updateStatus();
    }

    private async notifyStepCompletion(step: Step): Promise<void> {
        if (step.delegatingAgentId && step.delegatingAgentId !== this.id) {
            try {
                const delegatingAgent = this.agentSet.agents.get(step.delegatingAgentId);
                if (delegatingAgent) {
                    delegatingAgent.handleDelegatedStepCompletion(step.id, step.status, step.result);
                    console.log(`[Agent ${this.id}] Notified delegating agent ${step.delegatingAgentId} about completion of step ${step.id} (${step.status})`);
                } else {
                    console.warn(`[Agent ${this.id}] Delegating agent ${step.delegatingAgentId} not found for step ${step.id}`);
                }
            } catch (error) {
                console.error(`[Agent ${this.id}] Error notifying delegating agent about step completion:`, error);
            }
        }
    }

    public handleDelegatedStepCompletion(stepId: string, status: StepStatus, result?: PluginOutput[]): void {
        if (this.delegatedStepIds.has(stepId)) {
            this.delegatedStepIds.delete(stepId);
            console.log(`[Agent ${this.id}] Removed delegated step ${stepId} from tracking (status: ${status})`);
            if (status === StepStatus.COMPLETED && result) {
                console.log(`[Agent ${this.id}] Delegated step ${stepId} completed with results:`, 
                    result.map(r => `${r.name}=${r.resultDescription}`).join(', ')
                );
            }
        } else {
            console.warn(`[Agent ${this.id}] Received completion notification for unknown delegated step ${stepId}`);
        }
    }

    private async notifyDependents(failedStepId: string, status: StepStatus): Promise<void> {
        try {
            const dependentSteps = this.steps.filter(step =>
                step.dependencies.some(dep => dep.sourceStepId === failedStepId)
            );

            for (const step of dependentSteps) {
                step.status = status;
                await this.cleanupFailedStep(step);
            }

            const hasDependents = await this.hasDependentAgents();
            if (hasDependents) {
                try {
                    await this.sendMessage(MessageModule.MessageType.STEP_FAILURE, 'missioncontrol', {
                        failedStepId,
                        agentId: this.id,
                        status: this.status,
                        error: `Step ${failedStepId} failed with status ${status}`
                    }, false, 'developer');
                } catch (error) {
                    console.error('Failed to notify MissionControl about step failure:', error instanceof Error ? error.message : error);
                }
            }

            await this.saveAgentState();
        } catch (error) {
            console.error('Error in notifyDependents:', error instanceof Error ? error.message : error);
        }
    }

    private async cleanupFailedStep(step: Step): Promise<void> {
        if (step.status === StepStatus.ERROR || step.status === StepStatus.CANCELLED) return;
        try {
            console.log(`Starting cleanup for failed step ${step.id}`);
            step.clearTempData?.();
            await this.saveAgentState();
            await this.notifyDependents(step.id, StepStatus.ERROR);
            console.log(`Completed cleanup for failed step ${step.id}`);
        } catch (cleanupError) {
            console.error(`Error during step ${step.id} cleanup:`, cleanupError instanceof Error ? cleanupError.message : cleanupError);
        }
    }

    async loadAgentState(): Promise<void> {
        await this.stateManager.applyState(this);
    }

    public toAgentState(): any {
        return {
            id: this.id,
            status: this.status || AgentStatus.UNKNOWN,
            steps: Array.isArray(this.steps) ? this.steps.map(s => s.toJSON()) : [],
            missionId: this.missionId,
            userId: this.userId,
            agentClass: this.agentClass,
            instanceId: this.instanceId,
            dependencies: Array.isArray(this.dependencies) ? this.dependencies : [],
            conversation: Array.isArray(this.conversation) ? this.conversation : [],
            role: this.role || 'executor',
            lastFailedStep: this.lastFailedStep
        };
    }

    public setRole(roleId: string): void {
        this.role = roleId;
        this.logEvent({
            eventType: 'role_updated',
            agentId: this.id,
            role: roleId,
        });
    }

    async pause() {
        await this.lifecycleManager.pause();
    }

    async abort() {
        await this.lifecycleManager.abort();
    }

    async resume() {
        await this.lifecycleManager.resume();
    }

    getStatus(): string {
        return this.status;
    }

    isWaitingForUserInput(requestId?: string): boolean {
        if (requestId) return this.waitingSteps.has(requestId);
        return this.waitingSteps.size > 0;
    }

    async getStatistics(globalStepMap?: Map<string, { agentId: string, step: any }>, allStepsForMission?: Step[]): Promise<AgentStatistics> {
        const stepStats = this.steps.map((step) => {
            const stepJson = step.toJSON();
            return {
                ...stepJson,
                verb: stepJson.actionVerb,
                dependencies: step.dependencies.map(dep => dep.sourceStepId),
                isEndpoint: step.isEndpoint(allStepsForMission || this.steps)
            };
        });

        if (globalStepMap) {
            stepStats.forEach(s => {
                if (!globalStepMap.has(s.id)) {
                    globalStepMap.set(s.id, { agentId: this.id, step: s });
                }
            });
        }

        const lastStepActionVerb = this.steps.length > 0
            ? this.steps[this.steps.length - 1]?.actionVerb || 'Unknown'
            : 'Unknown';

        return {
            id: this.id,
            status: this.status,
            taskCount: this.steps.length,
            currentTaskNo: this.steps.filter(s => s.status === StepStatus.COMPLETED).length,
            currentTaskVerb: lastStepActionVerb,
            steps: stepStats,
            color: this.getAgentColor()
        };
    }

    public getAgentColor(): string {
        let hash = 0;
        if (typeof this.id === 'string') {
            for (let i = 0; i < this.id.length; i++) {
                hash = this.id.charCodeAt(i) + ((hash << 5) - hash);
            }
        }
        const hue = hash % 360;
        return `hsl(${hue}, 70%, 50%)`;
    }

    private async hasDependentAgents(): Promise<boolean> {
        try {
            const missionControlUrl = await this.getServiceUrl('MissionControl');
            if (!missionControlUrl) {
                console.warn(`[Agent ${this.id}] Cannot check dependent agents: missionControlUrl is undefined.`);
                return false;
            }
            if (!this.id) {
                console.warn(`[Agent 'unknown-id'] Cannot check dependent agents: agent ID is undefined.`);
                return false;
            }
            const response = await this.authenticatedApi.get(`${missionControlUrl}/dependentAgents/${this.id}`);
            return Array.isArray(response?.data) && response.data.length > 0;
        } catch (error) {
            if (error instanceof Error) {
                console.error(`[Agent ${this.id}] Error checking for dependent agents: ${error.message}`, error.stack);
                analyzeError(error);
            } else {
                console.error(`[Agent ${this.id}] Error checking for dependent agents with unknown error:`, error);
            }
            return false;
        }
    }

    setupCheckpointing(intervalMinutes: number = 15): void {
        this.lifecycleManager.setupCheckpointing(intervalMinutes);
    }
        
    public getSteps(): Step[] {
        return this.steps;
    }

    public async handleCollaborationMessage(message: any): Promise<void> {
        await this.collaborationManager.handleCollaborationMessage(message);
    }

    async saveAgentState(): Promise<void> {
        try {
            if (!this.stateManager) {
                console.error(`[Agent ${this.id}] StateManager not initialized. Cannot save agent state.`);
                return;
            }
            const stateToSave = {
                id: this.id,
                status: this.status || AgentStatus.UNKNOWN,
                steps: Array.isArray(this.steps) ? this.steps.map(s => s.toJSON()) : [],
                missionId: this.missionId,
                dependencies: Array.isArray(this.dependencies) ? this.dependencies : [],
                conversation: Array.isArray(this.conversation) ? this.conversation : [],
                role: this.role || 'executor',
                lastFailedStep: this.lastFailedStep
            };
            await this.stateManager.saveState(stateToSave);
        } catch (error) {
            if (error instanceof Error) {
                console.error(`[Agent ${this.id}] Error saving state: ${error.message}`, error.stack);
            } else {
                console.error(`[Agent ${this.id}] Error saving state with unknown error:`, error);
            }
        }
    }

    /**
     * Determine if a message is a simple conversational message that doesn't require 
     * complex planning. Simple messages include greetings, short questions, and basic 
     * statements that can be responded to directly.
     */
    private isSimpleConversationalMessage(message: string): boolean {
        if (!message || typeof message !== 'string') return false;
        
        const trimmedMessage = message.trim().toLowerCase();
        
        // Simple greetings and small talk
        const simplePatterns = [
            /^(hi|hello|hey|greetings|howdy|good\s*(morning|afternoon|evening))[\s!.,?]*$/i,
            /^(thanks|thank\s*you|thx)[\s!.,]*$/i,
            /^(bye|goodbye|see\s*you|later)[\s!.,]*$/i,
            /^(yes|no|ok|okay|sure|fine|alright)[\s!.,?]*$/i,
            /^(help|help\s*me)[\s!.,?]*$/i,
            /^what('s|\s+is)\s+(up|new|happening)[\s!.,?]*$/i,
            /^how\s+(are\s+you|is\s+it\s+going)[\s!.,?]*$/i,
        ];
        
        for (const pattern of simplePatterns) {
            if (pattern.test(trimmedMessage)) {
                return true;
            }
        }
        
        // Short messages (less than 50 characters) that are questions or statements
        // but not complex task requests
        if (trimmedMessage.length < 50) {
            // Exclude messages that look like task requests
            const taskPatterns = [
                /create|build|make|generate|write|develop|implement|design|analyze|research/i,
                /help\s+me\s+(to\s+)?(create|build|make|write|develop|implement)/i,
                /can\s+you\s+(create|build|make|write|develop|implement)/i,
                /i\s+(want|need)\s+(to\s+)?(create|build|make|write|develop|implement)/i,
            ];
            
            const isTaskRequest = taskPatterns.some(pattern => pattern.test(trimmedMessage));
            if (!isTaskRequest) {
                return true;
            }
        }
        
        return false;
    }

    /**
     * Handle a simple conversational message by responding directly via the Brain
     * without going through the complex planning system.
     */
    private async handleSimpleConversationalMessage(message: string): Promise<void> {
        try {
            // Use the Brain for a simple conversational response
            const inputs = new Map<string, InputValue>();
            inputs.set('prompt', {
                inputName: 'prompt',
                value: `The user said: "${message}". Respond conversationally in a friendly, helpful manner. Keep your response concise.`,
                valueType: PluginParameterType.STRING,
                args: {}
            });
            inputs.set('context', {
                inputName: 'context',
                value: this.missionContext || 'You are a helpful assistant.',
                valueType: PluginParameterType.STRING,
                args: {}
            });

            const response = await this.brainClient.useBrainForReasoning(inputs, 'GENERATE');
            
            if (response && response.length > 0 && response[0].success) {
                const responseText = response[0].result as string;
                // Send the response to the user
                this.say(responseText, true);
                this.addToConversation('assistant', responseText);
            } else {
                // Fallback greeting if Brain fails
                this.say("Hello! How can I help you today?", true);
                this.addToConversation('assistant', "Hello! How can I help you today?");
            }
        } catch (error) {
            console.error(`[Agent ${this.id}] Error handling simple conversational message:`, error);
            // Fallback response
            this.say("Hello! I'm here to help. What would you like to do?", true);
            this.addToConversation('assistant', "Hello! I'm here to help. What would you like to do?");
        }
    }

    private truncateLargeStrings(obj: any, maxLength: number = 500): any {
        if (obj === null || typeof obj !== 'object') return obj;
        if (Array.isArray(obj)) return obj.map(item => this.truncateLargeStrings(item, maxLength));
        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                if (typeof value === 'string' && value.length > maxLength) {
                    newObj[key] = `[Truncated string, length: ${value.length}]`;
                } else if (typeof value === 'object') {
                    newObj[key] = this.truncateLargeStrings(value, maxLength);
                } else {
                    newObj[key] = value;
                }
            }
        }
        return newObj;
    }
}
