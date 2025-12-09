import { v4 as uuidv4 } from 'uuid';
import express from 'express';
import axios from 'axios';
import { AgentStatus } from '../utils/agentStatus';
import { getServiceUrls } from '../utils/postOfficeInterface';
import { MapSerializer, BaseEntity, LLMConversationType } from '@cktmcs/shared';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';
import { PluginOutput, PluginParameterType, InputValue, ExecutionContext as PlanExecutionContext, ActionVerbTask, StepDependency } from '@cktmcs/shared';
import { AgentConfig, AgentStatistics, OutputType } from '@cktmcs/shared';
import { MessageType } from '@cktmcs/shared';
import { analyzeError } from '@cktmcs/errorhandler';
import { Step, StepStatus, createFromPlan } from './Step';
import { CollaborationMessageType, ConflictResolutionResponse, KnowledgeSharing, } from '../collaboration/CollaborationProtocol';
import { CrossAgentDependencyResolver } from '../utils/CrossAgentDependencyResolver';
import { AgentSet } from '../AgentSet';
import { StateManager } from '../utils/StateManager';
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
    private _initializationPromise: Promise<boolean>;
    private agentSet: AgentSet;
    private crossAgentResolver: CrossAgentDependencyResolver;
    private delegatedStepIds: Set<string> = new Set();
    private systemPrompt: string = '';
    private capabilities: string[] = [];
    private agentContext: Map<string, any> = new Map();
    // Flag to ensure end-of-mission reflection runs only once
    private reflectionDone: boolean = false;

    public get initialized(): Promise<boolean> {
        return this._initializationPromise;
    }

    private async getCompletedWorkProductsSummary(): Promise<string> {
        const completed = this.steps.filter(s => s.status === StepStatus.COMPLETED);
        if (!completed || completed.length === 0) return 'No completed work products.';

        const parts: string[] = [];
        for (const step of completed) {
            try {
                const wp = await this.agentPersistenceManager.loadStepWorkProduct(this.id, step.id);
                if (wp && wp.data) {
                    const snippet = typeof wp.data === 'string' ? wp.data.substring(0, 1000) : JSON.stringify(wp.data).substring(0, 1000);
                    parts.push(`Step(${step.actionVerb} - ${step.id}): ${snippet}`);
                } else if (step.result && step.result.length > 0) {
                    const r = step.result[0];
                    const snippet = typeof r.result === 'string' ? r.result.substring(0, 1000) : JSON.stringify(r.result).substring(0, 1000);
                    parts.push(`Step(${step.actionVerb} - ${step.id}): ${snippet}`);
                } else {
                    parts.push(`Step(${step.actionVerb} - ${step.id}): (no work product)`);
                }
            } catch (e) {
                parts.push(`Step(${step.actionVerb} - ${step.id}): (error reading work product)`);
            }
        }

        return parts.join('\n\n');
    }

    private async createEndOfMissionReflect(): Promise<void> {
        console.log(`[Agent ${this.id}] createEndOfMissionReflect: Preparing REFLECT step at mission end.`);
        const workProductsSummary = await this.getCompletedWorkProductsSummary();

        // Build plan history from all steps
        const planHistory = this.steps.map(step => ({
            id: step.id,
            actionVerb: step.actionVerb,
            description: step.description,
            status: step.status,
            inputs: step.inputValues ? MapSerializer.transformForSerialization(step.inputValues) : {},
            outputs: step.outputs || {},
            result: step.result || []
        }));

        const reflectQuestion = `Did we accomplish the mission? If YES, return an empty JSON array []. If NO, return a JSON array of step objects (a plan) that when executed will achieve the mission.`;

        const availablePlugins = this.inputValues?.get('availablePlugins');

        const reflectInputs = new Map<string, InputValue>([
            ['missionId', { inputName: 'missionId', value: this.missionId, valueType: PluginParameterType.STRING, args: {} }],
            ['plan_history', { inputName: 'plan_history', value: JSON.stringify(planHistory), valueType: PluginParameterType.STRING, args: {} }],
            ['work_products', { inputName: 'work_products', value: workProductsSummary, valueType: PluginParameterType.STRING, args: {} }],
            ['question', { inputName: 'question', value: reflectQuestion, valueType: PluginParameterType.STRING, args: {} }],
            ['agentId', { inputName: 'agentId', value: this.id, valueType: PluginParameterType.STRING, args: {} }]
        ]);

        if (availablePlugins) {
            reflectInputs.set('availablePlugins', availablePlugins);
        }

        const recoveryStep = this.createStep('REFLECT', reflectInputs, `End-of-mission reflection: did we accomplish the mission?`, StepStatus.PENDING);
        recoveryStep.recommendedRole = this.role;
        this.steps.push(recoveryStep);
        await this.logEvent({ eventType: 'step_created', ...recoveryStep.toJSON() });
        await this.updateStatus();
        console.log(`[Agent ${this.id}] createEndOfMissionReflect: REFLECT step ${recoveryStep.id} created with plan history of ${planHistory.length} steps.`);
    }

    // Properties for lifecycle management
    private checkpointInterval: NodeJS.Timeout | null = null;
    private currentQuestionResolve: ((value: string) => void) | null = null;
    private executionAbortController: AbortController | null = null;

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

        this.updateStatus = this.updateStatus.bind(this);

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
                // Safely close the connection. If it's already closed or in a bad state,
                // this might throw, but we catch it.
                await this.connection.close();
            } catch (e) {
                console.warn(`Error closing old RabbitMQ connection for Agent ${this.id}:`, e);
            }
        }
        this.connection = null;
        this.channel = null;

        // Implement a backoff strategy before attempting to reconnect
        const MAX_RECONNECT_ATTEMPTS = 5;
        let attempt = 0;
        while (attempt < MAX_RECONNECT_ATTEMPTS) {
            try {
                console.log(`Agent ${this.id} attempting RabbitMQ reconnect (attempt ${attempt + 1}/${MAX_RECONNECT_ATTEMPTS})...`);
                await this.initRabbitMQ();
                console.log(`Agent ${this.id} successfully reconnected to RabbitMQ.`);
                return; // Reconnection successful, exit loop
            } catch (error) {
                console.error(`Agent ${this.id} RabbitMQ reconnection failed on attempt ${attempt + 1}:`, error);
                attempt++;
                const delay = Math.min(Math.pow(2, attempt) * 1000, 30000); // Exponential backoff, max 30 seconds
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        console.error(`Agent ${this.id} failed to reconnect to RabbitMQ after ${MAX_RECONNECT_ATTEMPTS} attempts. RabbitMQ functionality may be impaired.`);
        // Optionally, set agent status to ERROR if critical functionality relies on RabbitMQ
        this.setAgentStatus(AgentStatus.ERROR, { eventType: 'rabbitmq_reconnect_failed', details: 'Failed to reconnect to RabbitMQ' });
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
        // Loop until truly done. We allow one opportunity to insert an end-of-mission
        // REFLECT step when there is no more active work to determine if the mission
        // was accomplished and, if not, to generate a recovery plan.
        while (true) {
            while (await this.hasActiveWork()) {
                await this.runAgent();
                // A short delay to prevent tight, CPU-intensive loops when the agent is truly idle but not yet completed.
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            // No active work at this point.
            // If we haven't yet run end-of-mission reflection and agent is still running,
            // create a REFLECT step to ask whether the mission is accomplished and to
            // generate a plan if not.
            if (!this.reflectionDone && this.status === AgentStatus.RUNNING) {
                console.log(`[Agent ${this.id}] runUntilDone: No active work left — creating end-of-mission REFLECT.`);
                try {
                    await this.createEndOfMissionReflect();
                    this.reflectionDone = true;
                    // Continue the outer loop so the newly-created REFLECT step is executed
                    continue;
                } catch (e) {
                    console.error(`Agent ${this.id} failed to create end-of-mission REFLECT:`, e instanceof Error ? e.message : e);
                }
            }

            // If we've already reflected (or agent isn't running), finalize.
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
                this.channel.publish(exchange, routingKey, Buffer.from(JSON.stringify(rabbitMessage)));
            })(),

            // 2. Logic for notifyTrafficManager
            (async () => {
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

    private async hasActiveWork(): Promise<boolean> {
        console.log(`[Agent ${this.id}] DEBUG: Agent.hasActiveWork: Checking for active work. Total steps: ${this.steps.length}.`);
        console.log(`[Agent ${this.id}] DEBUG: Agent.hasActiveWork: Step statuses: ${this.steps.map(s => `${s.id.substring(0, 8)}... (${s.status})`).join(', ')}`);
        // 1. Check for locally active steps
        const localActiveSteps = this.steps.filter(step =>
            step.status === StepStatus.PENDING ||
            step.status === StepStatus.RUNNING ||
            step.status === StepStatus.WAITING
        );

        if (localActiveSteps.length > 0) {
            console.log(`[Agent ${this.id}] DEBUG: Agent.hasActiveWork: Found ${localActiveSteps.length} local active steps. Returning true.`);
            return true;
        }

        // 2. Check for delegated steps
        // If we have any delegated steps being tracked, assume they're still active
        // The delegated agent will notify us when they're complete via the step completion callback
        if (this.delegatedStepIds.size > 0) {
            console.log(`[Agent ${this.id}] DEBUG: Agent.hasActiveWork: Found ${this.delegatedStepIds.size} delegated steps. Returning true.`);
            return true;
        }

        console.log(`[Agent ${this.id}] DEBUG: Agent.hasActiveWork: No active steps found. Returning false.`);
        return false;
    }

    private _extractPlanFromReflectionResult(result: PluginOutput[]): ActionVerbTask[] | null {
        const planOutput = result.find(r => r.name === 'plan');
        const answerOutput = result.find(r => r.name === 'answer');

        if (planOutput && planOutput.result && Array.isArray(planOutput.result)) {
            return planOutput.result as ActionVerbTask[];
        }

        if (answerOutput && answerOutput.result) {
            try {
                const parsedResult = typeof answerOutput.result === 'string' ? JSON.parse(answerOutput.result) : answerOutput.result;
                if (Array.isArray(parsedResult)) {
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
            this.say('Reflection did not provide a clear plan or answer. Continuing with the current plan.');
        }
    }

    private async executeStep(step: Step): Promise<void> {
        try {
            if (this.status !== AgentStatus.RUNNING) return;

            // Consolidate all input preparation into one method call.
            step.inputValues = await step.dereferenceInputsForExecution(this.steps, this.missionId);
            this.say(`Executing step: ${step.actionVerb} - ${step.description || 'No description'}`);

            const result = await step.execute(
                this.executeActionWithCapabilitiesManager.bind(this),
                this.useBrainForReasoning.bind(this),
                this.createSubAgent.bind(this),
                this.handleAskStep.bind(this),
                this.steps,
                this
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

                    // Save work product before returning to ensure deliverables are reported
                    await this.saveWorkProductWithClassification(step, mappedResult);

                    // Add the new steps from the plan (the workstream)
                    const workstreamStartIndex = this.steps.length;
                    this.addStepsFromPlan(actualPlanArray, step);
                    const workstreamSteps = this.steps.slice(workstreamStartIndex);

                    // Rewire dependencies: steps that depended on the REPLACED step should now depend on the workstream endpoints
                    this.rewireDependenciesForReplacedStep(step, workstreamSteps);

                    // Mark the replaced step as REPLACED (not COMPLETED) so it doesn't appear as an endpoint
                    // The workstream final steps will be the actual endpoints
                    step.status = StepStatus.REPLACED;
                    step.result = mappedResult; // Ensure result is set

                    await this.updateStatus();
                    // After adding new steps from a PLAN result, we should also return
                    // to allow the main loop to re-evaluate.
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
            //console.debug(`[Agent ${this.id}] runAgent: Pending steps: ${pendingSteps.map(s => `${s.id} (${s.actionVerb}, ${s.status})`).join(', ') || 'None'}`);

            const executableSteps: Step[] = [];
            for (const step of pendingSteps) {
                if (await step.areDependenciesSatisfied(this.steps)) {
                    executableSteps.push(step);
                }
            }
            console.debug(`[Agent ${this.id}] runAgent: Executable steps: ${executableSteps.map(s => `${s.id} (${s.actionVerb}, ${s.status})`).join(', ') || 'None'}`);

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
                        //console.log(`[Agent ${this.id}] Found ${steps.length} steps to delegate to role: ${role}`);
                        const recipientId = await this._getOrCreateSpecializedAgent(role);
                        if (recipientId) {
                            for (const step of steps) {
                                // Pass recipientId to avoid re-finding the agent for each step in the batch
                                const migrationResult = await this.migrateStepToSpecializedAgent(step, recipientId);
                                if (migrationResult.success) {
                                    // Remove the migrated step from the current agent's steps
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

                // Create local execution promises
                if (stepsToExecuteLocally.length > 0) {
                    const localExecutionPromises = stepsToExecuteLocally.map(step => this.executeStep(step));
                    allPromises.push(...localExecutionPromises);
                }
                
                await Promise.all(allPromises);

            } else if (pendingSteps.length > 0) {
                // Deadlock detection
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

    private addStepsFromPlan(plan: ActionVerbTask[], parentStep: Step) {
        console.log(`[Agent ${this.id}] DEBUG: Agent.addStepsFromPlan: Received plan with ${plan.length} steps.`);
        const newSteps = createFromPlan(plan, this.agentPersistenceManager, this.crossAgentResolver, parentStep, this);
        this.steps.push(...newSteps);
        console.log(`[Agent ${this.id}] DEBUG: Agent.addStepsFromPlan: this.steps now contains ${this.steps.length} steps.`);
        for (const step of newSteps) {
            this.agentSet.registerStepLocation(step.id, this.id, this.agentSet.url);
        }
    }

    /**
     * Rewire dependencies when a step is replaced by a workstream.
     * Steps that depended on the replaced step should now depend on the final step(s) of the workstream.
     *
     * @param replacedStep - The step that was replaced (now marked as REPLACED)
     * @param workstreamSteps - The new steps that form the workstream
     */
    private rewireDependenciesForReplacedStep(replacedStep: Step, workstreamSteps: Step[]): void {
        if (workstreamSteps.length === 0) {
            console.warn(`[Agent ${this.id}] rewireDependenciesForReplacedStep: No workstream steps provided for replaced step ${replacedStep.id}`);
            return;
        }
    
        // Identify the final step(s) of the workstream (steps that have no dependents within the workstream)
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
    
        // Get all steps for this mission from all agents in the agent set
        const allMissionSteps: Step[] = [];
        for (const agent of this.agentSet.agents.values()) {
            if (agent.missionId === this.missionId) {
                allMissionSteps.push(...agent.getSteps());
            }
        }

        // Find all steps across the entire mission that depend on the replaced step
        const dependentSteps = allMissionSteps.filter(step =>
            step.dependencies.some(dep => dep.sourceStepId === replacedStep.id)
        );
    
        console.log(`[Agent ${this.id}] rewireDependenciesForReplacedStep: Found ${dependentSteps.length} mission-wide step(s) that depend on replaced step ${replacedStep.id}`);
    
        // For each dependent step, rewire its dependencies
        for (const dependentStep of dependentSteps) {
            console.log(`[Agent ${this.id}] rewireDependenciesForReplacedStep: Rewiring dependencies for step ${dependentStep.id} (${dependentStep.actionVerb})`);
    
            const depsOnReplacedStep = dependentStep.dependencies.filter(dep => dep.sourceStepId === replacedStep.id);
    
            for (const dep of depsOnReplacedStep) {
                // Remove the old dependency
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

            const modelName = inputs.get('modelName')?.value;
            const optimization = inputs.get('optimization')?.value;
            const file = inputs.get('file')?.value;
            const audio = inputs.get('audio')?.value;
            const video = inputs.get('video')?.value;
            const image = inputs.get('image')?.value;
            const conversationType = inputs.get('conversationType')?.value as LLMConversationType || LLMConversationType.TextToText;

            brainRequestBody = {
                type: conversationType,
                prompt: enrichedPrompt,
                modelName: modelName,
                optimization: optimization,
                file: file,
                audio: audio,
                video: video,
                image: image,
                trace_id: this.id,
                contentType: this.getMimeTypeFromConversationType(conversationType), // Added contentType
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
                inputs: {
                    prompt: {
                        value: `Verify the following fact: "${brainResponse}". Provide the verified fact and indicate if it is correct.`
                    }
                },
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
                inputs: {
                    prompt: {
                        value: `Re-evaluating the original prompt with a verified fact.`
                    }
                },
                outputs:  new Map<string, PluginParameterType>([
                    ['final_answer', PluginParameterType.STRING]
                ])
            };

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

                // Create an AbortController for this execution so we can cancel when pausing/aborting
                // NOTE: We do NOT abort existing controllers here because the agent may be executing
                // multiple steps concurrently. Only pause/abort should trigger controller abortion.
                if (!this.executionAbortController) {
                    this.executionAbortController = new AbortController();
                }
                const signal = this.executionAbortController.signal;

                const response = await this.authenticatedApi.post(
                    `http://${this.capabilitiesManagerUrl}/executeAction`,
                    payload,
                    { timeout, signal }
                );

                return response.data;
            } catch (error) {
                // If the request was aborted due to pause/abort, handle gracefully
                const isAbort = (error && ((error as any).name === 'AbortError' || (error as any).code === 'ERR_CANCELED' || (error as any).message?.toLowerCase?.().includes('canceled')));
                if (isAbort) {
                    console.log(`[Agent ${this.id}] Execution aborted due to pause/abort. Marking step ${step.id} as PENDING for later retry.`);
                    // Reset controller
                    try { this.executionAbortController = null; } catch {}
                    step.status = StepStatus.PENDING;
                    // Return an error-style plugin output to indicate the step didn't complete
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
    
    private async handleStepSuccess(step: Step, result: PluginOutput[]) {
        step.status = StepStatus.COMPLETED;
        step.result = result;
        await this.saveWorkProductWithClassification(step, result);
        await this.logEvent({
            eventType: 'step_completed',
            agentId: this.id,
            stepId: step.id,
            result: result,
            timestamp: new Date().toISOString()
        });

        // If this step was delegated to us, notify the original owner
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

        // If this step was delegated to us, notify the original owner
        await this.notifyStepCompletion(step);

        await this.updateStatus();
    }



    /**
     * Notify the original owner agent when a delegated step completes or fails.
     * This allows the delegating agent to remove the step from its tracking list.
     */
    private async notifyStepCompletion(step: Step): Promise<void> {
        // Check if this step was delegated to us (ownerAgentId != current agent id)
        if (step.ownerAgentId && step.ownerAgentId !== this.id) {
            try {
                const ownerAgent = this.agentSet.agents.get(step.ownerAgentId);
                if (ownerAgent) {
                    // Owner is on the same AgentSet, call directly
                    ownerAgent.handleDelegatedStepCompletion(step.id, step.status);
                    console.log(`[Agent ${this.id}] Notified owner agent ${step.ownerAgentId} about completion of delegated step ${step.id} (${step.status})`);
                } else {
                    // Owner might be on a different AgentSet, send HTTP notification
                    // For now, we'll skip remote notifications as all agents are on the same AgentSet
                    console.warn(`[Agent ${this.id}] Owner agent ${step.ownerAgentId} not found for delegated step ${step.id}`);
                }
            } catch (error) {
                console.error(`[Agent ${this.id}] Error notifying owner agent about step completion:`, error);
            }
        }
    }

    /**
     * Handle notification that a delegated step has completed or failed.
     * Remove it from the delegatedStepIds tracking set.
     */
    public handleDelegatedStepCompletion(stepId: string, status: StepStatus): void {
        if (this.delegatedStepIds.has(stepId)) {
            this.delegatedStepIds.delete(stepId);
            console.log(`[Agent ${this.id}] Removed delegated step ${stepId} from tracking (status: ${status})`);
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
        // Abort any in-flight external requests
        try {
            if (this.executionAbortController) {
                this.executionAbortController.abort();
                this.executionAbortController = null;
                console.log(`Agent ${this.id} aborted in-flight execution due to pause.`);
            }
        } catch (e) {
            // ignore
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
        // Abort any in-flight external requests
        try {
            if (this.executionAbortController) {
                this.executionAbortController.abort();
                this.executionAbortController = null;
                console.log(`Agent ${this.id} aborted in-flight execution due to abort request.`);
            }
        } catch (e) {
            // ignore
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

        const stepStats = this.steps.map((step) => {
            const stepJson = step.toJSON();
            return {
                ...stepJson,
                verb: stepJson.actionVerb,
                dependencies: step.dependencies.map(dep => dep.sourceStepId),
            };
        });

        const lastStepActionVerb = this.steps.length > 0
            ? this.steps[this.steps.length - 1]?.actionVerb || 'Unknown'
            : 'Unknown';

        const statistics: AgentStatistics = {
            id: this.id,
            status: this.status,
            taskCount: this.steps.length,
            currentTaskNo: this.steps.filter(s => s.status === StepStatus.COMPLETED).length,
            currentTaskVerb: lastStepActionVerb,
            steps: stepStats,
            color: this.getAgentColor()
        };

        return statistics;
    }

    public getAgentColor(): string {
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

    public toAgentState(): any {
        return {
            id: this.id,
            status: this.status,
            output: this.output,
            inputs: this.inputValues,
            missionId: this.missionId,
            steps: this.steps.map(step => step.toJSON()), // Use toJSON for serializable steps
            dependencies: this.dependencies,
            capabilitiesManagerUrl: this.capabilitiesManagerUrl,
            brainUrl: this.brainUrl,
            trafficManagerUrl: this.trafficManagerUrl,
            librarianUrl: this.librarianUrl,
            conversation: this.conversation,
            missionContext: this.missionContext,
            role: this.role,
            roleCustomizations: this.roleCustomizations,
            lastFailedStep: this.lastFailedStep ? this.lastFailedStep.toJSON() : null,
        };
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

    private getMimeTypeFromConversationType(conversationType: LLMConversationType): string {
        switch (conversationType) {
            case LLMConversationType.TextToText:
                return 'text/plain';
            case LLMConversationType.TextToCode:
                return 'application/json'; // Often code is generated as structured JSON
            case LLMConversationType.TextToImage:
                return 'image/png'; // Common output for image generation
            case LLMConversationType.TextToAudio:
                return 'audio/mpeg'; // Common output for audio generation (e.g., MP3)
            case LLMConversationType.TextToVideo:
                return 'video/mp4'; // Common output for video generation (e.g., MP4)
            default:
                return 'text/plain';
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

    private async migrateStepToSpecializedAgent(step: Step, recipientId?: string): Promise<{ success: boolean, result: any }> {
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
                    step.delegatedToAgentId = finalRecipientId; // Set the delegated agent ID on the step
                    this.delegatedStepIds.add(step.id); // Track the delegated step ID

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
            this.steps,
            this,
        );

        if (wait) {
            // If waiting, we need to poll until the final context is available
            // This is a simplified example; a more robust solution would use events or a better polling mechanism
            return new Promise((resolve, reject) => {
                const checkCompletion = async () => {
                    try {
                        const response = await this.authenticatedApi.get(`http://${this.trafficManagerUrl}/mission/${this.missionId}/context`);
                        if (response.data && response.data.status === 'COMPLETED') {
                            resolve(response.data);
                        } else {
                            setTimeout(checkCompletion, 2000); // Check again in 2 seconds
                        }
                    } catch (error) {
                        reject(error);
                    }
                };
                checkCompletion();
            });
        }

        return result;
    }
}