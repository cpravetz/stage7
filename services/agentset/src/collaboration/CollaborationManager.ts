import { Agent } from '../agents/Agent';
import { SharedMemory } from './SharedMemory';
import { TaskDelegation, TaskStatus } from './TaskDelegation';
import { ConflictResolution } from './ConflictResolution';
import { CollaborationMessage, CollaborationMessageType, CollaborationProtocol, TaskDelegationRequest, TaskDelegationResponse, ConflictResolutionRequest, ConflictResolutionResponse, KnowledgeSharing, createCollaborationMessage } from './CollaborationProtocol';
import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';

/**
 * Collaboration manager
 */
export class CollaborationManager implements CollaborationProtocol {
  private agents: Map<string, Agent>;
  private sharedMemories: Map<string, SharedMemory> = new Map();
  private taskDelegation: TaskDelegation;
  private conflictResolution: ConflictResolution;
  private librarianUrl: string;
  private trafficManagerUrl: string;
  private brainUrl: string;

  constructor(
    agents: Map<string, Agent>,
    librarianUrl: string,
    trafficManagerUrl: string,
    brainUrl: string,
    private authenticatedApi: any // Using any type to avoid circular dependencies
  ) {
    this.agents = agents;
    this.librarianUrl = librarianUrl;
    this.trafficManagerUrl = trafficManagerUrl;
    this.brainUrl = brainUrl;

    this.taskDelegation = new TaskDelegation(agents, trafficManagerUrl);
    this.conflictResolution = new ConflictResolution(agents, trafficManagerUrl, brainUrl);

    // Set up periodic checks
    setInterval(() => this.taskDelegation.checkExpiredTasks(), 60000); // Check every minute
    setInterval(() => this.conflictResolution.checkExpiredConflicts(), 60000); // Check every minute
  }

  /**
   * Get or create shared memory for a mission
   * @param missionId Mission ID
   * @returns Shared memory
   */
  getSharedMemory(missionId: string): SharedMemory {
    if (!this.sharedMemories.has(missionId)) {
      this.sharedMemories.set(missionId, new SharedMemory(this.librarianUrl, missionId, this.authenticatedApi));
    }

    return this.sharedMemories.get(missionId)!;
  }

