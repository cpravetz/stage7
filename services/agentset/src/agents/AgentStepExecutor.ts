import { Step, StepStatus } from './Step';
import { PluginOutput, PluginParameterType, InputValue, BaseEntity } from '@cktmcs/shared';
import { AgentErrorRecovery } from './AgentErrorRecovery';
import { AgentWorkProductManager } from './AgentWorkProductManager';
import { classifyStepError, StepErrorType } from '../utils/ErrorClassifier';

/**
 * Handles step execution, dependency resolution, and step management for agents
 */
export class AgentStepExecutor {
    private agentId: string;
    private missionId: string;
    private baseEntity: BaseEntity;
    private errorRecovery: AgentErrorRecovery;
    private workProductManager: AgentWorkProductManager;
    private waitingSteps: Map<string, string> = new Map();

    constructor(
        agentId: string, 
        missionId: string, 
        baseEntity: BaseEntity, 
        errorRecovery: AgentErrorRecovery,
        workProductManager: AgentWorkProductManager
    ) {
        this.agentId = agentId;
        this.missionId = missionId;
        this.baseEntity = baseEntity;
        this.errorRecovery = errorRecovery;
        this.workProductManager = workProductManager;
    }

    /**
     * Executes a single step
     */
    async executeStep(step: Step, allSteps: Step[]): Promise<void> {
        if (step.status !== StepStatus.PENDING) {
            console.log(`Step ${step.id} is not pending, skipping execution.`);
            return;
        }

        step.status = StepStatus.RUNNING;
        console.log(`[AgentStepExecutor ${this.agentId}] Executing step: ${step.actionVerb} (${step.id})`);

        try {
            const result = await this.performStepExecution(step);
            
            if (result && result.length > 0 && result[0].name === 'pending_user_input') {
                const requestId = (result[0] as any).request_id;
                if (requestId) {
                    step.status = StepStatus.WAITING;
                    this.waitingSteps.set(requestId, step.id);
                    
                    // Notify MissionControl about the pending user input
                    await this.notifyMissionControlPendingInput(requestId, step.id);
                    return;
                }
            }

            step.result = result;
            await this.handleStepSuccess(step, result, allSteps);

        } catch (error) {
            console.error(`[AgentStepExecutor ${this.agentId}] Step ${step.actionVerb} failed:`, error);
            step.lastError = error as Error;
            await this.handleStepFailure(step, error as Error, allSteps);
        }
    }

    /**
     * Handles successful step completion
     */
    async handleStepSuccess(step: Step, result: PluginOutput[], allSteps: Step[]): Promise<void> {
        step.status = StepStatus.COMPLETED;
        const isAgentEndpoint = step.isEndpoint(allSteps);
        await this.workProductManager.saveWorkProductWithClassification(step.id, result, isAgentEndpoint, allSteps);
    }

    /**
     * Handles step failure with intelligent recovery
     */
    async handleStepFailure(step: Step, error: Error, allSteps: Step[]): Promise<void> {
        const errorType = classifyStepError(error);

        // New logic to handle specific error types from CapabilitiesManager
        if (error.name === 'StepInputError') {
            step.status = StepStatus.ERROR;
            console.log(`[AgentStepExecutor ${this.agentId}] Step ${step.actionVerb} failed due to invalid input data. The step will be skipped.`);
            return;
        }

        if (error.name === 'PluginExecutionError' && step.retryCount < step.maxRetries) {
            step.retryCount++;
            step.status = StepStatus.PENDING;
            console.log(`[AgentStepExecutor ${this.agentId}] Step ${step.actionVerb} failed during execution. Retrying...`);
            return;
        }

        // Handle different error types with appropriate recovery strategies
        if (errorType === StepErrorType.TRANSIENT && step.retryCount < step.maxRetries) {
            step.retryCount++;
            step.status = StepStatus.PENDING;
            console.log(`[AgentStepExecutor ${this.agentId}] Retrying transient error for step ${step.actionVerb} (attempt ${step.retryCount})`);
        } else if (errorType === StepErrorType.RECOVERABLE) {
            // Try intelligent recovery before replanning
            const recovered = await this.errorRecovery.attemptIntelligentRecovery(step, error, allSteps);
            if (!recovered) {
                step.status = StepStatus.ERROR;
                console.log(`[AgentStepExecutor ${this.agentId}] Step ${step.actionVerb} failed but may be recoverable.`);
            }
        } else if (errorType === StepErrorType.USER_INPUT_NEEDED) {
            // Handle cases where user input is needed
            await this.errorRecovery.handleUserInputNeeded(step, error);
        } else if (errorType === StepErrorType.VALIDATION) {
            // Try to fix validation errors automatically
            const fixed = await this.errorRecovery.attemptValidationFix(step, error);
            if (!fixed) {
                step.status = StepStatus.ERROR;
                console.log(`[AgentStepExecutor ${this.agentId}] Step ${step.actionVerb} failed validation.`);
            }
        } else {
            // Permanent errors or exceeded retry limit
            step.status = StepStatus.ERROR;
            console.log(`[AgentStepExecutor ${this.agentId}] Step ${step.actionVerb} failed permanently: ${error.message}`);
        }
    }

