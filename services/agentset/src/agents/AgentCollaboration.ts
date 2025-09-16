import { Step, StepStatus } from './Step';
import { PluginOutput, PluginParameterType, InputValue, BaseEntity } from '@cktmcs/shared';
import { CollaborationMessageType, TaskDelegationRequest, TaskResult, KnowledgeSharing, ConflictResolutionResponse } from '../collaboration/CollaborationProtocol';

/**
 * Handles collaboration, delegation, and inter-agent communication
 */
export class AgentCollaboration {
    private agentId: string;
    private missionId: string;
    private baseEntity: BaseEntity;
    private delegatedSteps: Map<string, string> = new Map(); // Map<taskId, stepId>

    constructor(agentId: string, missionId: string, baseEntity: BaseEntity) {
        this.agentId = agentId;
        this.missionId = missionId;
        this.baseEntity = baseEntity;
    }

    /**
     * Delegates a step to another agent
     */
    async delegateStep(step: Step, targetAgentId: string): Promise<void> {
        const taskId = `${this.agentId}-${step.id}-${Date.now()}`;
        
        const delegationRequest: TaskDelegationRequest = {
            taskId: taskId,
            taskType: step.actionVerb,
            description: step.description || '',
            inputs: this.convertInputValuesToRecord(step.inputValues),
            priority: 'normal',
            deadline: new Date(Date.now() + 30 * 60 * 1000).toISOString()
        };

        // Send delegation request
        this.baseEntity.sendMessage(CollaborationMessageType.TASK_DELEGATION, targetAgentId, delegationRequest);
        
        // Track the delegated step
        this.delegatedSteps.set(taskId, step.id);
        step.status = StepStatus.DELEGATED;
        
        console.log(`[AgentCollaboration ${this.agentId}] Delegated step ${step.id} to agent ${targetAgentId} with task ID ${taskId}`);
    }

    /**
     * Handles task delegation requests from other agents
     */
    async handleTaskDelegation(request: TaskDelegationRequest, allSteps: Step[]): Promise<void> {
        console.log(`[AgentCollaboration ${this.agentId}] Received task delegation request for task ${request.taskId}`);

        // Check if we can accept the delegation
        if (this.canAcceptDelegation(request, allSteps)) {
            // Create a new step from the delegation request
            const delegatedStep = this.createStepFromDelegation(request);
            allSteps.push(delegatedStep);

            console.log(`[AgentCollaboration ${this.agentId}] Accepted delegation ${request.taskId}`);
        } else {
            console.log(`[AgentCollaboration ${this.agentId}] Rejected delegation ${request.taskId}`);
        }
    }

    /**
     * Handles task results from delegated steps
     */
    async handleTaskResult(taskResult: TaskResult, allSteps: Step[]): Promise<void> {
        const completedStepId = this.delegatedSteps.get(taskResult.taskId);
        if (completedStepId) {
            const step = allSteps.find(s => s.id === completedStepId);
            if (step) {
                console.log(`[AgentCollaboration ${this.agentId}] Received result for delegated step ${step.id}. Success: ${taskResult.success}`);
                step.status = taskResult.success ? StepStatus.COMPLETED : StepStatus.ERROR;
                if (taskResult.success && taskResult.result) {
                    step.result = taskResult.result;
                } else if (taskResult.error) {
                    step.lastError = new Error(taskResult.error);
                }
                this.delegatedSteps.delete(taskResult.taskId);
            }
        }
    }

    /**
     * Shares knowledge with other agents
     */
    async shareKnowledge(knowledge: any, targetAgents: string[] = []): Promise<void> {
        const knowledgeShare = {
            agentId: this.agentId,
            knowledge: knowledge,
            timestamp: new Date().toISOString()
        };

        if (targetAgents.length > 0) {
            // Share with specific agents
            for (const targetAgent of targetAgents) {
                this.baseEntity.sendMessage(CollaborationMessageType.KNOWLEDGE_SHARE, targetAgent, knowledgeShare);
            }
        } else {
            // Broadcast to all agents in mission
            this.baseEntity.sendMessage(CollaborationMessageType.KNOWLEDGE_SHARE, 'broadcast', knowledgeShare);
        }

        console.log(`[AgentCollaboration ${this.agentId}] Shared knowledge with ${targetAgents.length > 0 ? targetAgents.join(', ') : 'all agents'}`);
    }

