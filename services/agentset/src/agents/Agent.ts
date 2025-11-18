import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import axios from 'axios';
import { AgentStatus } from '../utils/agentStatus';
import { getServiceUrls } from '../utils/postOfficeInterface';
import { MapSerializer, BaseEntity, LLMConversationType } from '@cktmcs/shared';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { PluginOutput, PluginParameterType, InputValue, ExecutionContext as PlanExecutionContext, MissionFile } from '@cktmcs/shared';
import { ActionVerbTask, InputReference } from '@cktmcs/shared';
import { AgentConfig, AgentStatistics, OutputType } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { Step, StepStatus, createFromPlan } from './Step';
import { StateManager } from '../utils/StateManager';
import { classifyStepError, StepErrorType } from '../utils/ErrorClassifier';
import { CollaborationMessageType, ConflictResolutionResponse, KnowledgeSharing, } from '../collaboration/CollaborationProtocol';
import { CrossAgentDependencyResolver } from '../utils/CrossAgentDependencyResolver';
import { AgentSet } from '../AgentSet';

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
    private agentSet: AgentSet;
    private crossAgentResolver: CrossAgentDependencyResolver;

    public get initialized(): Promise<boolean> {
        return this._initializationPromise;
    }

    // Properties for lifecycle management
    private checkpointInterval: NodeJS.Timeout | null = null;
    private currentQuestionResolve: ((value: string) => void) | null = null;

    constructor(config: AgentConfig & { agentSet: AgentSet }) {
        super(config.id, 'Agent', config.agentSet.id, config.agentSet.port, true);
        this.agentSet = config.agentSet;
        this.crossAgentResolver = new CrossAgentDependencyResolver(this.agentSet);
        this.agentPersistenceManager = new AgentPersistenceManager(undefined, this.authenticatedApi);
        this.stateManager = new StateManager(config.id, this.agentPersistenceManager, this.crossAgentResolver);
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
            const initialStep = this.createStep(
                config.actionVerb,
                this.inputValues,
                'Initial mission step',
                StepStatus.PENDING,
            );
            this.steps.push(initialStep);
        }
        
        this.setAgentStatus(this.status, {eventType: 'agent_created', inputValues: MapSerializer.transformForSerialization(this.inputValues)});

        // Await RabbitMQ initialization before proceeding
        this._initializationPromise = this.initRabbitMQ().then(() => this.initializeAgent()).then(() => {
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

    private createStep(actionVerb: string, inputValues : Map<string, InputValue> | undefined, description : string, status: StepStatus) : Step {
        const newStep = new Step({
                actionVerb: actionVerb,
                missionId: this.missionId,
                ownerAgentId: this.id,
                inputValues: inputValues,
                description: description,
                status: status,
                persistenceManager: this.agentPersistenceManager,
                crossAgentResolver: this.crossAgentResolver
            });
        this.agentSet.registerStepLocation(newStep.id, this.id, this.agentSet.url); // Register the step with AgentSet
        return newStep;
    }

    private async initRabbitMQ(): Promise<void> {
        try {
            const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672';
            this.connection = amqp_connection_manager.connect([rabbitmqUrl]);

            this.connection.on('connect', () => console.log(`Agent ${this.id} connected to RabbitMQ!`));
            this.connection.on('disconnect', async (err) => {
                console.error(`Agent ${this.id} disconnected from RabbitMQ. Attempting to re-initialize...`, err);
                // Attempt to re-initialize the connection and channel
                await this._reinitializeRabbitMQ();
            });

            this.channel = this.connection.createChannel({
                json: true,
                setup: async (channel: amqp.Channel) => {
                    await channel.assertExchange('agent.events', 'topic', { durable: true });
                    console.log(`Agent ${this.id} asserted 'agent.events' exchange.`);
                },
            });

            this.channel.on('error', async (err) => {
                console.error(`Agent ${this.id} RabbitMQ channel error. Attempting to re-initialize...`, err);
                await this._reinitializeRabbitMQ();
            });

        } catch (error) {
            console.error(`Error initializing RabbitMQ for Agent ${this.id}:`, error);
        }
    }

    private async _reinitializeRabbitMQ(): Promise<void> {
        console.log(`Agent ${this.id} re-initializing RabbitMQ connection and channel.`);
        // Clear existing connection and channel to force a fresh start
        if (this.connection) {
            try {
                await this.connection.close();
            } catch (e) {
                console.warn(`Error closing old RabbitMQ connection for Agent ${this.id}:`, e);
            }
        }
        this.connection = null;
        this.channel = null;
        // Re-call initRabbitMQ to establish a new connection
        await this.initRabbitMQ();
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
            console.debug(`[Agent ${this.id}] runUntilDone: hasActiveWork() returned true. Continuing.`);
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
            console.log(`[Agent ${this.id}] runUntilDone: Agent has completed all active work. Final status: ${this.status}`);
        } else {
            console.log(`[Agent ${this.id}] runUntilDone: Agent loop exited with status: ${this.status}. No active work remaining.`);
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
        const activeSteps = this.steps.filter(step =>
            step.status === StepStatus.PENDING ||
            step.status === StepStatus.RUNNING ||
            step.status === StepStatus.SUB_PLAN_RUNNING
        );
        if (activeSteps.length === 0) {
            console.debug(`[Agent ${this.id}] hasActiveWork: No active steps found. All steps: ${this.steps.map(s => `${s.id} (${s.actionVerb}, ${s.status})`).join(', ') || 'None'}`);
        }
        return activeSteps.length > 0;
    }

    private _extractPlanFromReflectionResult(result: PluginOutput[]): ActionVerbTask[] | null {
        const planOutput = result.find(r => r.name === 'plan');
        const answerOutput = result.find(r => r.name === 'answer');

        if (planOutput && planOutput.result && Array.isArray(planOutput.result)) {
            console.log(`[Agent ${this.id}] _extractPlanFromReflectionResult: Extracted plan from 'plan' output.`);
            return planOutput.result as ActionVerbTask[];
        }

        if (answerOutput && answerOutput.result) {
            try {
                const parsedResult = typeof answerOutput.result === 'string' ? JSON.parse(answerOutput.result) : answerOutput.result;
                if (Array.isArray(parsedResult)) {
                    console.log(`[Agent ${this.id}] _extractPlanFromReflectionResult: Extracted plan from 'answer' output.`);
                    return parsedResult as ActionVerbTask[];
                }
            } catch (e) {
                console.warn(`[Agent ${this.id}] _extractPlanFromReflectionResult: Failed to parse 'answer' as JSON plan, treating as prose.`);
            }
        }
        
        return null;
    }

    private async _handleReflectionResult(result: PluginOutput[], step: Step): Promise<void> {
        const newPlan = this._extractPlanFromReflectionResult(result);
        const directAnswerOutput = result.find(r => r.name === 'direct_answer');

        if (newPlan) {
            console.log(`[Agent ${this.id}] _handleReflectionResult: Reflection resulted in a new plan with ${newPlan.length} steps. Updating plan.`);
            this.say('Reflection resulted in a new plan. Updating plan.');
            const currentStepIndex = this.steps.findIndex(s => s.id === step.id);
            if (currentStepIndex !== -1) {
                console.log(`[Agent ${this.id}] _handleReflectionResult: Cancelling ${this.steps.length - (currentStepIndex + 1)} subsequent steps.`);
                for (let i = currentStepIndex + 1; i < this.steps.length; i++) {
                    this.steps[i].status = StepStatus.CANCELLED;
                }
            }
            this.addStepsFromPlan(newPlan, step);
            await this.updateStatus();
        } else if (directAnswerOutput && directAnswerOutput.result) {
            const directAnswer = directAnswerOutput.result;
            console.log(`[Agent ${this.id}] _handleReflectionResult: Reflection provided a direct answer. Creating new ACCOMPLISH step.`);
            this.say(`Reflection provided a direct answer. Creating new ACCOMPLISH step to pursue this direction.`);
            this.addToConversation('system', `Reflection Direct Answer: ${directAnswer}`);
            const currentStepIndex = this.steps.findIndex(s => s.id === step.id);
            if (currentStepIndex !== -1) {
                console.log(`[Agent ${this.id}] _handleReflectionResult: Cancelling ${this.steps.length - (currentStepIndex + 1)} subsequent steps.`);
                for (let i = currentStepIndex + 1; i < this.steps.length; i++) {
                    this.steps[i].status = StepStatus.CANCELLED;
                }
            }
            const newAccomplishStep = this.createStep(
                'ACCOMPLISH',
                new Map([['goal', { inputName: 'goal', value: directAnswer, valueType: PluginParameterType.STRING }]]),
                `Pursue direct answer from reflection: ${directAnswer.substring(0, 100)}${directAnswer.length > 100 ? '...' : ''}`,
                StepStatus.PENDING
            );
            this.steps.push(newAccomplishStep);
            await this.updateStatus();
        } else {
            console.log(`[Agent ${this.id}] _handleReflectionResult: Reflection did not provide a clear plan or answer. Continuing with the current plan.`);
            this.say('Reflection did not provide a clear plan or answer. Continuing with the current plan.');
        }
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

            console.log(`[Agent ${this.id}] executeStep: Checking result for pending_user_input. Result: ${JSON.stringify(this.truncateLargeStrings(result))}`);

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
            } else if (result && result.length > 0 && result[0].name === 'status' && result[0].result === StepStatus.WAITING) {
                console.log(`[Agent ${this.id}] executeStep: REGROUP step ${step.id} is WAITING for dependent steps.`);
                step.status = StepStatus.WAITING;
                return; // Do not call handleStepSuccess, keep step in WAITING state
            } else {
                console.log(`[Agent ${this.id}] executeStep: Result is NOT pending_user_input. Actual result: ${JSON.stringify(this.truncateLargeStrings(result))}`);
            }

            this.say(`Completed step: ${step.actionVerb}`);

            if (step.actionVerb === 'REFLECT') {
                await this._handleReflectionResult(result, step);
                // After handling reflection, if a new plan was generated,
                // we need to stop processing the current step and let the runAgent loop
                // pick up the new steps.
                // The _handleReflectionResult method adds new steps and calls updateStatus.
                // We should ensure the current step (the REFLECT step itself) is marked as completed
                // and then return to allow the main loop to re-evaluate.
                await this.handleStepSuccess(step, result); // Mark the REFLECT step as completed
                return; // Exit executeStep for the REFLECT step
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
                    console.debug(`[Agent ${this.id}] executeStep: Steps after adding new plan: ${this.steps.map(s => `${s.id} (${s.actionVerb}, ${s.status})`).join(', ')}`);
                    await this.updateStatus();
                    // After adding new steps from a PLAN result, we should also return
                    // to allow the main loop to re-evaluate.
                    await this.handleStepSuccess(step, result); // Mark the planning step as completed
                    return; // Exit executeStep for the planning step
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
            console.debug(`[Agent ${this.id}] runAgent: Pending steps: ${pendingSteps.map(s => `${s.id} (${s.actionVerb}, ${s.status})`).join(', ') || 'None'}`);

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
                        console.log(`[Agent ${this.id}] Cancelling step ${step.id} (${step.actionVerb}) due to permanently unsatisfied dependencies.`);
                    }
                }
            } else if (!this.hasActiveWork()) {
                console.log(`[Agent ${this.id}] runAgent: No active work found. Setting agent status to COMPLETED.`);
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
        console.log(`[Agent ${this.id}] Parsed plan for addStepsFromPlan:`, JSON.stringify(this.truncateLargeStrings(plan), null, 2));
        const newSteps = createFromPlan(plan, this.agentPersistenceManager, this.crossAgentResolver, parentStep, this);
        this.steps.push(...newSteps);
        for (const step of newSteps) {
            this.agentSet.registerStepLocation(step.id, this.id, this.agentSet.url);
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
        console.log(`Agent ${this.id} received message:`, this.truncateLargeStrings(message));
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
            console.log(`[Agent ${this.id}] Sending CHAT message to user: ${message} from input: ${JSON.stringify(this.truncateLargeStrings(messageInput))}`);

            if (typeof message === 'string' && message) {
                this.say(message, true);
                return [{
                    success: true,
                    name: 'success',
                    resultType: PluginParameterType.STRING,
                    resultDescription: 'Message sent to user.',
                    result: 'Message sent successfully.'
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
        try {
            const response = await this.askUser(question, choices, answerType);

            return [{
                success: true,
                name: 'answer',
                resultType: PluginParameterType.STRING,
                resultDescription: 'User response',
                result: response
            }];
        } catch (error) { analyzeError(error as Error);
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

    private async saveWorkProductWithClassification(step: Step, data: PluginOutput[]): Promise<void> {
        if (this.status in [AgentStatus.PAUSED, AgentStatus.ABORTED]) {
            console.log(`Agent ${this.id} is in status ${this.status}, skipping saveWorkProduct for step ${step.id}.`);
            return;
        }

        try {
            // Determine the output type before saving
            const outputType = step.getOutputType(this.steps);

            // The new, consolidated save method in the persistence manager handles both work products and deliverables
            await this.agentPersistenceManager.saveWorkProduct(step, data, outputType);

            // UI notification logic remains here
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

            // The UI can use the isDeliverable flag to know when to fetch the full deliverable details separately.
            // The attachedFiles property is removed as it's no longer sourced here.

            await this.sendMessage(MessageType.WORK_PRODUCT_UPDATE, 'user', workProductPayload);

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

        // Enrich prompt for GENERATE and THINK using context, goals, constraints, and explicit output instructions
        let enrichedPrompt = '';
        const goal = inputs.get('goal')?.value;
        const context = this.missionContext || inputs.get('context')?.value;
        const constraints = inputs.get('constraints')?.value;
        const userPrompt = inputs.get('prompt')?.value;
        const outputFormat = actionVerb === 'GENERATE' ? 'Return a concise answer in plain text.' : 'List your reasoning steps before the answer.';

        enrichedPrompt += `You are an autonomous agent.`;
        if (goal) enrichedPrompt += `\nGoal: ${goal}`;
        if (context) enrichedPrompt += `\nContext: ${context}`;
        if (constraints) enrichedPrompt += `\nConstraints: ${constraints}`;
        if (userPrompt) enrichedPrompt += `\nTask: ${userPrompt}`;
        enrichedPrompt += `\nInstructions: ${outputFormat}`;

        if (actionVerb === 'GENERATE') {
            brainEndpoint = 'generate';
            outputName = 'generated_content';
            outputDescription = 'Content generated by LLM service.';

            const conversationType = inputs.get('conversationType')?.value as LLMConversationType || LLMConversationType.TextToText;
            const modelName = inputs.get('modelName')?.value;
            const optimization = inputs.get('optimization')?.value;
            const file = inputs.get('file')?.value;
            const audio = inputs.get('audio')?.value;
            const video = inputs.get('video')?.value;
            const image = inputs.get('image')?.value;

            brainRequestBody = {
                type: conversationType,
                prompt: enrichedPrompt,
                modelName: modelName,
                optimization: optimization,
                file: file,
                audio: audio,
                video: video,
                image: image,
                trace_id: this.id // Assuming agent ID can be used as trace_id
            };
        } else { // THINK logic
            brainEndpoint = 'chat';
            outputName = 'answer';
            outputDescription = `Brain reasoning output (${inputs.get('conversationType')?.value || LLMConversationType.TextToText})`; // Use conversationType from inputs

            const prompt = enrichedPrompt;
            const optimization = (inputs.get('optimization')?.value as string) || 'accuracy';
            const conversationType = (inputs.get('conversationType')?.value as LLMConversationType) || LLMConversationType.TextToText;

            const validOptimizations = ['cost', 'accuracy', 'creativity', 'speed', 'continuity'];
            const validConversationTypes = [
                LLMConversationType.TextToText, 
                LLMConversationType.TextToImage, 
                LLMConversationType.TextToAudio, 
                LLMConversationType.TextToVideo, 
                LLMConversationType.TextToCode];

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
                exchanges: [...this.conversation, { role: 'user', content: prompt }], // Combine history with enriched prompt
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
                    console.warn(`[Agent ${this.id}] WARNING: Brain returned an empty or missing result for actionVerb=${actionVerb}. Response payload:`, JSON.stringify(this.truncateLargeStrings(response.data || {}), null, 2));
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
                id: uuidv4(),
                actionVerb: 'THINK',
                description: `Verify the following information which was returned with low confidence: "${brainResponse}"`, 
                inputReferences: new Map<string, InputReference>([
                    ['prompt', { inputName: 'prompt', value: `Verify the following fact: "${brainResponse}". Provide the verified fact and indicate if it is correct.`, valueType: PluginParameterType.STRING }]
                ]),
                outputs: new Map<string, PluginParameterType>([
                    ['verified_fact', PluginParameterType.STRING],
                    ['is_correct', PluginParameterType.BOOLEAN]
                ]),
                recommendedRole: 'critic'
            };

            const continuationTask: ActionVerbTask = {
                id: uuidv4(),
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
                if (step.actionVerb === 'ASK' || step.actionVerb === 'ASK_USER_QUESTION') {
                    return this.handleAskStep(step.inputValues);
                }

                const payload: any = { // Use 'any' for now to allow dynamic properties
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

        const stepStats = this.steps.map((step, idx) => {
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

            const outputType = step?.getOutputType(allStepsForMission || this.steps);

            return {
                id: stepId,
                verb: stepActionVerb, // Mapped to 'verb' for AgentStatistics interface
                status: stepStatus,
                dependencies: dependencies,
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
            if (!this.trafficManagerUrl) {
                console.warn(`[Agent ${this.id || 'unknown-id'}] Cannot check dependent agents: trafficManagerUrl is undefined.`);
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

    private truncateLargeStrings(obj: any, maxLength: number = 500): any {
        if (obj === null || typeof obj !== 'object') {
            return obj;
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.truncateLargeStrings(item, maxLength));
        }

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
        console.log(`Agent ${this.id} processing final conflict resolution:`, this.truncateLargeStrings(resolution));
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
            analyzeError(error as Error);
            return null;
        }
    }

    private async delegateStepToSpecializedAgent(step: Step, recipientId?: string): Promise<{ success: boolean, result: any }> {
        try {
            const finalRecipientId = recipientId || await this._getOrCreateSpecializedAgent(step.recommendedRole!);

            if (finalRecipientId) {
                console.log(`Attempting to transfer ownership of step ${step.id} to agent ${finalRecipientId} with role ${step.recommendedRole}`);
                
                const transferResult = await this.agentSet.ownershipTransferManager.transferStep(
                    step.id,
                    this.id,
                    finalRecipientId
                );

                if (transferResult.success) {
                    console.log(`Successfully transferred ownership of step ${step.id} to agent ${finalRecipientId}`);
                    step.status = StepStatus.SUB_PLAN_RUNNING; // Mark as waiting for delegation result
                    step.delegatedToAgentId = finalRecipientId; // Set the delegated agent ID on the step

                    return {
                        success: true,
                        result: {
                            stepId: step.id,
                            recipientId: finalRecipientId,
                            // estimatedCompletion: delegationResponse.data.estimatedCompletion // No longer available directly from transferStep
                        }
                    };
                } else {
                    console.log(`Failed to transfer ownership of step ${step.id} to agent ${finalRecipientId}: ${transferResult.error}`);
                    return { success: false, result: null };
                }
            } else {
                console.error(`Could not find or create an agent with role ${step.recommendedRole}`);
                return { success: false, result: null };
            }
        } catch (error) {
            console.error(`Error delegating step ${step.id}:`, error);
            analyzeError(error as Error);
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
        const planStep = this.createStep(
            'EXECUTE_PLAN_TEMPLATE',
            new Map<string, InputValue>(),
            `Execute plan template: ${templateId}`,
            StepStatus.PENDING);
        planStep.recommendedRole = this.role;
        planStep.inputReferences = new Map([
                ['templateId', { inputName: 'templateId', value: templateId, valueType: PluginParameterType.STRING, args: {} }],
                ['inputs', { inputName: 'inputs', value: inputs, valueType: PluginParameterType.OBJECT, args: {} }],
                ['userId', { inputName: 'userId', value: this.id, valueType: PluginParameterType.STRING, args: {} }],
                ['executionMode', { inputName: 'executionMode', value: executionMode, valueType: PluginParameterType.STRING, args: {} }]
            ]),
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
        await this.saveWorkProductWithClassification(planStep, result);

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



    private async handleStepSuccess(step: Step, result: PluginOutput[]): Promise<void> {
        // The new saveWorkProductWithClassification method now takes the step and result directly
        await this.saveWorkProductWithClassification(step, result);

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

        // Check replanning depth before attempting any replanning
        if (this.replanDepth >= this.maxReplanDepth) {
            console.warn(`[Agent ${this.id}] handleStepFailure: Maximum replanning depth (${this.replanDepth}/${this.maxReplanDepth}) reached. Aborting mission.`);
            this.say(`Maximum replanning depth reached. This suggests a fundamental issue that cannot be resolved through replanning. Aborting mission.`);
            step.status = StepStatus.ERROR;
            this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_error', details: `Maximum replanning depth (${this.replanDepth}/${this.maxReplanDepth}) reached`});
            await this.updateStatus();
            return;
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
            console.log(`[Agent ${this.id}] handleStepFailure: Validation error for step ${step.id}. Triggering replan.`);
            await this.replanFromFailure(step); // Call replanFromFailure
            await this.updateStatus(); // Update status after replan
            return;
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
            console.log(`[Agent ${this.id}] handleStepFailure: Transient error for step ${step.id}. Retrying (attempt ${step.retryCount}/${step.maxRetries}).`);
            await this.updateStatus(); // Update status after retry
            return;
        } else {
            // Permanent failure
            step.status = StepStatus.ERROR;
            this.say(`Step ${step.actionVerb} failed permanently. Attempting to create a new plan to recover.`);
            console.log(`[Agent ${this.id}] handleStepFailure: Permanent failure for step ${step.id}. Triggering replan.`);
            // Intelligent Replanning
            await this.replanFromFailure(step);
            await this.updateStatus(); // This is called after replanFromFailure
            return;
        }
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
                summary += `Step ${step.id}: ${step.actionVerb}\n`;
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
            console.log(`[Agent ${this.id}] replanFromFailure: Detected repeated failure of the same step (${failedStep.id}). Aborting this branch of the plan to prevent infinite loop.`);
            this.say(`Step ${failedStep.actionVerb} failed again. Aborting this branch of the plan.`);
            failedStep.status = StepStatus.ERROR;
            await this.notifyDependents(failedStep.id, StepStatus.CANCELLED);
            await this.updateStatus();
            this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_aborted_replan_loop', details: `Repeated failure of step ${failedStep.id}`});
            return;
        }

        // Check replanning depth to prevent infinite recursion
        if (this.replanDepth >= this.maxReplanDepth) {
            console.warn(`[Agent ${this.id}] replanFromFailure: Maximum replanning depth (${this.replanDepth}/${this.maxReplanDepth}) reached. Aborting this branch of the plan to prevent infinite recursion.`);
            this.say(`Maximum replanning depth reached. This suggests a fundamental issue that cannot be resolved through replanning. Aborting this branch of the plan.`);
            failedStep.status = StepStatus.ERROR;
            await this.notifyDependents(failedStep.id, StepStatus.CANCELLED);
            await this.updateStatus();
            this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_aborted_replan_depth', details: `Maximum replanning depth (${this.replanDepth}/${this.maxReplanDepth}) reached`});
            return;
        }

        const failedStepId = failedStep.id;
        const dependentSteps = this.steps.filter(step =>
            step.dependencies.some(dep => dep.sourceStepId === failedStepId)
        );

        for (const step of dependentSteps) {
            if (step.status === StepStatus.PENDING) {
                step.status = StepStatus.CANCELLED;
                console.log(`[Agent ${this.id}] replanFromFailure: Cancelling step ${step.id} (${step.actionVerb}) because its dependency ${failedStepId} failed.`);
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
            console.warn(`[Agent ${this.id}] replanFromFailure: Multiple failures detected for action verb '${failedVerb}' or step already replanned. Aborting this branch of the plan to prevent loop.`);
            this.say(`Multiple failures for action verb '${failedVerb}'. This suggests a fundamental issue that cannot be resolved through replanning. Aborting this branch of the plan.`);
            failedStep.status = StepStatus.ERROR;
            await this.notifyDependents(failedStep.id, StepStatus.CANCELLED);
            await this.updateStatus();
            this.setAgentStatus(AgentStatus.ERROR, {eventType: 'agent_aborted_multiple_failures', details: `Multiple failures for action verb '${failedVerb}'`});
            return;
        }

        // Mark this step as replanned and increment depth
        this.replannedSteps.add(failedStepId);
        this.replanDepth++;
        this.lastFailedStep = failedStep;
        console.log(`[Agent ${this.id}] replanFromFailure: Incrementing replan depth to ${this.replanDepth}.`);

        const errorMsg = failedStep.lastError?.message || 'Unknown error';
        const workProductsSummary = await this.getCompletedWorkProductsSummary();

        await this.replanFromFailureWithReflect(failedStep, errorMsg, workProductsSummary);
    }

    private async replanFromFailureWithReflect(failedStep: Step, errorMsg: string, workProductsSummary: string): Promise<void> {
        console.log(`[Agent ${this.id}] Creating REFLECT recovery step for: ${failedStep.actionVerb}`);

        const reflectPrompt = `
Context: The step "${failedStep.actionVerb}" failed with the error: "${errorMsg}".

Task: Analyze this error and the completed work products to generate a plan to achieve the original goal given the process so far and the issue preventing completion of the original plan. Your response MUST be a valid JSON array of step objects that represents a new plan to recover from this failure. Do not include any other text, explanation, or prose outside of the JSON array. If no recovery is possible, return an empty array [].

Completed Work:
${workProductsSummary}
        `;

        const recoveryStep = this.createStep(
            'REFLECT',
            new Map([
                ['prompt', { inputName: 'prompt', value: reflectPrompt, valueType: PluginParameterType.STRING, args: {} }]
            ]),
            `Reflect on the failure of step "${failedStep.actionVerb}" and create a new plan.`, 
            StepStatus.PENDING);
        recoveryStep.recommendedRole = this.role;
        this.steps.push(recoveryStep);
        await this.logEvent({ eventType: 'step_created', ...recoveryStep.toJSON() });
        console.log(`[Agent ${this.id}] Created REFLECT recovery step ${recoveryStep.id} for failed step ${failedStep.actionVerb}.`);
        await this.updateStatus();
    }
}