    /**
     * Check for steps that were waiting and can now proceed after dependencies are satisfied
     */
    async checkAndResumeWaitingSteps(allSteps: Step[]): Promise<void> {
        try {
            // Find steps that are waiting but might now have their dependencies satisfied
            const waitingSteps = allSteps.filter(step => 
                step.status === StepStatus.WAITING || step.status === StepStatus.PENDING
            );

            let resumedAny = false;
            for (const step of waitingSteps) {
                // Check if this step was waiting for dependencies that are now satisfied
                if (step.status === StepStatus.WAITING && step.areDependenciesSatisfied(allSteps)) {
                    console.log(`[AgentStepExecutor ${this.agentId}] Resuming step ${step.id} (${step.actionVerb}) - dependencies now satisfied`);
                    step.status = StepStatus.PENDING;
                    resumedAny = true;
                }
            }

            // If we resumed any steps, log it
            if (resumedAny) {
                console.log(`[AgentStepExecutor ${this.agentId}] Resumed waiting steps after dependency resolution`);
            }

        } catch (error) {
            console.error(`[AgentStepExecutor ${this.agentId}] Error checking and resuming waiting steps:`, error);
        }
    }

    /**
     * Handles user input response for waiting steps
     */
    async handleUserInputResponse(requestId: string, answer: string, allSteps: Step[]): Promise<boolean> {
        const waitingStepId = this.waitingSteps.get(requestId);
        if (waitingStepId) {
            const step = allSteps.find(s => s.id === waitingStepId);
            if (step) {
                const outputName = step.outputs?.keys().next().value || 'answer';
                step.result = [{
                    success: true,
                    name: outputName,
                    resultType: PluginParameterType.STRING,
                    result: answer,
                    resultDescription: 'User response'
                }];
                step.status = StepStatus.COMPLETED;
                this.waitingSteps.delete(requestId);
                
                // Save work product for the completed step
                await this.handleStepSuccess(step, step.result, allSteps);
                
                // Explicitly check for newly executable steps after user input
                await this.checkAndResumeWaitingSteps(allSteps);
                
                return true;
            }
        }
        return false;
    }

    /**
     * Gets executable steps (pending steps with satisfied dependencies)
     */
    getExecutableSteps(allSteps: Step[]): Step[] {
        const pendingSteps = allSteps.filter(step => step.status === StepStatus.PENDING);
        return pendingSteps.filter(step => step.areDependenciesSatisfied(allSteps));
    }

    /**
     * Checks if there are any pending steps
     */
    hasPendingSteps(allSteps: Step[]): boolean {
        return allSteps.some(step => step.status === StepStatus.PENDING);
    }

    /**
     * Cancels steps with permanently unsatisfied dependencies
     */
    cancelUnsatisfiedSteps(allSteps: Step[]): void {
        const pendingSteps = allSteps.filter(step => step.status === StepStatus.PENDING);
        
        for (const step of pendingSteps) {
            if (step.areDependenciesPermanentlyUnsatisfied(allSteps)) {
                step.status = StepStatus.CANCELLED;
                console.log(`[AgentStepExecutor ${this.agentId}] Cancelling step ${step.id} due to permanently unsatisfied dependencies.`);
            }
        }
    }

    private async performStepExecution(step: Step): Promise<PluginOutput[]> {
        // Get the capabilities manager URL
        const capabilitiesManagerUrl = await this.baseEntity.getServiceUrl('CapabilitiesManager');
        if (!capabilitiesManagerUrl) {
            throw new Error('CapabilitiesManager service not available');
        }

        // Prepare the execution request
        const executionRequest = {
            actionVerb: step.actionVerb,
            inputs: this.convertInputValuesToRequest(step.inputValues),
            stepId: step.id,
            agentId: this.agentId,
            missionId: this.missionId
        };

        // Execute the step via CapabilitiesManager
        const response = await this.baseEntity.authenticatedApi.post(
            `http://${capabilitiesManagerUrl}/executePlugin`,
            executionRequest
        );

        if (!response.data || !response.data.success) {
            throw new Error(response.data?.error || 'Plugin execution failed');
        }

        return response.data.result || [];
    }

    private convertInputValuesToRequest(inputValues: Map<string, InputValue> | undefined): Record<string, any> {
        if (!inputValues) return {};

        const inputs: Record<string, any> = {};
        for (const [key, value] of inputValues.entries()) {
            inputs[key] = value.value;
        }
        return inputs;
    }

    private async notifyMissionControlPendingInput(requestId: string, stepId: string): Promise<void> {
        try {
            const missionControlUrl = await this.baseEntity.getServiceUrl('MissionControl');
            if (missionControlUrl) {
                await this.baseEntity.authenticatedApi.post(`http://${missionControlUrl}/registerPendingUserInput`, {
                    requestId: requestId,
                    missionId: this.missionId,
                    stepId: stepId,
                    agentId: this.agentId
                });
                console.log(`[AgentStepExecutor ${this.agentId}] Notified MissionControl about pending user input: ${requestId}`);
            }
        } catch (error) {
            console.error(`[AgentStepExecutor ${this.agentId}] Failed to notify MissionControl about pending user input:`, error);
        }
    }
}
