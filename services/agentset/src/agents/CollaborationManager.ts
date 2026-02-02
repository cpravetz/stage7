import { Step, StepStatus } from './Step';
import { AgentSet } from '../AgentSet';
import { AgentStatus } from '../utils/agentStatus';
import { CrossAgentDependencyResolver } from '../utils/CrossAgentDependencyResolver';
import { CollaborationMessageType, ConflictResolutionResponse, KnowledgeSharing, TaskDelegationRequest, TaskDelegationResponse, TaskResult } from '../collaboration/CollaborationProtocol';
import { ConflictResolution } from '../collaboration/ConflictResolution';
import { TaskDelegation } from '../collaboration/TaskDelegation';
import { analyzeError } from '@cktmcs/errorhandler';
import { AgentPersistenceManager } from '../utils/AgentPersistenceManager';

/**
 * Interface for agent context needed by CollaborationManager
 */
export interface CollaborationAgentContext {
    id: string;
    missionId: string;
    brainUrl: string;
    steps: Step[];
    agentPersistenceManager: AgentPersistenceManager;
    authenticatedApi: any;
    delegatedStepIds: Set<string>;
    
    // Methods the agent must provide
    say: (message: string, isImportant?: boolean) => void;
    storeInContext: (key: string, value: any) => void;
}

export class CollaborationManager {
    private agent: CollaborationAgentContext;
    private agentSet: AgentSet;
    private crossAgentResolver: CrossAgentDependencyResolver;
    private conflictResolver: ConflictResolution;
    private taskDelegation: TaskDelegation;
    private agentSetUrl: string;

    constructor(agent: CollaborationAgentContext, agentSet: AgentSet, crossAgentResolver: CrossAgentDependencyResolver) {
        this.agent = agent;
        this.agentSet = agentSet;
        this.crossAgentResolver = crossAgentResolver;
        this.agentSetUrl = agentSet.url;
        this.conflictResolver = new ConflictResolution(this.agentSet.agents, this.agent.brainUrl);
        this.taskDelegation = new TaskDelegation(this.agentSet.agents, this.agentSet.ownershipTransferManager);
    }

    public async handleCollaborationMessage(message: any): Promise<void> {
        // Switch on message type and call the appropriate handler
        switch (message.type) {
            case CollaborationMessageType.KNOWLEDGE_SHARE:
                this.handleKnowledgeSharing(message.content as KnowledgeSharing);
                break;
            case CollaborationMessageType.CONFLICT_RESOLUTION:
                await this.handleConflictResolution(message.content as ConflictResolutionResponse);
                break;
            case CollaborationMessageType.TASK_DELEGATION:
                await this.handleTaskDelegation(message.content as TaskDelegationRequest);
                break;
            case CollaborationMessageType.TASK_RESULT:
                this.handleTaskResult(message.content as TaskResult);
                break;
            default:
                console.warn(`[Agent ${this.agent.id}] Unknown collaboration message type: ${message.type}`);
        }
    }

    private handleKnowledgeSharing(content: KnowledgeSharing): void {
        console.log(`[Agent ${this.agent.id}] Received knowledge sharing:`, content);
        // Add knowledge to agent's context or knowledge base
        this.agent.storeInContext(`knowledge_${content.topic}`, content.content);
    }

    private async handleConflictResolution(content: ConflictResolutionResponse): Promise<void> {
        console.log(`[Agent ${this.agent.id}] Received conflict resolution message:`, content);
        this.agent.say(`Conflict ${content.conflictId} has been resolved: ${content.explanation}`);
        // Apply the resolution
        this.agent.storeInContext(`conflict_resolution_${content.conflictId}`, content.resolution);
    }

