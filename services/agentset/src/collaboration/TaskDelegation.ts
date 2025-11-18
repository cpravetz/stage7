import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';
import axios from 'axios';
import { Agent } from '../agents/Agent';
import { CollaborationMessageType, TaskDelegationRequest, TaskDelegationResponse, TaskResult, createCollaborationMessage } from './CollaborationProtocol';
import * as amqp from 'amqplib';
import * as amqp_connection_manager from 'amqp-connection-manager';
import { ServiceTokenManager } from '@cktmcs/shared';


// Import AgentStatus from utils
import { OwnershipTransferManager } from '../utils/OwnershipTransferManager';
import { AgentStatus } from '../utils/agentStatus';
/**
 * Task status
 */
export enum TaskStatus {
  PENDING = 'pending',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired'
}

export class TaskDelegation {
  private agents: Map<string, Agent>;
  private trafficManagerUrl: string;
  private tokenManager: ServiceTokenManager;
  private ownershipTransferManager: OwnershipTransferManager;

  private connection: amqp_connection_manager.AmqpConnectionManager | null = null;
  private channel: amqp_connection_manager.ChannelWrapper | null = null;
  private pendingDelegations: Map<string, { request: TaskDelegationRequest, delegatorId: string, recipientId: string, resolve: (response: TaskDelegationResponse) => void, reject: (error: Error) => void, timeout: NodeJS.Timeout }> = new Map(); // Map<taskId, delegationInfo>

  constructor(agents: Map<string, Agent>, trafficManagerUrl: string, ownershipTransferManager: OwnershipTransferManager) {
    this.agents = agents;
    this.trafficManagerUrl = trafficManagerUrl;
    this.ownershipTransferManager = ownershipTransferManager;

    // Initialize token manager for service-to-service authentication
    const securityManagerUrl = process.env.SECURITYMANAGER_URL || 'securitymanager:5010';
    const serviceId = 'TaskDelegation';
    const serviceSecret = process.env.CLIENT_SECRET || 'stage7AuthSecret';
    this.tokenManager = ServiceTokenManager.getInstance(
        `http://${securityManagerUrl}`,
        serviceId,
        serviceSecret
    );

    // Initialize RabbitMQ
    this.initRabbitMQ();
  }

  private async initRabbitMQ(): Promise<void> {
    try {
      const rabbitmqUrl = process.env.RABBITMQ_URL || 'amqp://stage7:stage7password@rabbitmq:5672';
      this.connection = amqp_connection_manager.connect([rabbitmqUrl]);

      this.connection.on('connect', () => console.log('TaskDelegation connected to RabbitMQ!'));
      this.connection.on('disconnect', err => console.log('TaskDelegation disconnected from RabbitMQ.', err));

      this.channel = this.connection.createChannel({
        json: true,
        setup: async (channel: amqp.Channel) => {
          await channel.assertExchange('agent.events', 'topic', { durable: true });
          const queue = await channel.assertQueue('', { exclusive: true });
          await channel.bindQueue(queue.queue, 'agent.events', 'agent.status.update');
          await channel.consume(queue.queue, this.handleAgentStatusUpdate.bind(this), { noAck: true });
          console.log('TaskDelegation subscribed to agent.status.update events.');
        },
      });
    } catch (error) {
      console.error('Error initializing RabbitMQ for TaskDelegation:', error);
    }
  }

  private async handleAgentStatusUpdate(msg: amqp.ConsumeMessage | null): Promise<void> {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());
      const { agentId, status } = content;

      console.log(`TaskDelegation received status update for agent ${agentId}: ${status}`);

