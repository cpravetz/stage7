import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import axios from 'axios';
import { AgentStatus } from '../utils/agentStatus';
import { getServiceUrls } from '../utils/postOfficeInterface';
import { WorkProduct, Deliverable, MapSerializer, BaseEntity, LLMConversationType } from '@cktmcs/shared';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { PluginOutput, PluginParameterType, InputValue, ExecutionContext as PlanExecutionContext, MissionFile } from '@cktmcs/shared';
import { ActionVerbTask, InputReference } from '@cktmcs/shared';
import { AgentConfig, AgentStatistics, OutputType } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { Step, StepStatus, createFromPlan } from './Step';
import { StateManager } from '../utils/StateManager';
import { classifyStepError, StepErrorType } from '../utils/ErrorClassifier';
import { CollaborationMessage, CollaborationMessageType, ConflictResolution as ConflictResolutionData, ConflictResolutionResponse, TaskDelegationRequest, TaskResult, KnowledgeSharing, ConflictResolutionRequest } from '../collaboration/CollaborationProtocol';


import * as amqp from 'amqplib';
import * as amqp_connection_manager from 'amqp-connection-manager';

export class Agent extends BaseEntity {

    public lastActivityTime: number = Date.now();
    private cleanupHandlers: Array<() => Promise<void>> = [];

    private connection: amqp_connection_manager.AmqpConnectionManager | null = null;
    private channel: amqp_connection_manager.ChannelWrapper | null = null;

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
    private waitingSteps: Map<string, string> = new Map();
    private lastFailedStep: Step | null = null;
    private replannedSteps: Set<string> = new Set(); // Track replanned steps per agent
    private replanDepth: number = 0; // Track replanning depth
    private maxReplanDepth: number = 3; // Maximum replanning depth
    private _initializationPromise: Promise<boolean>;

    public get initialized(): Promise<boolean> {
        return this._initializationPromise;
    }

    // Properties for lifecycle management
    private checkpointInterval: NodeJS.Timeout | null = null;
    private currentQuestionResolve: ((value: string) => void) | null = null;
    private delegatedSteps: Map<string, string> = new Map(); // Map<taskId, stepId>

    constructor(config: AgentConfig) {
        super(config.id, 'AgentSet', `agentset`, process.env.PORT || '9000');
        this.agentPersistenceManager = new AgentPersistenceManager();
        this.stateManager = new StateManager(config.id, this.agentPersistenceManager);
        this.inputValues = config.inputValues instanceof Map ? config.inputValues : new Map(Object.entries(config.inputValues||{}));
        this.missionId = config.missionId;
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
            const initialStep = new Step({
                actionVerb: config.actionVerb,
                missionId: this.missionId,
                ownerAgentId: this.id,
                stepNo: 1,
                inputValues: this.inputValues,
                description: 'Initial mission step',
                status: StepStatus.PENDING,
                persistenceManager: this.agentPersistenceManager
            });
            this.steps.push(initialStep);
        }
        
        this.setAgentStatus(this.status, {eventType: 'agent_created', inputValues: MapSerializer.transformForSerialization(this.inputValues)});

        this.initRabbitMQ(); // Call init RabbitMQ