    private async handleTaskDelegation(request: TaskDelegationRequest): Promise<void> {
        console.log(`[Agent ${this.agent.id}] Received task delegation request:`, request);
        // Logic to accept or reject the task
        const accept = true; // Simplified logic

        if (accept) {
            // Add the delegated step to the agent's steps
            // This is a simplified representation. In a real scenario, you'd create a new Step object
            // from the task details and add it to the agent's step list.
            const newStep = new Step({
                id: request.taskId,
                actionVerb: request.taskType,
                missionId: this.agent.missionId,
                ownerAgentId: this.agent.id,
                inputValues: new Map(Object.entries(request.inputs)),
                description: request.description,
                status: StepStatus.PENDING,
                dependencies: [],
                persistenceManager: this.agent.agentPersistenceManager,
                crossAgentResolver: this.crossAgentResolver
            });
            this.agent.steps.push(newStep);
            this.agent.say(`I have accepted the delegated task: ${request.description}`);
        } else {
            this.agent.say(`I have rejected the delegated task: ${request.description}`);
        }
    }

    private handleTaskResult(result: TaskResult): void {
        console.log(`[Agent ${this.agent.id}] Received task result:`, result);
        // Find the step that corresponds to the task and update its result
        const step = this.agent.steps.find(s => s.id === result.taskId);
        if (step) {
            step.result = result.result;
            step.status = result.success ? StepStatus.COMPLETED : StepStatus.ERROR;
        }
    }

    /**
     * Get or create a specialized agent for a given role
     */
    public async getOrCreateSpecializedAgent(roleId: string): Promise<string | null> {
        try {
            const response = await this.agent.authenticatedApi.post(`http://${this.agentSetUrl}/findAgentWithRole`, {
                roleId: roleId,
                missionId: this.agent.missionId
            });

            if (response.data && response.data.agentId && response.data.status !== AgentStatus.ERROR) {
                console.log(`Found active agent ${response.data.agentId} with role ${roleId}`);
                return response.data.agentId;
            } else {
                if (response.data && response.data.agentId) {
                    console.log(`Found agent ${response.data.agentId} with role ${roleId}, but it is in error state. Creating a new one.`);
                }
                console.log(`No active agent found with role ${roleId}, creating a new one.`);
                const createAgentResponse = await this.agent.authenticatedApi.post(`http://${this.agentSetUrl}/createSpecializedAgent`, {
                    roleId: roleId,
                    missionId: this.agent.missionId
                });

                if (createAgentResponse.data && createAgentResponse.data.agentId) {
                    const newAgentId = createAgentResponse.data.agentId;
                    console.log(`Created new agent ${newAgentId} with role ${roleId}. Awaiting its initialization.`);
                    
                    // Poll AgentSet to check if the new agent is initialized
                    let initialized = false;
                    let attempts = 0;
                    const maxAttempts = 30;
                    
                    while (!initialized && attempts < maxAttempts) {
                        const agentStatusResponse = await this.agent.authenticatedApi.get(`http://${this.agentSetUrl}/agent/${newAgentId}`);
                        if (agentStatusResponse.data && agentStatusResponse.data.status === AgentStatus.RUNNING) {
                            initialized = true;
                            console.log(`New agent ${newAgentId} is initialized.`);
                        } else {
                            await new Promise(resolve => setTimeout(resolve, 1000));
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

    /**
     * Migrate a step to a specialized agent
     */
    public async migrateStepToSpecializedAgent(step: Step, recipientId?: string): Promise<{ success: boolean, result: any }> {
        try {
            const finalRecipientId = recipientId || await this.getOrCreateSpecializedAgent(step.recommendedRole!);

            if (finalRecipientId) {
                console.log(`Attempting to transfer ownership of step ${step.id} to agent ${finalRecipientId} with role ${step.recommendedRole}`);
                
                const transferResult = await this.agentSet.ownershipTransferManager.transferStep(
                    step.id,
                    this.agent.id,
                    finalRecipientId
                );

                if (transferResult.success) {
                    console.log(`Successfully transferred ownership of step ${step.id} to agent ${finalRecipientId}`);
                    step.delegatedToAgentId = finalRecipientId;
                    this.agent.delegatedStepIds.add(step.id);

                    return {
                        success: true,
                        result: {
                            stepId: step.id,
                            recipientId: finalRecipientId
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
}