  /**
   * Send a collaboration message
   * @param message Message to send
   */
  async sendMessage(message: CollaborationMessage): Promise<void> {
    try {
      if (message.recipientId === 'broadcast') {
        // Broadcast message to all agents
        for (const agent of this.agents.values()) {
          await agent.handleCollaborationMessage(message);
        }
      } else {
        // Send message to specific agent
        const recipientAgent = this.agents.get(message.recipientId);

        if (recipientAgent) {
          await recipientAgent.handleCollaborationMessage(message);
        } else {
          // Forward message to agent in another agent set
          const agentLocation = await this.findAgentLocation(message.recipientId);

          if (agentLocation) {
            await this.forwardCollaborationMessage(message, agentLocation);
          } else {
            console.warn(`Agent ${message.recipientId} not found in any agent set`);
          }
        }
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error sending collaboration message:', error);
      throw error;
    }
  }

  /**
   * Find the location of an agent
   * @param agentId Agent ID
   * @returns Agent set URL or undefined if not found
   */
  private async findAgentLocation(agentId: string): Promise<string | undefined> {
    try {
      const response = await this.authenticatedApi.get(`http://${this.trafficManagerUrl}/getAgentLocation/${agentId}`);

      if (response.data && response.data.agentSetUrl) {
        return response.data.agentSetUrl;
      }

      return undefined;
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error finding agent location:', error);
      return undefined;
    }
  }

  /**
   * Forward a collaboration message to an agent in another agent set
   * @param message Collaboration message
   * @param agentSetUrl Agent set URL
   */
  private async forwardCollaborationMessage(message: CollaborationMessage, agentSetUrl: string): Promise<void> {
    try {
      console.log(`Forwarding collaboration message to agent ${message.recipientId} at ${agentSetUrl}`);

      await this.authenticatedApi.post(`http://${agentSetUrl}/collaboration/message`, message);

      console.log(`Successfully forwarded collaboration message to agent ${message.recipientId}`);
    } catch (error) {
      analyzeError(error as Error);
      console.error(`Error forwarding collaboration message to agent ${message.recipientId}:`, error);
      throw error;
    }
  }

  /**
   * Handle a received collaboration message
   * @param message Received message
   */
  async handleMessage(message: CollaborationMessage): Promise<void> {
    try {
      console.log(`Received collaboration message for agent ${message.recipientId}`);

      // If the message is for a specific agent, route it to that agent
      if (message.recipientId !== 'broadcast') {
        const recipientAgent = this.agents.get(message.recipientId);

        if (recipientAgent) {
          await recipientAgent.handleCollaborationMessage(message);
          return;
        }
      }

      // Process the message based on its type
      switch (message.type) {
        case CollaborationMessageType.KNOWLEDGE_SHARE:
          await this.handleKnowledgeShare(message);
          break;

        case CollaborationMessageType.TASK_DELEGATION:
          await this.handleTaskDelegation(message);
          break;

        case CollaborationMessageType.TASK_RESULT:
          await this.handleTaskResult(message);
          break;

        case CollaborationMessageType.TASK_STATUS:
          await this.handleTaskStatus(message);
          break;

        case CollaborationMessageType.CONFLICT_RESOLUTION:
          await this.handleConflictResolution(message);
          break;

        case CollaborationMessageType.COORDINATION:
          await this.handleCoordination(message);
          break;

        case CollaborationMessageType.RESOURCE_REQUEST:
          await this.handleResourceRequest(message);
          break;

        case CollaborationMessageType.RESOURCE_RESPONSE:
          await this.handleResourceResponse(message);
          break;

        default:
          console.warn(`Unknown collaboration message type: ${message.type}`);
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error handling collaboration message:', error);
      throw error;
    }
  }

  /**
   * Handle knowledge share message
   * @param message Knowledge share message
   */
  private async handleKnowledgeShare(message: CollaborationMessage): Promise<void> {
    const knowledge = message.content as KnowledgeSharing;
    const senderAgent = this.agents.get(message.senderId);

    if (!senderAgent) {
      console.warn(`Agent ${message.senderId} not found`);
      return;
    }

    // Store knowledge in shared memory
    const sharedMemory = this.getSharedMemory(senderAgent.missionId);

    await sharedMemory.set(
      `knowledge:${knowledge.topic}:${uuidv4()}`,
      knowledge.content,
      message.senderId,
      {
        tags: ['knowledge', ...knowledge.tags || []],
        accessControl: { read: ['all'], write: [message.senderId] }
      }
    );

    console.log(`Knowledge shared by agent ${message.senderId} on topic ${knowledge.topic}`);
  }

  /**
   * Handle task delegation message
   * @param message Task delegation message
   */
  private async handleTaskDelegation(message: CollaborationMessage): Promise<void> {
    const task = message.content;
    const recipientAgent = this.agents.get(message.recipientId);

    if (!recipientAgent) {
      console.warn(`Agent ${message.recipientId} not found`);
      return;
    }

    // Update task status to in progress
    await this.taskDelegation.updateTaskStatus(task.id, 'in_progress' as TaskStatus);

    // Create a step for the task
    await recipientAgent.createStepForTask(task);
  }

  /**
   * Handle task result message
   * @param message Task result message
   */
  private async handleTaskResult(message: CollaborationMessage): Promise<void> {
    const result = message.content;
    const delegatorAgent = this.agents.get(message.recipientId);

    if (!delegatorAgent) {
      console.warn(`Agent ${message.recipientId} not found`);
      return;
    }

    // Process task result
    await delegatorAgent.processTaskResult(result);
  }

  /**
   * Handle task status message
   * @param message Task status message
   */
  private async handleTaskStatus(message: CollaborationMessage): Promise<void> {
    // Just log the status update
    console.log(`Task status update: ${JSON.stringify(message.content)}`);
  }

  /**
   * Handle conflict resolution message
   * @param message Conflict resolution message
   */
  private async handleConflictResolution(message: CollaborationMessage): Promise<void> {
    const content = message.content;

    if (content.status === 'resolved') {
      // Process conflict resolution
      const recipientAgent = this.agents.get(message.recipientId);

      if (recipientAgent) {
        await recipientAgent.processConflictResolution(content);
      }
    } else if (content.conflictId && !content.status) {
      // This is a conflict notification, submit a vote
      const recipientAgent = this.agents.get(message.recipientId);

      if (recipientAgent) {
        const vote = await recipientAgent.generateConflictVote(content);

        if (vote) {
          await this.conflictResolution.submitVote(
            content.conflictId,
            message.recipientId,
            vote.vote,
            vote.explanation
          );
        }
      }
    }
  }

  /**
   * Handle coordination message
   * @param message Coordination message
   */
  private async handleCoordination(message: CollaborationMessage): Promise<void> {
    // Coordination messages are handled by the recipient agent
    const recipientAgent = this.agents.get(message.recipientId);

    if (recipientAgent) {
      await recipientAgent.handleCoordination(message.content);
    }
  }

  /**
   * Handle resource request message
   * @param message Resource request message
   */
  private async handleResourceRequest(message: CollaborationMessage): Promise<void> {
    const request = message.content;
    const recipientAgent = this.agents.get(message.recipientId);

    if (!recipientAgent) {
      console.warn(`Agent ${message.recipientId} not found`);
      return;
    }

    // Process resource request
    const response = await recipientAgent.processResourceRequest(request);

    // Send response
    await this.sendMessage(createCollaborationMessage(
      CollaborationMessageType.RESOURCE_RESPONSE,
      message.recipientId,
      message.senderId,
      response,
      { inReplyTo: message.id }
    ));
  }

  /**
   * Handle resource response message
   * @param message Resource response message
   */
  private async handleResourceResponse(message: CollaborationMessage): Promise<void> {
    // Resource responses are handled by the recipient agent
    const recipientAgent = this.agents.get(message.recipientId);

    if (recipientAgent) {
      await recipientAgent.processResourceResponse(message.content);
    }
  }

  /**
   * Delegate a task to another agent
   * @param recipientId Recipient agent ID
   * @param request Task delegation request
   * @returns Task delegation response
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
   * Share knowledge with other agents
   * @param recipientId Recipient agent ID or 'broadcast'
   * @param knowledge Knowledge to share
   */
  async shareKnowledge(
    senderId: string,
    recipientId: string | 'broadcast',
    knowledge: KnowledgeSharing
  ): Promise<void> {
    try {
      // Create and send knowledge share message
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
      throw error;
    }
  }

  /**
   * Request conflict resolution
   * @param senderId Sender agent ID
   * @param recipientId Recipient agent ID
   * @param request Conflict resolution request
   * @returns Conflict resolution response
   */
  async resolveConflict(
    senderId: string,
    recipientId: string,
    request: ConflictResolutionRequest
  ): Promise<ConflictResolutionResponse> {
    try {
      // Create conflict
      const conflict = await this.conflictResolution.createConflict(
        senderId,
        request,
        [recipientId]
      );

      // Wait for resolution (with timeout)
      const maxWaitTime = 30000; // 30 seconds
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

        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Timeout reached, return pending status
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
   * Get task delegation
   * @returns Task delegation
   */
  getTaskDelegation(): TaskDelegation {
    return this.taskDelegation;
  }

  /**
   * Get conflict resolution
   * @returns Conflict resolution
   */
  getConflictResolution(): ConflictResolution {
    return this.conflictResolution;
  }
}
