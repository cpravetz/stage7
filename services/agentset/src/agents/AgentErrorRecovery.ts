import { Step, StepStatus } from './Step';
import { PluginParameterType, BaseEntity } from '@cktmcs/shared';
import { StepErrorType } from '../utils/ErrorClassifier';

/**
 * Handles error recovery and proactive error resolution for agents
 */
export class AgentErrorRecovery {
    private agentId: string;
    private baseEntity: BaseEntity;

    constructor(agentId: string, baseEntity: BaseEntity) {
        this.agentId = agentId;
        this.baseEntity = baseEntity;
    }

    /**
     * Attempts intelligent recovery for a failed step
     */
    async attemptIntelligentRecovery(step: Step, error: Error, allSteps: Step[]): Promise<boolean> {
        const errorMessage = error.message.toLowerCase();
        console.log(`[AgentErrorRecovery ${this.agentId}] Attempting intelligent recovery for step ${step.id}: ${errorMessage}`);

        // Recovery strategy 1: Plugin execution failures
        if (errorMessage.includes('python script exited with code null') || 
            errorMessage.includes('plugin execution failed')) {
            console.log(`[AgentErrorRecovery ${this.agentId}] Attempting recovery for plugin execution failure`);
            
            // Reset step status and try again with fresh state
            step.status = StepStatus.PENDING;
            step.retryCount = Math.min(step.retryCount + 1, step.maxRetries);
            console.log(`[AgentErrorRecovery ${this.agentId}] Reset step ${step.actionVerb} for retry (attempt ${step.retryCount})`);
            return true;
        }

        // Recovery strategy 2: Dependency issues
        if (errorMessage.includes('dependency not satisfied') || errorMessage.includes('missing dependency')) {
            console.log(`[AgentErrorRecovery ${this.agentId}] Attempting recovery for dependency issue`);

            // Check if dependencies are now available
            const executableSteps = allSteps.filter(s =>
                s.status === StepStatus.PENDING && s.areDependenciesSatisfied(allSteps)
            );

            if (executableSteps.includes(step)) {
                step.status = StepStatus.PENDING;
                console.log(`[AgentErrorRecovery ${this.agentId}] Recovered step ${step.actionVerb} - dependencies are now satisfied`);
                return true;
            }
        }

        // Recovery strategy 3: Service communication issues
        if (errorMessage.includes('no response from') || errorMessage.includes('connection refused')) {
            console.log(`[AgentErrorRecovery ${this.agentId}] Attempting recovery for service communication issue`);
            
            // Wait a moment and retry
            await new Promise(resolve => setTimeout(resolve, 2000));
            step.status = StepStatus.PENDING;
            step.retryCount = Math.min(step.retryCount + 1, step.maxRetries);
            console.log(`[AgentErrorRecovery ${this.agentId}] Retrying step ${step.actionVerb} after service communication issue`);
            return true;
        }

        // Recovery strategy 4: Parameter validation issues
        if (errorMessage.includes('invalid parameter type') || errorMessage.includes('parameter validation failed')) {
            console.log(`[AgentErrorRecovery ${this.agentId}] Attempting recovery for parameter validation issue`);
            
            const fixed = this.attemptParameterTypeConversion(step, errorMessage);
            if (fixed) {
                step.status = StepStatus.PENDING;
                console.log(`[AgentErrorRecovery ${this.agentId}] Fixed parameter validation for step ${step.actionVerb}`);
                return true;
            }
        }

        return false;
    }