      if (status === AgentStatus.RUNNING) {
        // Check for pending delegations for this agent
        const pendingDelegation = this.pendingDelegations.get(agentId);
        if (pendingDelegation) {
          console.log(`Agent ${agentId} is RUNNING. Processing pending delegation.`);
          this.pendingDelegations.delete(agentId); // Remove from pending
          clearTimeout(pendingDelegation.timeout); // Clear timeout

          // Now, attempt the ownership transfer
          try {
            const transferResult = await this.ownershipTransferManager.transferStep(
              pendingDelegation.request.taskId,
              pendingDelegation.delegatorId,
              pendingDelegation.recipientId
            );

            if (transferResult.success) {
              pendingDelegation.resolve({
                taskId: pendingDelegation.request.taskId,
                accepted: true,
                estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Default 5 minutes estimation
              });
            } else {
              pendingDelegation.reject(new Error(transferResult.error || 'Failed to transfer step ownership.'));
            }
          } catch (error) {
            pendingDelegation.reject(error as Error);
          }
        }
      } else if (status === AgentStatus.ERROR || status === AgentStatus.ABORTED) {
        const pendingDelegation = this.pendingDelegations.get(agentId);
        if (pendingDelegation) {
          console.log(`Agent ${agentId} is in a terminal state (${status}). Rejecting pending delegation.`);
          this.pendingDelegations.delete(agentId);
          clearTimeout(pendingDelegation.timeout);
          pendingDelegation.reject(new Error(`Agent ${agentId} is in a terminal state (${status}).`));
        }
      }
    } catch (error) {
      console.error('Error processing agent status update message:', error);
    }
  }

  /**
   * Delegate a task to another agent
   * @param delegatorId Delegator agent ID
   * @param recipientId Recipient agent ID
   * @param request Task delegation request
   * @returns Task delegation response
   */
  async delegateTask(
    delegatorId: string,
    recipientId: string,
    request: TaskDelegationRequest
  ): Promise<TaskDelegationResponse> {
    try {
      const recipientAgent = this.agents.get(recipientId);

      if (!recipientAgent) {
        const agentLocation = await this.findAgentLocation(recipientId);
        if (!agentLocation) {
          return { taskId: request.taskId, accepted: false, reason: `Agent ${recipientId} not found` };
        }
        return this.forwardTaskDelegation(delegatorId, recipientId, request, agentLocation);
      }

      // If agent is already running, delegate immediately
      if (recipientAgent.getStatus() === AgentStatus.ERROR || recipientAgent.getStatus() === AgentStatus.ABORTED) {
        return { taskId: request.taskId, accepted: false, reason: `Recipient agent ${recipientId} is in a terminal state (${recipientAgent.getStatus()}).` };
      }
      if (recipientAgent.getStatus() === AgentStatus.RUNNING) {
        // Perform ownership transfer
        const transferResult = await this.ownershipTransferManager.transferStep(
          request.taskId,
          delegatorId,
          recipientId
        );

        if (transferResult.success) {
          return {
            taskId: request.taskId,
            accepted: true,
            estimatedCompletion: new Date(Date.now() + 5 * 60 * 1000).toISOString() // Default 5 minutes estimation
          };
        } else {
          return {
            taskId: request.taskId,
            accepted: false,
            reason: transferResult.error || 'Failed to transfer step ownership.'
          };
        }
      }

      // If agent is not running, store as pending and wait for status update
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingDelegations.delete(recipientId);
          reject(new Error(`Delegation to agent ${recipientId} timed out. Agent status: ${recipientAgent.getStatus()}`));
        }, 60000); // 60 seconds timeout

        this.pendingDelegations.set(recipientId, { request, delegatorId, recipientId, resolve, reject, timeout });
        console.log(`Delegation to agent ${recipientId} is pending. Current status: ${recipientAgent.getStatus()}`);
      });
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
   * Forward task delegation to another agent set
   * @param delegatorId Delegator agent ID
   * @param recipientId Recipient agent ID
   * @param request Task delegation request
   * @param agentSetUrl Agent set URL
   * @returns Task delegation response
   */
  private async forwardTaskDelegation(
    delegatorId: string,
    recipientId: string,
    request: TaskDelegationRequest,
    agentSetUrl: string
  ): Promise<TaskDelegationResponse> {
    try {
      // Get a token for authentication
      const token = await this.tokenManager.getToken();

      const response = await axios.post(`http://${agentSetUrl}/delegateTask`, {
        delegatorId,
        recipientId,
        request
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

      return response.data;
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error forwarding task delegation:', error instanceof Error ? error.message : String(error));

      return {
        taskId: request.taskId,
        accepted: false,
        reason: `Error forwarding task delegation: ${error instanceof Error ? error.message : String(error)}`
      };
    }
  }

  /**
   * Find the location of an agent
   * @param agentId Agent ID
   * @returns Agent set URL or undefined if not found
   */
  private async findAgentLocation(agentId: string): Promise<string | undefined> {
    try {
      // Get a token for authentication
      const token = await this.tokenManager.getToken();

      const response = await axios.get(`http://${this.trafficManagerUrl}/getAgentLocation/${agentId}`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });

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


}