        this._initializationPromise = this.initializeAgent().then(() => {
            this.say(`Agent ${this.id} initialized and commencing operations.`);
            this.runUntilDone();
            return true; // Resolve with true on success
        }).catch((error) => {
            this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_initialization_failed', error: error instanceof Error ? error.message : String(error)});
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Agent ${this.id} failed during initialization or before starting execution loop. Error: ${errorMessage}`);
            this.say(`Agent ${this.id} failed to initialize or start. Error: ${errorMessage}`);
            return false; // Resolve with false on error
        });
    }

    private async initRabbitMQ(): Promise<void> {
        try {
            const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672';
            this.connection = amqp_connection_manager.connect([rabbitmqUrl]);

            this.connection.on('connect', () => console.log(`Agent ${this.id} connected to RabbitMQ!`));
            this.connection.on('disconnect', err => console.log(`Agent ${this.id} disconnected from RabbitMQ.`, err));

            this.channel = this.connection.createChannel({
                json: true,
                setup: async (channel: amqp.Channel) => {
                    await channel.assertExchange('agent.events', 'topic', { durable: true });
                    console.log(`Agent ${this.id} asserted 'agent.events' exchange.`);
                },
            });
        } catch (error) {
            console.error(`Error initializing RabbitMQ for Agent ${this.id}:`, error);
        }
    }

    async cleanup(): Promise<void> {
        this.lastActivityTime = Date.now();
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
        // Send initial status update to TrafficManager
        await this.updateStatus();

        while (this.hasActiveWork()) {
            await this.runAgent();
            // A short delay to prevent tight, CPU-intensive loops when the agent is truly idle but not yet completed.
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Once there is no more active work, set the final agent status
        if (this.status === AgentStatus.RUNNING) { // Only change status if it was still running
            this.setAgentStatus(AgentStatus.COMPLETED, {eventType: 'agent_completed'});
            const finalStep = this.steps.filter(s => s.status === StepStatus.COMPLETED).pop();
            if (finalStep) {
                this.output = await this.agentPersistenceManager.loadStepWorkProduct(this.id, finalStep.id);
            }
            console.log(`Agent ${this.id} has completed all active work.`);
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
            this.logEvent({
                eventType: 'agent_error',
                agentId: this.id,
                missionId: this.missionId,
                status: this.status,
                timestamp: new Date().toISOString()
            });
        });
    }

    private async updateStatus(): Promise<void> {
        const agentId = this.id;
        const agentStatus = this.status || AgentStatus.UNKNOWN;
        const missionId = this.missionId || 'unknown-mission-id';
        const timestamp = new Date().toISOString();
    
        const results = await Promise.allSettled([
            // 1. Logic for publishAgentStatus (RabbitMQ)
            (async () => {
                if (!this.channel) {
                    console.warn(`Agent ${this.id} RabbitMQ channel not available, cannot publish status.`);
                    return;
                }
                const rabbitMessage = { agentId, status: agentStatus, missionId, timestamp };
                const routingKey = 'agent.status.update';
                const exchange = 'agent.events';
                console.log(`Agent ${agentId} publishing status update to ${exchange} with routing key ${routingKey}: ${agentStatus}`);
                this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(rabbitMessage)));
            })(),

            // 2. Logic for notifyTrafficManager
            (async () => {
                console.log(`Agent ${agentId} notifying TrafficManager of status: ${agentStatus}`);
                const stats = await this.getStatistics();
                const trafficManagerMessage = { agentId, status: agentStatus, statistics: stats, missionId, timestamp };
                await this.sendMessage(MessageType.AGENT_UPDATE, 'trafficmanager', trafficManagerMessage);
            })()
        ]);
    
        // Log any errors from the settled promises
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                const channel = index === 0 ? 'RabbitMQ' : 'TrafficManager';
                const agentIdForError = this.id || 'unknown-id';
                if (result.reason instanceof Error) {
                    console.error(`[Agent ${agentIdForError}] Failed to send status update to ${channel}: ${result.reason.message}`, result.reason.stack);
                    analyzeError(result.reason); // If analyzeError is available and appropriate
                } else {
                    console.error(`[Agent ${agentIdForError}] Failed to send status update to ${channel} with unknown error:`, result.reason);
                }
            }
        });
    }

    private async setAgentStatus(status = AgentStatus.UNKNOWN, logData = {}) {
        this.status = status;
        logData = {...logData, agentId: this.id, missionId: this.missionId, status: this.status, timestamp: new Date().toISOString()};
        this.logEvent(logData);
        await this.updateStatus();
    }

    private async initializeAgent() {
        try {
            const { capabilitiesManagerUrl, brainUrl, trafficManagerUrl, librarianUrl } = await getServiceUrls(this);
            this.capabilitiesManagerUrl = capabilitiesManagerUrl;
            this.brainUrl = brainUrl;
            this.trafficManagerUrl = trafficManagerUrl;
            this.librarianUrl = librarianUrl;

            this.setAgentStatus(AgentStatus.RUNNING,{eventType: 'agent_initialized'});

            if (this.missionContext && this.steps[0]?.actionVerb === 'ACCOMPLISH') {
                await this.prepareOpeningInstruction();
            }
            return true;
        } catch (error) { analyzeError(error as Error);
            console.error('Error initializing agent:', error instanceof Error ? error.message : error);
            this.setAgentStatus(AgentStatus.ERROR,{eventType: 'agent_initialization_failed'});
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

    private hasActiveWork(): boolean {
        return this.steps.some(step =>
            step.status === StepStatus.PENDING ||
            step.status === StepStatus.RUNNING ||
            step.status === StepStatus.SUB_PLAN_RUNNING
        );
    }

    private async executeStep(step: Step): Promise<void> {
        try {
            if (this.status !== AgentStatus.RUNNING) return;

            // Consolidate all input preparation into one method call.
            step.inputValues = await step.dereferenceInputsForExecution(this.steps, this.missionId);

            if (step.recommendedRole && step.recommendedRole !== this.role && this.role !== 'coordinator') {
                const delegationResult = await this.delegateStepToSpecializedAgent(step);
                if (delegationResult.success) {
                    step.status = StepStatus.SUB_PLAN_RUNNING; // Mark as waiting for delegation result
                    return;
                }
            }

            this.say(`Executing step: ${step.actionVerb} - ${step.description || 'No description'}`);

            const result = await step.execute(
                this.executeActionWithCapabilitiesManager.bind(this),
                this.useBrainForReasoning.bind(this),
                this.createSubAgent.bind(this),
                this.handleAskStep.bind(this),
                this.steps
            );

            if (result && result.length > 0 && !result[0].success && result[0].resultType === PluginParameterType.ERROR) {
                const error = new Error(result[0].error || result[0].result || 'Step execution failed');
                await this.handleStepFailure(step, error);
                return;
            } else if (result && result.length > 0 && result[0].name === 'internalVerbExecution') {
                const internalVerbData = result[0].result;
                const internalActionVerb = internalVerbData.actionVerb;
                const internalInputValues = MapSerializer.transformFromSerialization(internalVerbData.inputValues);
                const internalOutputs = MapSerializer.transformFromSerialization(internalVerbData.outputs);

                console.log(`Agent ${this.id}: Handling internal verb: ${internalActionVerb}`);
                // Delegate to the Step to handle the internal verb
                await step.handleInternalVerb(
                    internalActionVerb,
                    internalInputValues,
                    internalOutputs,
                    this.executeActionWithCapabilitiesManager.bind(this),
                    this.useBrainForReasoning.bind(this),
                    this.createSubAgent.bind(this),
                    this.handleAskStep.bind(this),
                    this.steps
                );
                // After handling, the step's status should be updated by handleInternalVerb
                return;
            }

            console.log(`[Agent ${this.id}] executeStep: Checking result for pending_user_input. Result: ${JSON.stringify(result)}`);

            if (result && result.length > 0 && result[0].name === 'pending_user_input') {
                console.log(`[Agent ${this.id}] executeStep: Detected pending_user_input. RequestId: ${(result[0] as any).request_id}`);
                const requestId = (result[0] as any).request_id;
                if (requestId) {
                    // Check if the step has unresolved placeholders that we can now resolve
                    if (await this.stepHasUnresolvedPlaceholders(step)) {
                        console.log(`[Agent ${this.id}] Step ${step.id} has unresolved placeholders, retrying with resolved values`);
                        // Cancel the pending user input and retry the step
                        await this.retryStepWithResolvedPlaceholders(step);
                        return;
                    }

                    step.status = StepStatus.WAITING;
                    this.waitingSteps.set(requestId, step.id);
                    console.log(`[Agent ${this.id}] Step ${step.id} is now WAITING for user input with requestId: ${requestId}.`);
                    // No longer changing agent status, allowing the runAgent loop to continue for other steps.
                    return;
                }
            } else {
                console.log(`[Agent ${this.id}] executeStep: Result is NOT pending_user_input. Actual result: ${JSON.stringify(result)}`);
            }

            this.say(`Completed step: ${step.actionVerb}`);

            if (step.actionVerb === 'REFLECT') { // Changed from CHECK_PROGRESS to REFLECT
                const planOutput = result.find(r => r.name === 'plan'); // REFLECT outputs 'plan'
                const answerOutput = result.find(r => r.name === 'answer'); // REFLECT outputs 'answer'
                const directAnswerOutput = result.find(r => r.name === 'direct_answer'); // NEW: Check for direct_answer

                if (planOutput && planOutput.result) {
                    const newPlan = planOutput.result as ActionVerbTask[];
                    this.say('Reflection resulted in a new plan. Updating plan.');

                    const currentStepIndex = this.steps.findIndex(s => s.id === step.id);
                    if (currentStepIndex !== -1) {
                        // Cancel all steps that come after the current REFLECT step
                        for (let i = currentStepIndex + 1; i < this.steps.length; i++) {
                            this.steps[i].status = StepStatus.CANCELLED;
                        }
                    }

                    console.log(`[Agent ${this.id}] 406 runAgent: REFLECT step ${step.id} generated plan:`, JSON.stringify(newPlan));
                    this.addStepsFromPlan(newPlan, step);
                    await this.updateStatus();
                } else if (directAnswerOutput && directAnswerOutput.result) { // NEW: Handle direct_answer
                    const directAnswer = directAnswerOutput.result;
                    this.say(`Reflection provided a direct answer. Creating new ACCOMPLISH step to pursue this direction.`);
                    this.addToConversation('system', `Reflection Direct Answer: ${directAnswer}`); // Add to conversation history

                    // Cancel all steps that come after the current REFLECT step
                    const currentStepIndex = this.steps.findIndex(s => s.id === step.id);
                    if (currentStepIndex !== -1) {
                        for (let i = currentStepIndex + 1; i < this.steps.length; i++) {
                            this.steps[i].status = StepStatus.CANCELLED;
                        }
                    }

                    // Create new ACCOMPLISH step with the direct answer as goal
                    const newAccomplishStep = new Step({
                        actionVerb: 'ACCOMPLISH',
                        missionId: this.missionId,
                        ownerAgentId: this.id,
                        stepNo: this.steps.length + 1,
                        inputValues: new Map([
                            ['goal', { inputName: 'goal', value: directAnswer, valueType: PluginParameterType.STRING }]
                        ]),
                        description: `Pursue direct answer from reflection: ${directAnswer.substring(0, 100)}${directAnswer.length > 100 ? '...' : ''}`,
                        status: StepStatus.PENDING,
                        persistenceManager: this.agentPersistenceManager
                    });

                    this.steps.push(newAccomplishStep);
                    await this.updateStatus();
                } else if (answerOutput && answerOutput.result) {
                    this.say(`Reflection result: ${answerOutput.result}`);
                    try {
                        const parsedResult = typeof answerOutput.result === 'string' ? JSON.parse(answerOutput.result) : answerOutput.result;
                        if (Array.isArray(parsedResult)) { // Check if it's an array (a plan)
                            this.say('Reflection resulted in a new plan. Updating plan.');
                            const currentStepIndex = this.steps.findIndex(s => s.id === step.id);
                            if (currentStepIndex !== -1) {
                                // Cancel all steps that come after the current REFLECT step
                                for (let i = currentStepIndex + 1; i < this.steps.length; i++) {
                                    this.steps[i].status = StepStatus.CANCELLED;
                                }
                            }
                            console.log(`[Agent ${this.id}] 428 runAgent: REFLECT step ${step.id} generated plan:`, JSON.stringify(parsedResult));
                            this.addStepsFromPlan(parsedResult as ActionVerbTask[], step);
                            await this.updateStatus();
                            return;
                        }
                    } catch (e) {
                        // Not a JSON plan, so just log it and continue
                        console.warn(`[Agent ${this.id}] Failed to parse 'answer' as JSON plan, treating as string. Error:`, e instanceof Error ? e.message : e);
                    }

                    this.say('Progress is on track. Continuing with the current plan.'); // Assuming 'answer' means continue
                } else {
                    this.say('Reflection did not provide a clear plan or answer. Continuing with the current plan.');
                }
            } else if (result[0]?.resultType === PluginParameterType.PLAN) {
                // Apply custom output name mapping for PLAN results
                const mappedResult = await step.mapPluginOutputsToCustomNames(result);
                const planningStepResult = mappedResult[0]?.result;
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
                    this.addStepsFromPlan(actualPlanArray, step);
                    await this.updateStatus();
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

    private async runAgent() {
        try {
            //console.log(`[Agent ${this.id}] runAgent: Agent status: ${this.status}`);
            if (this.status !== AgentStatus.RUNNING) {
                return;
            }

            const pendingSteps = this.steps.filter(step => step.status === StepStatus.PENDING);
            //console.log(`[Agent ${this.id}] runAgent: Pending steps: ${pendingSteps.map(s => `${s.id} (${s.actionVerb}, ${s.status})`).join(', ') || 'None'}`);

            const executableSteps = pendingSteps.filter(step => step.areDependenciesSatisfied(this.steps));

            if (executableSteps.length > 0) {
                const stepsToDelegate = new Map<string, Step[]>();
                const stepsToExecuteLocally: Step[] = [];

                // Group steps by role for batch delegation
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

                // Create and execute delegation promises
                for (const [role, steps] of stepsToDelegate.entries()) {
                    const delegationPromise = (async () => {
                        console.log(`[Agent ${this.id}] Found ${steps.length} steps to delegate to role: ${role}`);
                        const recipientId = await this._getOrCreateSpecializedAgent(role);
                        if (recipientId) {
                            for (const step of steps) {
                                // Pass recipientId to avoid re-finding the agent for each step in the batch
                                await this.delegateStepToSpecializedAgent(step, recipientId);
                            }
                        } else {
                            console.error(`[Agent ${this.id}] Could not find or create agent for role ${role}. Moving ${steps.length} steps to local execution.`);
                            stepsToExecuteLocally.push(...steps);
                        }
                    })();
                    allPromises.push(delegationPromise);
                }

                // Create local execution promises
                if (stepsToExecuteLocally.length > 0) {
                    console.log(`[Agent ${this.id}] Executing ${stepsToExecuteLocally.length} steps locally.`);
                    const localExecutionPromises = stepsToExecuteLocally.map(step => this.executeStep(step));
                    allPromises.push(...localExecutionPromises);
                }
                
                await Promise.all(allPromises);

            } else if (pendingSteps.length > 0) {
                // Deadlock detection
                for (const step of pendingSteps) {
                    if (step.areDependenciesPermanentlyUnsatisfied(this.steps)) {
                        step.status = StepStatus.CANCELLED;
                        this.logEvent({
                            eventType: 'step_cancelled_dependency_unsatisfied',
                            agentId: this.id,
                            stepId: step.id,
                            dependencies: step.dependencies,
                            timestamp: new Date().toISOString()
                        });
                        console.log(`[Agent ${this.id}] Cancelling step ${step.id} due to permanently unsatisfied dependencies.`);
                    }
                }
            } else if (!this.hasActiveWork()) {
                this.setAgentStatus(AgentStatus.COMPLETED, {eventType: 'agent_completed'});
                const finalStep = this.steps.filter(s => s.status === StepStatus.COMPLETED).pop();
                if (finalStep) {
                    this.output = await this.agentPersistenceManager.loadStepWorkProduct(this.id, finalStep.id);
                }
                console.log(`Agent ${this.id} has completed its work.`);
                this.say(`Result: ${JSON.stringify(this.output)}`);
            }
        } catch (error) {
            console.error('Error in agent main loop:', error instanceof Error ? error.message : error);
            this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_error', error: error instanceof Error ? error.message : String(error)});
            this.say(`Error in agent execution: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    private addStepsFromPlan(plan: ActionVerbTask[], parentStep: Step) {
        console.log(`[Agent ${this.id}] Parsed plan for addStepsFromPlan:`, JSON.stringify(plan));
        const newSteps = createFromPlan(plan, this.steps.length + 1, this.agentPersistenceManager, parentStep, this);
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
        switch (message.type) {
            case MessageType.USER_MESSAGE:
                this.addToConversation('user', message.content.message);
                break;
            case 'USER_INPUT_RESPONSE': { // Assuming this is the message type from PostOffice
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
                            result: finalAnswer, // answer can be null
                            resultDescription: 'User response'
                        }];
                        step.status = StepStatus.COMPLETED;
                        this.waitingSteps.delete(requestId);
                        console.log(`[Agent ${this.id}] Processed user input for requestId: ${requestId}. Step ${step.id} is now COMPLETED.`);
                        // The runAgent loop will now pick up this completed step and process its dependents.
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

        // Handle CHAT verb by checking for 'message' input
        if (inputs.has('message')) {
            const messageInput = inputs.get('message');
            const message = messageInput?.value;
            console.log(`[Agent ${this.id}] Sending CHAT message to user: ${message} from input: ${JSON.stringify(messageInput)}`);

            if (typeof message === 'string' && message) {
                this.say(message);
                return [{
                    success: true,
                    name: 'success',
                    resultType: PluginParameterType.BOOLEAN,
                    resultDescription: 'Message sent to user.',
                    result: true
                }];
            } else {
                this.logAndSay('Error in CHAT: message is empty or not a string.');
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Error in CHAT: message is empty or not a string.',
                    result: null,
                    error: 'CHAT requires a non-empty string "message" input.'
                }];
            }
        }

        // Handle ASK verb (existing logic)
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
        let question = input.value || input.args?.question;
        inputs.forEach((value, key) => {
            if (key !== 'question') {
                const regex = new RegExp(`{${key}}`, 'g');
                question = question.replace(regex, value.value);
            }
        });
        const choices = input.args?.choices;
        const answerType = input.args?.answerType || 'text';
        const timeout = input.args?.timeout || 600000; // Default timeout of 10 minutes if not specified

        try {
            const response = await Promise.race([
                this.askUser(question, choices, answerType),
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
    private async askUser(question: string, choices?: string[], answerType: string = 'text'): Promise<string> {
        return new Promise((resolve) => {
            this.currentQuestionResolve = resolve;
            this.ask(question, answerType, choices);
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
        if (this.status in [AgentStatus.PAUSED, AgentStatus.ABORTED]) {
            console.log(`Agent ${this.id} is in status ${this.status}, skipping saveWorkProduct for step ${stepId}.`);
            return;
        }
        const serializedData = MapSerializer.transformForSerialization(data);
        const workProduct = {
            id: uuidv4(),
            agentId: this.id,
            stepId: stepId,
            data: serializedData,
            timestamp: new Date().toISOString()
        } as WorkProduct;
        try {
            const step = this.steps.find(s => s.id === stepId);
            if (!step) {
                console.error(`Step with id ${stepId} not found in agent ${this.id}`);
                return;
            }

            const hasDeliverables = step && step.hasDeliverableOutputs();
            await this.agentPersistenceManager.saveWorkProduct(workProduct);
            if(hasDeliverables){
                await this.agentPersistenceManager.saveDeliverable({...workProduct, isDeliverable: true} as Deliverable);
            }

            const outputType = step.getOutputType(this.steps);
            const type = outputType === OutputType.FINAL ? 'Final' : outputType === OutputType.PLAN ? 'Plan' : 'Interim';
            console.log(`Agent ${this.id}: Step ${stepId} outputType=${outputType}, type=${type}, step.result=${JSON.stringify(step.result?.map(r => ({name: r.name, resultType: r.resultType})))}`);
            console.log(`Agent ${this.id}: PluginParameterType.PLAN=${PluginParameterType.PLAN}, OutputType.PLAN=${OutputType.PLAN}`);

            let scope: string;
            if (this.steps.length === 1 || (isAgentEndpoint && outputType === OutputType.FINAL)) {
                scope = 'MissionOutput';
            } else if (isAgentEndpoint) {
                scope = 'AgentOutput';
            } else {
                scope = 'AgentStep';
            }

            // Upload outputs to shared file space based on deliverable flags or fallback to existing logic
            let uploadedFiles: MissionFile[] = [];
            const outputsHaveFiles = Array.isArray(data) && data.some(o => !!(o as any).fileName || !!(o as any).storagePath);

            let shouldUploadToSharedSpace = false;

            if (hasDeliverables || (outputType === OutputType.FINAL && data && data.length > 0)) {
                // New logic: only upload outputs marked as deliverables
                shouldUploadToSharedSpace = true;
                console.log(`[Agent.ts] Step ${stepId} has deliverable outputs, will upload deliverables only`);
            }

            if (step && step.actionVerb === 'FILE_OPERATION') {
                shouldUploadToSharedSpace = false; // Explicitly disable for FILE_OPERATION
            }

            if (shouldUploadToSharedSpace) {
                try {
                    const librarianUrl = await this.getServiceUrl('Librarian');
                    if (librarianUrl) {
                        uploadedFiles = await this._uploadOutputs(step, data, librarianUrl);
                        if (uploadedFiles.length > 0) {
                            console.log(`Uploaded ${uploadedFiles.length} files to Librarian for step ${stepId}`);
                        }
                    }
                } catch (error) {
                    console.error('Error uploading step outputs to Librarian:', error);
                }
            }

            // If FILE_OPERATION was executed, and it returned a file, use its result as the attached file
            const missionFileResult = data[0].result as MissionFile;
            if (missionFileResult && missionFileResult.id && missionFileResult.originalName) {
                uploadedFiles.push(missionFileResult);
            }
            const workProductPayload: any = {
                id: stepId,
                type: type,
                scope: scope,
                name: data[0] ? data[0].resultDescription : 'Step Output',
                agentId: this.id,
                stepId: stepId,
                missionId: this.missionId,
                mimeType: data[0]?.mimeType || 'text/plain',
                fileName: data[0]?.fileName,
                isDeliverable: hasDeliverables, // Include deliverable metadata
                workproduct: (type === 'Plan' && data[0]?.result) ?
                    `Plan with ${Array.isArray(data[0].result) ? data[0].result.length : Object.keys(data[0].result).length} steps` : data[0]?.result
            };
            // If we uploaded files above, attach their metadata so the UI can list them
            if (typeof uploadedFiles !== 'undefined' && Array.isArray(uploadedFiles) && uploadedFiles.length > 0) {
                workProductPayload.attachedFiles = uploadedFiles;
            }
            console.log('[Agent.ts] WORK_PRODUCT_UPDATE payload:', JSON.stringify(workProductPayload, null, 2));

            this.sendMessage(MessageType.WORK_PRODUCT_UPDATE, 'user', workProductPayload);
        } catch (error) { analyzeError(error as Error);
            console.error('Error saving work product:', error instanceof Error ? error.message : error);
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

    private async useBrainForReasoning(inputs: Map<string, InputValue>, actionVerb: string): Promise<PluginOutput[]> {
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

        let brainEndpoint: string;
        let brainRequestBody: any;
        let outputName: string;
        let outputDescription: string;

        if (actionVerb === 'GENERATE') {
            brainEndpoint = 'generate';
            outputName = 'generated_content';
            outputDescription = 'Content generated by LLM service.';

            const conversationType = inputs.get('conversationType')?.value as LLMConversationType || LLMConversationType.TextToText;
            const modelName = inputs.get('modelName')?.value;
            const optimization = inputs.get('optimization')?.value;
            const prompt = inputs.get('prompt')?.value;
            const file = inputs.get('file')?.value;
            const audio = inputs.get('audio')?.value;
            const video = inputs.get('video')?.value;
            const image = inputs.get('image')?.value;

            brainRequestBody = {
                type: conversationType,
                prompt: prompt,
                modelName: modelName,
                optimization: optimization,
                file: file,
                audio: audio,
                video: video,
                image: image,
                trace_id: this.id // Assuming agent ID can be used as trace_id
            };
        } else { // Default to THINK logic
            brainEndpoint = 'chat';
            outputName = 'answer';
            outputDescription = `Brain reasoning output (${inputs.get('conversationType')?.value || LLMConversationType.TextToText})`; // Use conversationType from inputs

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
            const conversationType = (inputs.get('conversationType')?.value as LLMConversationType) || LLMConversationType.TextToText;

            const validOptimizations = ['cost', 'accuracy', 'creativity', 'speed', 'continuity'];
            const validConversationTypes = [
                LLMConversationType.TextToText, 
                LLMConversationType.TextToImage, 
                LLMConversationType.TextToAudio, 
                LLMConversationType.TextToVideo, 
                LLMConversationType.TextToCode];

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

            if (!validConversationTypes.includes(conversationType)) {
                return [{
                    success: false,
                    name: 'error',
                    resultType: PluginParameterType.ERROR,
                    resultDescription: 'Error in useBrainForReasoning',
                    result: null,
                    error: `Invalid ConversationType: ${conversationType}. Must be one of ${validConversationTypes.join(', ')}`
                }];
            }

            brainRequestBody = {
                exchanges: [...this.conversation, { role: 'user', content: prompt }], // Combine history with current prompt
                optimization: optimization,
                conversationType: conversationType,
                responseType: 'text'
            };
        }

        console.log(`[Agent ${this.id} ${actionVerb}] useBrainForReasoning: Sending request to Brain /${brainEndpoint}`);

        try {
            const response = await this.authenticatedApi.post(`http://${this.brainUrl}/${brainEndpoint}`, brainRequestBody);
            const confidence = response.data.confidence || 1.0;
            const confidenceThreshold = (inputs.get('confidenceThreshold')?.value as number) || 0.75;

            // High-confidence path: Return the result directly
            if (confidence >= confidenceThreshold) {
                const brainResponse = response.data.response;
                const mimeType = response.data.mimeType || 'text/plain';

                let resultType: PluginParameterType;
                let parsedResult: any = brainResponse;

                // If the request explicitly asked for a PLAN-like JSON response, try to parse
                if (actionVerb === 'THINK' && (inputs.get('conversationType')?.value as LLMConversationType) === LLMConversationType.TextToCode && mimeType === 'application/json') {
                    try {
                        parsedResult = typeof brainResponse === 'string' ? JSON.parse(brainResponse) : brainResponse;
                        resultType = PluginParameterType.PLAN;
                        console.log(`[Agent ${this.id}] Parsed brainResponse as JSON for plan.`);
                    } catch (e) {
                        console.warn(`[Agent ${this.id}] Failed to parse brainResponse as JSON, treating as string. Error:`, e instanceof Error ? e.message : e);
                        resultType = PluginParameterType.STRING;
                    }
                } else {
                    resultType = PluginParameterType.STRING;
                }

                // Defensive extraction: ensure string results for STRING resultType
                if (resultType === PluginParameterType.STRING) {
                    try {
                        if (parsedResult === undefined || parsedResult === null) {
                            // Try to find text in other common fields on the response object
                            const candidate = response.data?.result || response.data?.text || response.data?.output || response.data?.generated || response.data?.response || response.data?.choices;
                            if (candidate !== undefined && candidate !== null) {
                                parsedResult = typeof candidate === 'string' ? candidate : (Array.isArray(candidate) ? JSON.stringify(candidate) : JSON.stringify(candidate));
                            } else {
                                parsedResult = '';
                            }
                        } else if (typeof parsedResult === 'object') {
                            // Try common fields inside the object
                            const fallback = parsedResult.result || parsedResult.text || (parsedResult.choices && parsedResult.choices[0] && (parsedResult.choices[0].text || parsedResult.choices[0].message)) || parsedResult.generated || parsedResult.output;
                            if (fallback !== undefined && fallback !== null) {
                                parsedResult = typeof fallback === 'string' ? fallback : JSON.stringify(fallback);
                            } else {
                                parsedResult = JSON.stringify(parsedResult);
                            }
                        } else {
                            parsedResult = String(parsedResult);
                        }
                    } catch (e) {
                        console.warn(`[Agent ${this.id}] Error coercing brainResponse to string result:`, e instanceof Error ? e.message : e);
                        parsedResult = '';
                    }
                }

                if (!parsedResult || (typeof parsedResult === 'string' && parsedResult.trim() === '')) {
                    console.warn(`[Agent ${this.id}] WARNING: Brain returned an empty or missing result for actionVerb=${actionVerb}. Response payload:`, JSON.stringify(response.data || {}, null, 2));
                }

                return [{
                    success: true,
                    name: outputName,
                    resultType: resultType,
                    result: parsedResult,
                    resultDescription: outputDescription,
                    mimeType: mimeType
                }];
            }

            // Low-confidence path: Create a verification and continuation plan
            this.say(`The information I received has a low confidence score of ${confidence.toFixed(2)}. I will create a plan to verify it and then proceed.`);

            const brainResponse = response.data.response;

            const verificationTask: ActionVerbTask = {
                actionVerb: 'VERIFY_FACT',
                description: `Verify the following information which was returned with low confidence: "${brainResponse}"`, 
                inputReferences: new Map<string, InputReference>([
                    ['fact', { inputName: 'fact', value: brainResponse, valueType: PluginParameterType.STRING }]
                ]),
                outputs: new Map<string, PluginParameterType>([
                    ['verified_fact', PluginParameterType.STRING],
                    ['is_correct', PluginParameterType.BOOLEAN]
                ]),
                recommendedRole: 'critic'
            };

            const continuationTask: ActionVerbTask = {
                actionVerb: 'THINK',
                description: `Re-evaluating the original prompt with a verified fact.`, 
                inputReferences: inputs || new Map<string, InputReference>(),
                outputs:  new Map<string, PluginParameterType>([
                    ['final_answer', PluginParameterType.STRING]
                ])
            };
            continuationTask?.inputReferences?.set('verified_context', {
                inputName: 'verified_context',
                outputName: 'verified_context',
                valueType: PluginParameterType.STRING
            });

            return [{
                success: true,
                name: 'recovery_plan',
                resultType: PluginParameterType.PLAN,
                result: [verificationTask, continuationTask],
                resultDescription: `Generated a 2-step recovery plan due to low confidence score.`, 
            }];
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

    /**
     * Check if a step has unresolved placeholders that can now be resolved
     */
    private async stepHasUnresolvedPlaceholders(step: Step): Promise<boolean> {
        try {
            // We create a temporary map to not modify the step's actual inputValues
            const inputsForExecution = await step.dereferenceInputsForExecution(this.steps, this.missionId);
    
            // Check if any placeholders remain unresolved
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
            return false; // Assume no placeholders on error to avoid loops
        }
    }

    /**
     * Retry a step with resolved placeholders
     */
    private async retryStepWithResolvedPlaceholders(step: Step): Promise<void> {
        console.log(`[Agent ${this.id}] Retrying step ${step.id} (${step.actionVerb}) with resolved placeholders`);

        // Reset the step status
        step.status = StepStatus.PENDING;
        step.result = undefined;

        // Clear any waiting state
        for (const [requestId, stepId] of this.waitingSteps.entries()) {
            if (stepId === step.id) {
                this.waitingSteps.delete(requestId);
                break;
            }
        }

        // Resume agent execution which will pick up the pending step
        this.setAgentStatus(AgentStatus.RUNNING, {eventType: 'agent_resumed_from_waiting'});
        await this.runAgent();
    }

    /**
     * Check if agent is stuck waiting for user input with unresolved placeholders and fix it
     */
    public async checkAndFixStuckUserInput(): Promise<boolean> {
        // Find the step that's waiting for user input
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
                if (step.actionVerb === 'ASK') {
                    return this.handleAskStep(step.inputValues);
                }

                const payload = {
                    actionVerb: step.actionVerb,
                    description: step.description,
                    missionId: step.missionId,
                    outputs: step.outputs,
                    inputValues: MapSerializer.transformForSerialization(step.inputValues),
                    recommendedRole: step.recommendedRole,
                    status: step.status,
                    stepNo: step.stepNo,
                    id: step.id
                };
                step.storeTempData('payload', payload);

                const timeout = step.actionVerb === 'ACCOMPLISH' ? 3600000 : 1800000;

                const response = await this.authenticatedApi.post(
                    `http://${this.capabilitiesManagerUrl}/executeAction`,
                    payload,
                    { timeout }
                );



                return response.data;
            } catch (error) {
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

                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }
        }

        // This part should not be reachable, but as a fallback:
        return [{
            success: false,
            name: 'error',
            resultType: PluginParameterType.ERROR,
            resultDescription: 'Error in executeActionWithCapabilitiesManager after all retries',
            result: null,
            error: 'Failed to execute action after multiple retries.'
        }];
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
        if (step.status === StepStatus.ERROR || step.status === StepStatus.CANCELLED) {
            return; // Already cleaned up or in a terminal error state
        }
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
        this.setAgentStatus(AgentStatus.PAUSED,{eventType: 'agent_paused'});
        await this.saveAgentState();
    }

    async abort() {
        this.setAgentStatus(AgentStatus.ABORTED, {eventType: 'agent_aborted'});
        await this.saveAgentState();
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
        if (this.status in [AgentStatus.PAUSED, AgentStatus.INITIALIZING]) {
            this.setAgentStatus(AgentStatus.RUNNING,{eventType: 'agent_resumed'});
            this.setupCheckpointing(15); // Re-setup checkpointing interval, assuming 15 minutes
            console.log(`Agent ${this.id} re-setup checkpoint interval due to resume.`);
            this.runAgent();
        }
    }

    getStatus(): string {
        return this.status;
    }

    isWaitingForUserInput(requestId?: string): boolean {
        if (requestId) {
            return this.waitingSteps.has(requestId);
        }
        return this.waitingSteps.size > 0;
    }

    async getStatistics(globalStepMap?: Map<string, { agentId: string, step: any }>, allStepsForMission?: Step[]): Promise<AgentStatistics> {

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
            const outputType = step?.getOutputType(allStepsForMission || this.steps);

            return {
                id: stepId,
                verb: stepActionVerb, // Mapped to 'verb' for AgentStatistics interface
                status: stepStatus,
                dependencies: dependencies,
                stepNo: stepNo,
                outputType: outputType
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
            const agentIdForError = this.id;
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
                    const agentIdForError = this.id;
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
        const agentIdForLog = this.id;
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
                role: this.role || 'executor',
                lastFailedStep: this.lastFailedStep
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
        const agentIdForLog = this.id;
        try {
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
        console.log(`Agent ${this.id} received collaboration message of type ${message.type}:`, message.payload);

        switch (message.type) {
          case CollaborationMessageType.TASK_DELEGATION:
            const task = message.payload as TaskDelegationRequest;
            console.log(`Agent ${this.id} received delegated task:`, JSON.stringify(task, null, 2));
            if (!task.taskType) {
                console.log('Agent Line 1364 - Missing required property "taskType" in task');
                throw new Error(`Missing required property 'taskType' in task`);
            }

            const deserializedInputs = MapSerializer.transformFromSerialization(task.inputs) as Map<string, InputValue>;
            const inputReferences = new Map<string, InputReference>();
            if (deserializedInputs) {
                for (const [key, inputValue] of deserializedInputs.entries()) {
                    inputReferences.set(key, {
                        inputName: key,
                        value: inputValue.value,
                        valueType: inputValue.valueType,
                        args: inputValue.args
                    });
                }
            }

            const outputsAsObject = (task as any).outputs;
            const deserializedOutputs = new Map<string, string>();
            if (outputsAsObject && outputsAsObject.entries) {
                for (const [key, value] of outputsAsObject.entries) {
                    deserializedOutputs.set(key, value);
                }
            }
            const taskDependencies = (task as any).dependencies;
            let dependencies: any[] = [];
            if (Array.isArray(taskDependencies)) {
                dependencies = taskDependencies.map(dep => ({
                    outputName: dep.outputName,
                    sourceStepId: dep.sourceStepId,
                    inputName: dep.inputName
                }));
            }

            const newStep = new Step({
              actionVerb: task.taskType,
              missionId: this.missionId,
              ownerAgentId: this.id,
              stepNo: this.steps.length + 1,
              inputReferences: inputReferences,
              description: task.description,
              dependencies: dependencies,
              outputs: deserializedOutputs,
              recommendedRole: this.role,
              status: StepStatus.PENDING,
              persistenceManager: this.agentPersistenceManager
            });
            this.steps.push(newStep);
            // The agent will pick up and run this new step in its main loop.
            await this.updateStatus();
            break;

          case CollaborationMessageType.TASK_RESULT:
            const taskResult = message.payload as TaskResult;
            const completedStepId = this.delegatedSteps.get(taskResult.taskId);
            if (completedStepId) {
              const step = this.steps.find(s => s.id === completedStepId);
              if (step) {
                console.log(`Received result for delegated step ${step.id}. Success: ${taskResult.success}`);
                step.status = taskResult.success ? StepStatus.COMPLETED : StepStatus.ERROR;
                if (taskResult.success) {
                  step.result = taskResult.result;
                  console.log(`Updated step ${step.id} with result:`, JSON.stringify(step.result, null, 2));
                  await this.saveWorkProductWithClassification(step.id, taskResult.result, step.isEndpoint(this.steps), this.getAllAgentsInMission());
                } else {
                  this.say(`Delegated step ${step.actionVerb} failed. Reason: ${taskResult.error}`);
                }
                this.delegatedSteps.delete(taskResult.taskId);
                await this.updateStatus();
              }
            }
            break;

          case CollaborationMessageType.KNOWLEDGE_SHARE:
            const knowledge = message.payload as KnowledgeSharing;
            console.log(`Received shared knowledge on topic: ${knowledge.topic}`);
            // Add knowledge to conversation context for future reasoning
            this.addToConversation('system', `Shared Knowledge Received on "${knowledge.topic}":\n${JSON.stringify(knowledge.content)}`);
            // TODO: Could also store this in SharedMemory via the Librarian for more persistent recall.
            break;

          case CollaborationMessageType.CONFLICT_RESOLUTION:
            const conflictData = message.payload as any;
            if (conflictData.resolution) {
              // This is a final resolution
              await this.processConflictResolution(conflictData);
            } else {
              // This is a request to vote
              console.log(`Received request to vote on conflict: ${conflictData.description}`);
              const vote = await this.generateConflictVote(conflictData);
              // The agent needs a way to send its vote back. This would typically be via the CollaborationManager.
              // This part of the protocol needs to be fully defined. For now, we log it.
              console.log(`Generated vote:`, vote);
            }
            break;
        }
    }

    /**
     * Process a conflict resolution
     * @param resolution Conflict resolution
     */
    async processConflictResolution(resolution: ConflictResolutionResponse): Promise<void> {
        console.log(`Agent ${this.id} processing final conflict resolution:`, resolution);
        this.say(`Conflict ${resolution.conflictId} has been resolved. Outcome: ${resolution.explanation}`);
        // A more advanced implementation would involve the agent taking action based on the resolution,
        // such as retrying a failed step with corrected data or updating its plan.
        // For now, we log the outcome and add it to the conversation for context.
        this.addToConversation('system', `Conflict Resolution Outcome for ${resolution.conflictId}:\nResolution: ${JSON.stringify(resolution.resolution)}
Explanation: ${resolution.explanation}`);
    }

    /**
     * Delegate a step to a specialized agent with the appropriate role
     * @param step Step to delegate
     * @returns Result of delegation
     */
    private async _getOrCreateSpecializedAgent(roleId: string): Promise<string | null> {
        try {
            const response = await this.authenticatedApi.post(`http://${this.agentSetUrl}/findAgentWithRole`, {
                roleId: roleId,
                missionId: this.missionId
            });

            if (response.data && response.data.agentId && response.data.status !== AgentStatus.ERROR) {
                console.log(`Found active agent ${response.data.agentId} with role ${roleId}`);
                return response.data.agentId;
            } else {
                if (response.data && response.data.agentId) {
                    console.log(`Found agent ${response.data.agentId} with role ${roleId}, but it is in error state. Creating a new one.`);
                }
                console.log(`No active agent found with role ${roleId}, creating a new one.`);
                const createAgentResponse = await this.authenticatedApi.post(`http://${this.agentSetUrl}/createSpecializedAgent`, {
                    roleId: roleId,
                    missionId: this.missionId
                });

                if (createAgentResponse.data && createAgentResponse.data.agentId) {
                    const newAgentId = createAgentResponse.data.agentId;
                    console.log(`Created new agent ${newAgentId} with role ${roleId}. Awaiting its initialization.`);
                    // NEW: Poll AgentSet to check if the new agent is initialized
                    let initialized = false;
                    let attempts = 0;
                    const maxAttempts = 30; // Wait up to 30 seconds (30 * 1000ms)
                    while (!initialized && attempts < maxAttempts) {
                        const agentStatusResponse = await this.authenticatedApi.get(`http://${this.agentSetUrl}/agent/${newAgentId}`);
                        if (agentStatusResponse.data && agentStatusResponse.data.status === AgentStatus.RUNNING) {
                            initialized = true;
                            console.log(`New agent ${newAgentId} is initialized.`);
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
                            attempts++;
                        }
                    }

                    if (initialized) {
                        return newAgentId;
                    } else {
                        console.error(`New agent ${newAgentId} failed to initialize within the timeout period.`);
                        return null;
                    }
                } else {
                    console.error(`Failed to create specialized agent with role ${roleId}`);
                    return null;
                }
            }
        } catch (error) {
            console.error(`Error finding or creating agent with role ${roleId}:`, error);
            return null;
        }
    }

    private async delegateStepToSpecializedAgent(step: Step, recipientId?: string): Promise<{ success: boolean, result: any }> {
        try {
            const finalRecipientId = recipientId || await this._getOrCreateSpecializedAgent(step.recommendedRole!);

            if (finalRecipientId) {
                console.log(`Attempting to delegate step ${step.id} to agent ${finalRecipientId} with role ${step.recommendedRole}`);
                // Create a task delegation request
                const delegationRequest = {
                    taskId: uuidv4(),
                    taskType: step.actionVerb,
                    description: step.description || `Execute ${step.actionVerb}`,
                    inputs: MapSerializer.transformForSerialization(step.inputValues),
                    dependencies: step.dependencies,
                    outputs: MapSerializer.transformForSerialization(step.outputs),
                    priority: 'normal',
                    context: {
                        sourceAgentId: this.id,
                        sourceStepId: step.id,
                        recommendedRole: step.recommendedRole
                    }
                };

                // Delegate the task to the specialized agent
                const delegationResponse = await this.authenticatedApi.post(`http://${this.agentSetUrl}/delegateTask`, {
                    delegatorId: this.id,
                    recipientId: finalRecipientId,
                    request: delegationRequest
                });

                if (delegationResponse.data && delegationResponse.data.accepted) {
                    console.log(`Successfully delegated step ${step.id} to agent ${finalRecipientId}`);
                    // Store the mapping from the delegated task ID to our internal step ID
                    this.delegatedSteps.set(delegationResponse.data.taskId, step.id);
                    step.status = StepStatus.SUB_PLAN_RUNNING; // Mark as waiting for delegation result

                    return {
                        success: true,
                        result: {
                            taskId: delegationResponse.data.taskId,
                            recipientId: finalRecipientId,
                            estimatedCompletion: delegationResponse.data.estimatedCompletion
                        }
                    };
                } else {
                    console.log(`Agent ${finalRecipientId} rejected delegation: ${delegationResponse.data.reason}`);
                    return { success: false, result: null };
                }
            } else {
                console.error(`Could not find or create an agent with role ${step.recommendedRole}`);
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
     * Execute a plan template directly.
     * This creates a new step that executes the plan template.
     * @param templateId - The ID of the plan template to execute.
     * @param inputs - Inputs for the plan template.
     * @param options - Options for execution, including executionMode and whether to wait for completion.
     * @returns Promise resolving to the execution result, or the final context if waiting.
     */
    async executePlanTemplate(
        templateId: string,
        inputs: any,
        options: { executionMode?: string; wait?: boolean } = { executionMode: 'automatic', wait: false }
    ): Promise<PluginOutput[] | PlanExecutionContext | null> {
        const { executionMode, wait } = options;
        console.log(`Agent ${this.id} executing plan template: ${templateId}${wait ? ' and waiting for completion' : ''}`);

        // Create a new step for plan template execution
        const planStep = new Step({
            actionVerb: 'EXECUTE_PLAN_TEMPLATE',
            missionId: this.missionId,
            ownerAgentId: this.id,
            recommendedRole: this.role,
            status: StepStatus.PENDING,
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
            this.handleAskStep.bind(this),
            this.steps
        );

        // Save the work product
        const isAgentEndpointForPlan = planStep.isEndpoint(this.steps);
        await this.saveWorkProductWithClassification(planStep.id, result, isAgentEndpointForPlan, this.getAllAgentsInMission());

        if (!wait) {
            console.log(`Agent ${this.id} started plan template execution: ${templateId}`);
            return result;
        }

        // --- Waiting logic ---
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

        // --- Monitoring logic ---
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

    private async _uploadOutputs(
        step: Step,
        data: PluginOutput[],
        librarianUrl: string
    ): Promise<MissionFile[]> {
        if (!data || data.length === 0) {
            return [];
        }

        const uploadedFiles: MissionFile[] = [];
        const missionControlUrl = await this.getServiceUrl('MissionControl');
        const hasDeliverables = step.hasDeliverableOutputs();

        for (const output of data) {
            try {
                const isDeliverable = step.isOutputDeliverable(output.name);

                if (hasDeliverables && !isDeliverable) {
                    console.log(`[Agent.ts] Skipping non-deliverable output: ${output.name}`);
                    continue;
                }

                if (!output.result || output.result === '') {
                    console.log(`[Agent.ts] Skipping empty output: ${output.name}`);
                    continue;
                }

                let fileName: string;
                if (isDeliverable) {
                    fileName = step.getDeliverableFilename(output.name) || `${output.name.replace(/[^a-zA-Z0-9_-]/g, '_')}${this.getFileExtensionForOutput(output)}`;
                } else {
                    const sanitizedName = output.name.replace(/[^a-zA-Z0-9_-]/g, '_');
                    const extension = this.getFileExtensionForOutput(output);
                    fileName = `step_${step.stepNo}_${sanitizedName}${extension}`;
                }

                const mimeType = output.mimeType || this.getMimeTypeForOutput(output);

                let fileContent: string;
                if (typeof output.result === 'string') {
                    fileContent = output.result;
                } else {
                    fileContent = JSON.stringify(output.result, null, 2);
                    if (!fileName.endsWith('.json')) {
                        fileName = fileName.replace(/\.[^.]*$/, '') + '.json';
                    }
                }

                const missionFile: MissionFile = {
                    id: uuidv4(),
                    originalName: fileName,
                    mimeType: mimeType,
                    size: Buffer.byteLength(fileContent, 'utf8'),
                    uploadedAt: new Date(),
                    uploadedBy: `agent-${this.id}`,
                    storagePath: `${isDeliverable ? 'deliverables' : 'step-outputs'}/${this.missionId}/${fileName}`,
                    description: `Output from step ${step.stepNo}: ${step.actionVerb} - ${output.resultDescription}`,
                    isDeliverable: isDeliverable,
                    stepId: step.id
                } as any;

                await this.authenticatedApi.post(`http://${librarianUrl}/storeData`, {
                    id: `${isDeliverable ? 'deliverable' : 'step-output'}-${missionFile.id}`,
                    data: {
                        fileContent: fileContent,
                        missionFile: missionFile
                    },
                    storageType: 'mongo',
                    collection: isDeliverable ? 'deliverables' : 'step-outputs'
                });

                if (isDeliverable && missionControlUrl) {
                    await this.authenticatedApi.post(`http://${missionControlUrl}/missions/${this.missionId}/files/add`, missionFile);
                }

                uploadedFiles.push(missionFile);
                console.log(`[Agent.ts] Uploaded output to shared space: ${fileName} (from output: ${output.name})`);

            } catch (error) {
                console.error(`[Agent.ts] Failed to upload output ${output.name}:`, error);
            }
        }

        console.log(`[Agent.ts] Uploaded ${uploadedFiles.length} files from step ${step.stepNo}`);
        return uploadedFiles;
    }

    /**
     * Determines the appropriate file extension for an output
     */
    private getFileExtensionForOutput(output: PluginOutput): string {
        if (output.fileName) {
            const ext = output.fileName.substring(output.fileName.lastIndexOf('.'));
            if (ext) return ext;
        }

        switch (output.resultType) {
            case PluginParameterType.STRING:
                return '.txt';
            case PluginParameterType.OBJECT:
            case PluginParameterType.ARRAY:
                return '.json';
            case PluginParameterType.PLAN:
                return '.json';
            default:
                return '.txt';
        }
    }

    /**
     * Determines the appropriate MIME type for an output
     */
    private getMimeTypeForOutput(output: PluginOutput): string {
        if (output.mimeType) {
            return output.mimeType;
        }

        switch (output.resultType) {
            case PluginParameterType.STRING:
                return 'text/plain';
            case PluginParameterType.OBJECT:
            case PluginParameterType.ARRAY:
            case PluginParameterType.PLAN:
                return 'application/json';
            default:
                return 'text/plain';
        }
    }

    private async handleStepSuccess(step: Step, result: PluginOutput[]): Promise<void> {
        const isAgentEndpoint = step.isEndpoint(this.steps);
        await this.saveWorkProductWithClassification(step.id, result, isAgentEndpoint, this.getAllAgentsInMission());

        // Reset replan depth on successful step completion to allow future replanning
        // This prevents the system from getting stuck after a few failures
        if (this.replanDepth > 0) {
            this.replanDepth = Math.max(0, this.replanDepth - 1);
            console.log(`[Agent ${this.id}] Step ${step.actionVerb} completed successfully. Reduced replan depth to ${this.replanDepth}`);
        }

        await this.updateStatus();
        await this.pruneSteps();
    }

    private async handleRecoverableFailure(step: Step): Promise<void> {
        if (step.recoverableRetryCount < step.maxRecoverableRetries) {
            step.recoverableRetryCount++;
            step.status = StepStatus.PENDING; // Set back to pending to be picked up again
            this.say(`Step ${step.actionVerb} failed with a recoverable data error. Retrying with a short delay...`);
            await this.logEvent({
                eventType: 'step_retry_recoverable',
                agentId: this.id,
                stepId: step.id,
                retryCount: step.recoverableRetryCount,
                maxRetries: step.maxRecoverableRetries,
                error: step.lastError?.message,
                timestamp: new Date().toISOString()
            });
            // Optional: Add a small delay before it's picked up again
            await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
            // If max recoverable retries are exhausted, treat as a permanent failure
            this.say(`Step ${step.actionVerb} has failed repeatedly with a recoverable error. Escalating to a permanent failure.`);
            step.status = StepStatus.ERROR;
            await this.replanFromFailure(step);
        }
    }

    private async handleStepFailure(step: Step, error: Error): Promise<void> {
        this.lastFailedStep = step;
        step.lastError = error;
        const errorType = classifyStepError(step.lastError);

        // New logic to handle specific error types from CapabilitiesManager
        if (error.name === 'StepInputError') {
            step.status = StepStatus.ERROR;
            this.say(`Step ${step.actionVerb} failed due to invalid input data. The step will be skipped and the mission will continue.`);
            await this.logEvent({
                eventType: 'step_skipped_invalid_input',
                agentId: this.id,
                stepId: step.id,
                error: step.lastError.message,
                timestamp: new Date().toISOString()
            });
            // No replan, just move on
            return;
        }

        if (error.name === 'PluginExecutionError' && step.retryCount < step.maxRetries) {
            step.retryCount++;
            step.status = StepStatus.PENDING;
            this.say(`Step ${step.actionVerb} failed during execution. Retrying...`);
            await this.logEvent({
                eventType: 'step_retry_execution_error',
                agentId: this.id,
                stepId: step.id,
                retryCount: step.retryCount,
                maxRetries: step.maxRetries,
                error: step.lastError.message,
                timestamp: new Date().toISOString()
            });
            return; // Return to allow the retry
        }

        if (errorType === StepErrorType.RECOVERABLE) {
            await this.handleRecoverableFailure(step);
            return; // Return to allow the retry or replan
        }

        if (errorType === StepErrorType.VALIDATION) {
            // For validation errors, immediately trigger replanning
            step.status = StepStatus.ERROR;
            this.say(`Step ${step.actionVerb} failed validation. Attempting to create a new plan with corrected inputs...`);
            await this.logEvent({
                eventType: 'step_validation_error',
                agentId: this.id,
                stepId: step.id,
                error: step.lastError.message,
                timestamp: new Date().toISOString()
            });
        } else if (errorType === StepErrorType.TRANSIENT && step.retryCount < step.maxRetries) {
            step.retryCount++;
            step.status = StepStatus.PENDING;
            this.say(`Step ${step.actionVerb} failed with a temporary error. Retrying...`);
            await this.logEvent({
                eventType: 'step_retry',
                agentId: this.id,
                stepId: step.id,
                retryCount: step.retryCount,
                maxRetries: step.maxRetries,
                error: step.lastError.message,
                timestamp: new Date().toISOString()
            });
        } else {
            // Permanent failure
            step.status = StepStatus.ERROR;
            this.say(`Step ${step.actionVerb} failed permanently. Attempting to create a new plan to recover.`);
            // Intelligent Replanning
            await this.replanFromFailure(step);
        }
        await this.updateStatus();
    }

    public getLastFailedStep(): Step | null {
        return this.lastFailedStep;
    }

    private async pruneSteps(): Promise<void> {
        const activeStepIds = new Set(this.steps.filter(s => 
            s.status in [StepStatus.PENDING, StepStatus.RUNNING, StepStatus.SUB_PLAN_RUNNING, StepStatus.WAITING]
        ).map(s => s.id));

        for (const step of this.steps) {
            if (step.status in [StepStatus.COMPLETED, StepStatus.ERROR, StepStatus.CANCELLED]) {
                
                let hasActiveDependents = false;
                for (const otherStep of this.steps) {
                    if (activeStepIds.has(otherStep.id)) {
                        for (const dep of otherStep.dependencies) {
                            if (dep.sourceStepId === step.id) {
                                hasActiveDependents = true;
                                break;
                            }
                        }
                        if (hasActiveDependents) break;
                    }
                }

                if (!hasActiveDependents) {
                    // This step can be pruned. Clear its data to free memory.
                    step.clearTempData(); // Clears result and tempData
                    console.log(`[Agent ${this.id}] Pruned completed step ${step.id} (${step.actionVerb}).`);
                }
            }
        }
    }

    private async getCompletedWorkProductsSummary(): Promise<string> {
        let summary = 'Completed Work Products:\n';
        for (const step of this.steps) {
            if (step.status === StepStatus.COMPLETED && step.result) {
                summary += `Step ${step.stepNo}: ${step.actionVerb}\n`;
                for (const output of step.result) {
                    if (output.resultType !== PluginParameterType.PLAN) {
                        summary += `  - ${output.name}: ${output.resultDescription}\n`;
                    }
                }
            }
        }
        return summary;
    }

    public async replanFromFailure(failedStep: Step): Promise<void> {
        if (this.lastFailedStep && this.lastFailedStep.id === failedStep.id) {
            console.log(`[Agent ${this.id}] Detected repeated failure of step ${failedStep.id}. Aborting this branch of the plan to prevent infinite loop.`);
            this.say(`Step ${failedStep.actionVerb} failed again. Aborting this branch of the plan.`);
            failedStep.status = StepStatus.ERROR;
            await this.notifyDependents(failedStep.id, StepStatus.CANCELLED);
            await this.updateStatus();
            return;
        }

        // Check replanning depth to prevent infinite recursion
        if (this.replanDepth >= this.maxReplanDepth) {
            console.warn(`[Agent ${this.id}] Maximum replanning depth (${this.maxReplanDepth}) reached. Aborting this branch of the plan to prevent infinite recursion.`);
            this.say(`Maximum replanning depth reached. This suggests a fundamental issue that cannot be resolved through replanning. Aborting this branch of the plan.`);
            failedStep.status = StepStatus.ERROR;
            await this.notifyDependents(failedStep.id, StepStatus.CANCELLED);
            await this.updateStatus();
            return;
        }

        const failedStepId = failedStep.id;
        const dependentSteps = this.steps.filter(step =>
            step.dependencies.some(dep => dep.sourceStepId === failedStepId)
        );

        for (const step of dependentSteps) {
            if (step.status === StepStatus.PENDING) {
                step.status = StepStatus.CANCELLED;
                console.log(`[Agent ${this.id}] Cancelling step ${step.id} because its dependency ${failedStepId} failed.`);
                this.logEvent({
                    eventType: 'step_cancelled_dependency_failed',
                    agentId: this.id,
                    stepId: step.id,
                    failedDependencyId: failedStepId,
                    timestamp: new Date().toISOString()
                });
            }
        }

        // Enhanced loop detection - check for multiple failures of the same action verb
        const failedVerb = failedStep.actionVerb;
        const recentFailures = this.steps.filter(s =>
            s.actionVerb === failedVerb &&
            s.status === StepStatus.ERROR &&
            s.id !== failedStep.id
        );

        // Check if this step has already been replanned or if there are too many failures
        if (this.replannedSteps.has(failedStepId) || recentFailures.length >= 2) {
            console.warn(`[Agent ${this.id}] Multiple failures detected for action verb '${failedVerb}' or step already replanned. Aborting this branch of the plan to prevent loop.`);
            this.say(`Multiple failures for action verb '${failedVerb}'. This suggests a fundamental issue that cannot be resolved through replanning. Aborting this branch of the plan.`);
            failedStep.status = StepStatus.ERROR;
            await this.notifyDependents(failedStep.id, StepStatus.CANCELLED);
            await this.updateStatus();
            return;
        }

        // Mark this step as replanned and increment depth
        this.replannedSteps.add(failedStepId);
        this.replanDepth++;
        this.lastFailedStep = failedStep;

        const errorMsg = failedStep.lastError?.message || 'Unknown error';
        const workProductsSummary = await this.getCompletedWorkProductsSummary();

        await this.replanFromFailureWithReflect(failedStep, errorMsg, workProductsSummary);
    }

    private async replanFromFailureWithReflect(failedStep: Step, errorMsg: string, workProductsSummary: string): Promise<void> {
        console.log(`[Agent ${this.id}] Creating REFLECT recovery step for: ${failedStep.actionVerb}`);

        const reflectPrompt = `
Context: The step "${failedStep.actionVerb}" failed with the error: "${errorMsg}".

Task: Analyze this error and the completed work products to generate a new plan to achieve the original goal. The plan should be a series of actionable steps.

Completed Work:
${workProductsSummary}
        `;

        const recoveryStep = new Step({
            actionVerb: 'REFLECT',
            missionId: this.missionId,
            ownerAgentId: this.id,
            recommendedRole: this.role, // Or a specialized 'planner' or 'critic' role
            stepNo: this.steps.length + 1,
            inputValues: new Map([
                ['prompt', { inputName: 'prompt', value: reflectPrompt, valueType: PluginParameterType.STRING, args: {} }]
            ]),
            description: `Reflect on the failure of step "${failedStep.actionVerb}" and create a new plan.`, 
            persistenceManager: this.agentPersistenceManager
        });

        this.steps.push(recoveryStep);
        await this.logEvent({ eventType: 'step_created', ...recoveryStep.toJSON() });
        console.log(`[Agent ${this.id}] Created REFLECT recovery step ${recoveryStep.id} for failed step ${failedStep.actionVerb}.`);
        await this.updateStatus();
    }
}