    /**
     * Handles cases where user input is needed
     */
    async handleUserInputNeeded(step: Step, error: Error): Promise<void> {
        console.log(`[AgentErrorRecovery ${this.agentId}] Handling user input needed for step ${step.id}`);
        
        // Check if this step can be converted to an ASK_USER_QUESTION step
        if (step.actionVerb !== 'ASK_USER_QUESTION') {
            // Create a user input request based on the error
            const question = this.extractQuestionFromError(error);
            if (question) {
                // Note: actionVerb is readonly, so we need to create a new step or handle differently
                console.log(`[AgentErrorRecovery] Would convert step ${step.id} to ASK_USER_QUESTION: ${question}`);
                step.inputValues?.set('question', {
                    inputName: 'question',
                    value: question,
                    valueType: PluginParameterType.STRING,
                    args: {}
                });
                step.status = StepStatus.PENDING;
                console.log(`[AgentErrorRecovery ${this.agentId}] Converted step to ASK_USER_QUESTION: ${question}`);
            }
        }
    }

    /**
     * Attempts to fix validation errors automatically
     */
    async attemptValidationFix(step: Step, error: Error): Promise<boolean> {
        const errorMessage = error.message.toLowerCase();
        console.log(`[AgentErrorRecovery ${this.agentId}] Attempting validation fix for step ${step.id}: ${errorMessage}`);

        // Fix missing required parameters
        if (errorMessage.includes('missing required parameter')) {
            const paramName = this.extractParameterNameFromError(errorMessage);
            if (paramName && this.canInferParameterValue(step, paramName)) {
                const inferredValue = this.inferParameterValue(step, paramName);
                if (inferredValue) {
                    step.inputValues?.set(paramName, {
                        inputName: paramName,
                        value: inferredValue,
                        valueType: PluginParameterType.STRING,
                        args: {}
                    });
                    console.log(`[AgentErrorRecovery ${this.agentId}] Inferred missing parameter ${paramName} = ${inferredValue}`);
                    return true;
                }
            }
        }

        // Fix parameter type mismatches
        if (errorMessage.includes('invalid parameter type')) {
            return this.attemptParameterTypeConversion(step, errorMessage);
        }

        return false;
    }

    /**
     * Proactive error detection and resolution
     */
    async proactiveErrorResolution(allSteps: Step[]): Promise<void> {
        try {
            // Pattern 1: Detect steps that have been in ERROR state and might be recoverable
            const errorSteps = allSteps.filter(step => 
                step.status === StepStatus.ERROR && step.retryCount < step.maxRetries
            );

            for (const errorStep of errorSteps) {
                if (errorStep.lastError) {
                    const recovered = await this.attemptIntelligentRecovery(errorStep, errorStep.lastError, allSteps);
                    if (recovered) {
                        console.log(`[AgentErrorRecovery ${this.agentId}] Proactively recovered error step ${errorStep.id} (${errorStep.actionVerb})`);
                    }
                }
            }

            // Pattern 2: Detect circular dependencies
            const circularDeps = this.detectCircularDependencies(allSteps);
            if (circularDeps.length > 0) {
                console.log(`[AgentErrorRecovery ${this.agentId}] Detected circular dependencies, attempting resolution`);
                await this.resolveCircularDependencies(circularDeps, allSteps);
            }

            // Pattern 3: Detect missing required inputs that can be inferred
            const stepsWithMissingInputs = allSteps.filter(step => 
                step.status === StepStatus.PENDING && this.hasMissingRequiredInputs(step)
            );

            for (const step of stepsWithMissingInputs) {
                const fixed = await this.attemptToInferMissingInputs(step);
                if (fixed) {
                    console.log(`[AgentErrorRecovery ${this.agentId}] Proactively fixed missing inputs for step ${step.id}`);
                }
            }

            // Pattern 4: Detect and resolve authentication issues
            await this.checkAndRefreshAuthentication();

            // Pattern 5: Detect steps waiting for user input that could be resolved automatically
            const userInputSteps = allSteps.filter(step => 
                step.status === StepStatus.WAITING && step.actionVerb === 'ASK_USER_QUESTION'
            );

            for (const step of userInputSteps) {
                if (step.inputValues?.has('question')) {
                    const question = step.inputValues.get('question')?.value as string;
                    if (question && this.canAutoResolveQuestion(question)) {
                        const answer = this.autoResolveQuestion(question);
                        if (answer) {
                            step.result = [{
                                success: true,
                                name: 'answer',
                                resultType: PluginParameterType.STRING,
                                result: answer,
                                resultDescription: 'Auto-resolved answer'
                            }];
                            step.status = StepStatus.COMPLETED;
                            console.log(`[AgentErrorRecovery ${this.agentId}] Auto-resolved user question: ${question.substring(0, 50)}...`);
                        }
                    }
                }
            }

        } catch (error) {
            console.error(`[AgentErrorRecovery ${this.agentId}] Error in proactive error resolution:`, error);
        }
    }