    /**
     * Handles knowledge sharing from other agents
     */
    async handleKnowledgeShare(knowledgeShare: KnowledgeSharing, allSteps: Step[]): Promise<void> {
        console.log(`[AgentCollaboration ${this.agentId}] Received knowledge share from another agent`);

        // Process the shared knowledge
        const pendingSteps = allSteps.filter(step => step.status === StepStatus.PENDING);

        for (const step of pendingSteps) {
            if (this.canKnowledgeHelpStep(knowledgeShare, step)) {
                // Apply the knowledge to help with the step
                this.applyKnowledgeToStep(knowledgeShare, step);
                console.log(`[AgentCollaboration ${this.agentId}] Applied shared knowledge to step ${step.id}`);
            }
        }
    }

    /**
     * Handles conflict resolution responses
     */
    async handleConflictResolution(response: ConflictResolutionResponse): Promise<void> {
        console.log(`[AgentCollaboration ${this.agentId}] Received conflict resolution: ${response.resolution}`);

        // Apply the conflict resolution
        switch (response.resolution) {
            case 'prioritize_agent_1':
                // This agent has priority, continue with current plan
                break;
            case 'prioritize_agent_2':
                // Other agent has priority, defer or modify plan
                await this.deferToOtherAgent(response.conflictId);
                break;
            case 'merge_approaches':
                // Merge approaches with other agent
                await this.mergeWithOtherAgent(response.conflictId);
                break;
            case 'sequential_execution':
                // Execute sequentially
                await this.executeSequentially(response.conflictId);
                break;
        }
    }

    /**
     * Checks if agent can accept a delegation request
     */
    private canAcceptDelegation(request: TaskDelegationRequest, allSteps: Step[]): boolean {
        // Check current workload
        const activeSteps = allSteps.filter(step => 
            step.status === StepStatus.RUNNING || step.status === StepStatus.PENDING
        );

        // Don't accept if we have too many active steps
        if (activeSteps.length > 5) {
            return false;
        }

        // Check if we have the required capabilities
        // This could be expanded to check actual plugin availability
        const supportedVerbs = ['CHAT', 'SEARCH', 'API_CLIENT', 'ASK_USER_QUESTION', 'ACCOMPLISH'];
        if (!supportedVerbs.includes(request.taskType)) {
            return false;
        }

        return true;
    }

    /**
     * Creates a step from a delegation request
     */
    private createStepFromDelegation(request: TaskDelegationRequest): Step {
        const step = new Step({
            actionVerb: request.taskType,
            description: request.description,
            inputReferences: new Map(),
            inputValues: new Map(),
            missionId: this.missionId,
            stepNo: 1,
            persistenceManager: new (require('../utils/AgentPersistenceManager').AgentPersistenceManager)('temp')
        });

        // Convert inputs
        if (request.inputs) {
            for (const [key, value] of Object.entries(request.inputs)) {
                step.inputValues.set(key, {
                    inputName: key,
                    value: value,
                    valueType: 'string' as any,
                    args: {}
                });
            }
        }

        // Mark as delegated work
        step.isDelegated = true;
        step.delegationTaskId = request.taskId;

        return step;
    }

    private convertInputValuesToRecord(inputValues: Map<string, InputValue> | undefined): Record<string, any> {
        if (!inputValues) return {};
        const record: Record<string, any> = {};
        for (const [key, value] of inputValues.entries()) {
            record[key] = value.value;
        }
        return record;
    }

    private canKnowledgeHelpStep(knowledge: any, step: Step): boolean {
        // Simple heuristic: check if knowledge contains relevant information
        if (typeof knowledge === 'object' && knowledge.knowledge) {
            return true;
        }
        return false;
    }

    private applyKnowledgeToStep(knowledge: any, step: Step): void {
        // Apply shared knowledge to help with step execution
        if (knowledge.knowledge && !step.result) {
            // Use the shared knowledge if we don't have a result yet
            console.log(`[AgentCollaboration ${this.agentId}] Applied knowledge to step ${step.id}`);
        }
    }

    private async deferToOtherAgent(conflictId: string): Promise<void> {
        console.log(`[AgentCollaboration ${this.agentId}] Deferring to other agent for conflict ${conflictId}`);
        // Implementation would pause conflicting steps
    }

    private async mergeWithOtherAgent(conflictId: string): Promise<void> {
        console.log(`[AgentCollaboration ${this.agentId}] Merging approach with other agent for conflict ${conflictId}`);
        // Implementation would coordinate with other agent
    }

    private async executeSequentially(conflictId: string): Promise<void> {
        console.log(`[AgentCollaboration ${this.agentId}] Executing sequentially for conflict ${conflictId}`);
        // Implementation would wait for other agent to complete first
    }

    /**
     * Gets the number of delegated steps
     */
    getDelegatedStepsCount(): number {
        return this.delegatedSteps.size;
    }

    /**
     * Checks if a step is delegated
     */
    isStepDelegated(stepId: string): boolean {
        return Array.from(this.delegatedSteps.values()).includes(stepId);
    }
}
