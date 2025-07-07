import { Agent } from '../agents/Agent';
import { TaskDelegation, TaskStatus } from './TaskDelegation';
import { ConflictResolution } from './ConflictResolution';
import {
  CollaborationMessage,
  CollaborationMessageType,
  CollaborationProtocol,
  TaskDelegationRequest,
  TaskDelegationResponse,
  ConflictResolutionRequest,
  ConflictResolutionResponse,
  KnowledgeSharing,
  createCollaborationMessage
} from './CollaborationProtocol';
import { analyzeError } from '@cktmcs/errorhandler';
import { AgentSet } from '../AgentSet';

export class CollaborationManager implements CollaborationProtocol {
  private taskDelegation: TaskDelegation;
  private conflictResolution: ConflictResolution;
  private agentSet: AgentSet;

  constructor(
    agentSet: AgentSet,
    taskDelegation: TaskDelegation,
    conflictResolution: ConflictResolution
  ) {
    this.agentSet = agentSet;
    this.taskDelegation = taskDelegation;
    this.conflictResolution = conflictResolution;

    // Periodic checks for expired tasks/conflicts
    setInterval(() => this.taskDelegation.checkExpiredTasks(), 60000);
    setInterval(() => this.conflictResolution.checkExpiredConflicts(), 60000);
  }

  /**
   * Send a collaboration message.
   * If the recipient is local, deliver directly.
   * Otherwise, delegate to AgentSet for routing/forwarding.
   */
  async sendMessage(message: CollaborationMessage): Promise<void> {
    try {
      if (message.recipientId === 'broadcast') {
        // Broadcast to all local agents and delegate broadcast to AgentSet for remote sets
        for (const [id, agent] of this.agentSet.agents) {
          await agent.handleCollaborationMessage(message);
        }
        await this.agentSet.forwardCollaborationMessage(message); // AgentSet should handle remote broadcast
      } else {
        const recipientAgent = this.agentSet.agents.get(message.recipientId);
        if (recipientAgent) {
          await recipientAgent.handleCollaborationMessage(message);
        } else {
          // Delegate to AgentSet for remote delivery
          await this.agentSet.forwardCollaborationMessage(message);
        }
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error sending collaboration message:', error);
    }
  }

  /**
   * Handle a received collaboration message.
   * Only handles local delivery; AgentSet should call this for local agents.
   */
  async handleMessage(message: CollaborationMessage): Promise<void> {
    try {
      if (message.recipientId === 'broadcast') {
        for (const [id, agent] of this.agentSet.agents) {
          await agent.handleCollaborationMessage(message);
        }
        return;
      }
      const recipientAgent = this.agentSet.agents.get(message.recipientId);
      if (recipientAgent) {
        await recipientAgent.handleCollaborationMessage(message);
      } else {
        // Not local; ignore (AgentSet should have routed properly)
        console.warn(`CollaborationManager: Agent ${message.recipientId} not found locally.`);
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error handling collaboration message:', error);
    }
  }

  /**
   * Delegate a task to another agent.
   */
  async delegateTask(
    senderId: string,
    recipientId: string,
    request: TaskDelegationRequest
  ): Promise<TaskDelegationResponse> {
    try {
      return await this.taskDelegation.delegateTask(senderId, recipientId, request);
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error delegating task:', error);
      return {
        taskId: request.taskId,
        accepted: false,
        reason: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Share knowledge.
   * This method should send a message to the recipient(s) and let the recipient decide how to store/process knowledge.
   */
  async shareKnowledge(
    senderId: string,
    recipientId: string | 'broadcast',
    knowledge: KnowledgeSharing
  ): Promise<void> {
    try {
      const message = createCollaborationMessage(
        CollaborationMessageType.KNOWLEDGE_SHARE,
        senderId,
        recipientId,
        knowledge
      );
      await this.sendMessage(message);
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error sharing knowledge:', error);
    }
  }

  /**
   * Request conflict resolution.
   */
  async resolveConflict(
    senderId: string,
    recipientId: string,
    request: ConflictResolutionRequest
  ): Promise<ConflictResolutionResponse> {
    try {
      const conflict = await this.conflictResolution.createConflict(
        senderId,
        request,
        [recipientId]
      );
      const maxWaitTime = 30000;
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitTime) {
        const updatedConflict = this.conflictResolution.getConflict(conflict.id);
        if (updatedConflict && updatedConflict.status === 'resolved') {
          return {
            conflictId: conflict.id,
            resolution: updatedConflict.resolution,
            explanation: updatedConflict.explanation || 'Conflict resolved'
          };
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      return {
        conflictId: conflict.id,
        resolution: null,
        explanation: 'Conflict resolution is still pending'
      };
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error resolving conflict:', error);
      return {
        conflictId: request.conflictId,
        resolution: null,
        explanation: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get task delegation.
   */
  getTaskDelegation(): TaskDelegation {
    return this.taskDelegation;
  }

  /**
   * Get conflict resolution.
   */
  getConflictResolution(): ConflictResolution {
    return this.conflictResolution;
  }
}