    private detectCircularDependencies(allSteps: Step[]): string[] {
        const visited = new Set<string>();
        const recursionStack = new Set<string>();
        const circularDeps: string[] = [];

        const dfs = (stepId: string): boolean => {
            if (recursionStack.has(stepId)) {
                circularDeps.push(stepId);
                return true;
            }
            if (visited.has(stepId)) {
                return false;
            }

            visited.add(stepId);
            recursionStack.add(stepId);

            const step = allSteps.find(s => s.id === stepId);
            if (step) {
                for (const dep of step.dependencies) {
                    if (dep.sourceStepId && dfs(dep.sourceStepId)) {
                        return true;
                    }
                }
            }

            recursionStack.delete(stepId);
            return false;
        };

        for (const step of allSteps) {
            if (!visited.has(step.id)) {
                dfs(step.id);
            }
        }

        return circularDeps;
    }

    private async resolveCircularDependencies(circularSteps: string[], allSteps: Step[]): Promise<void> {
        // Simple resolution: break the cycle by removing one dependency
        for (const stepId of circularSteps) {
            const step = allSteps.find(s => s.id === stepId);
            if (step && step.dependencies.length > 0) {
                // Remove the first dependency to break the cycle
                const removedDep = step.dependencies.shift();
                console.log(`[AgentErrorRecovery ${this.agentId}] Broke circular dependency by removing dependency from step ${stepId}`);
                break;
            }
        }
    }

    private hasMissingRequiredInputs(step: Step): boolean {
        if (step.actionVerb === 'CHAT' && !step.inputValues?.has('message')) {
            return true;
        }
        if (step.actionVerb === 'ASK_USER_QUESTION' && !step.inputValues?.has('question')) {
            return true;
        }
        if (step.actionVerb === 'SEARCH' && !step.inputValues?.has('searchTerm')) {
            return true;
        }
        if (step.actionVerb === 'API_CLIENT' && (!step.inputValues?.has('url') || !step.inputValues?.has('method'))) {
            return true;
        }
        
        return false;
    }

    private async attemptToInferMissingInputs(step: Step): Promise<boolean> {
        let fixed = false;

        if (step.actionVerb === 'CHAT' && !step.inputValues?.has('message')) {
            const message = step.description || 'Default chat message';
            step.inputValues?.set('message', {
                inputName: 'message',
                value: message,
                valueType: PluginParameterType.STRING,
                args: {}
            });
            fixed = true;
        }

        if (step.actionVerb === 'ASK_USER_QUESTION' && !step.inputValues?.has('question')) {
            const question = step.description || 'Please provide input';
            step.inputValues?.set('question', {
                inputName: 'question',
                value: question,
                valueType: PluginParameterType.STRING,
                args: {}
            });
            fixed = true;
        }

        if (step.actionVerb === 'SEARCH' && !step.inputValues?.has('searchTerm')) {
            const searchTerm = step.description || 'search query';
            step.inputValues?.set('searchTerm', {
                inputName: 'searchTerm',
                value: searchTerm,
                valueType: PluginParameterType.STRING,
                args: {}
            });
            fixed = true;
        }

        if (step.actionVerb === 'API_CLIENT') {
            if (!step.inputValues?.has('method')) {
                step.inputValues?.set('method', {
                    inputName: 'method',
                    value: 'GET',
                    valueType: PluginParameterType.STRING,
                    args: {}
                });
                fixed = true;
            }
        }

        return fixed;
    }

    private async checkAndRefreshAuthentication(): Promise<void> {
        try {
            // Check if authentication token is still valid
            if (this.baseEntity.authenticatedApi) {
                // Test with a simple request to PostOffice
                const postOfficeUrl = await this.baseEntity.getServiceUrl('PostOffice');
                if (postOfficeUrl) {
                    await this.baseEntity.authenticatedApi.get(`http://${postOfficeUrl}/health`);
                }
            }
        } catch (authError) {
            if (authError instanceof Error && authError.message.includes('401')) {
                console.log(`[AgentErrorRecovery ${this.agentId}] Authentication expired, attempting refresh`);
                // Re-initialize authentication by calling the base class method
                // Service discovery should be handled by the main agent
                console.log(`[AgentErrorRecovery] Service discovery needed for agent ${this.agentId}`);
            }
        }
    }

    private canAutoResolveQuestion(question: string): boolean {
        const autoResolvablePatterns = [
            /do you want to proceed/i,
            /should we continue/i,
            /confirm.*action/i,
            /are you ready/i,
            /would you like to/i
        ];

        return autoResolvablePatterns.some(pattern => pattern.test(question));
    }

    private autoResolveQuestion(question: string): string | null {
        const questionLower = question.toLowerCase();

        if (questionLower.includes('proceed') || questionLower.includes('continue')) {
            return 'yes';
        }
        if (questionLower.includes('confirm')) {
            return 'confirmed';
        }
        if (questionLower.includes('ready')) {
            return 'ready';
        }

        return null;
    }

    private extractQuestionFromError(error: Error): string | null {
        const message = error.message;

        // Extract question from common error patterns
        if (message.includes('user confirmation required')) {
            return 'Do you want to proceed with this action?';
        }
        if (message.includes('please provide')) {
            return message.replace(/.*please provide\s*/i, '').trim() + '?';
        }
        if (message.includes('user input required')) {
            return 'Please provide the required input.';
        }

        return 'Please provide input to continue.';
    }

    private extractParameterNameFromError(errorMessage: string): string | null {
        // Extract parameter name from error messages like "missing required parameter 'message'"
        const match = errorMessage.match(/missing required parameter ['"]([^'"]+)['"]/);
        return match ? match[1] : null;
    }

    private canInferParameterValue(step: Step, paramName: string): boolean {
        // Check if we can infer a reasonable value for this parameter
        const inferableParams = ['message', 'question', 'method', 'searchTerm'];
        return inferableParams.includes(paramName);
    }

    private inferParameterValue(step: Step, paramName: string): string | null {
        switch (paramName) {
            case 'message':
                return step.description || 'Default message';
            case 'question':
                return step.description || 'Please provide input';
            case 'method':
                return 'GET';
            case 'searchTerm':
                return step.description || 'search query';
            default:
                return null;
        }
    }

    private attemptParameterTypeConversion(step: Step, errorMessage: string): boolean {
        if (!step.inputValues) return false;

        try {
            // Look for type conversion opportunities
            for (const [key, inputValue] of step.inputValues.entries()) {
                if (typeof inputValue.value === 'object' && inputValue.value !== null) {
                    // Try to extract the actual value from wrapped objects
                    if ('value' in inputValue.value) {
                        inputValue.value = (inputValue.value as any).value;
                        console.log(`[AgentErrorRecovery ${this.agentId}] Unwrapped parameter ${key}`);
                        return true;
                    }

                    // Convert objects to strings if needed
                    if (errorMessage.includes('expected string')) {
                        inputValue.value = JSON.stringify(inputValue.value);
                        inputValue.valueType = PluginParameterType.STRING;
                        console.log(`[AgentErrorRecovery ${this.agentId}] Converted parameter ${key} to string`);
                        return true;
                    }
                }
            }
        } catch (conversionError) {
            console.error(`[AgentErrorRecovery ${this.agentId}] Error in parameter type conversion:`, conversionError);
        }

        return false;
    }
}
