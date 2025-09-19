import { v4 as uuidv4 } from 'uuid';
import { analyzeError } from '@cktmcs/errorhandler';
import axios from 'axios';
import { Agent } from '../agents/Agent';
import { CollaborationMessageType, TaskDelegationRequest, TaskDelegationResponse, TaskResult, createCollaborationMessage } from './CollaborationProtocol';
import * as amqp from 'amqplib';
import * as amqp_connection_manager from 'amqp-connection-manager';
import { ServiceTokenManager } from '@cktmcs/shared';


// Import AgentStatus from utils
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

/**
 * Delegated task
 */
export interface DelegatedTask {
  id: string;
  taskType: string;
  description: string;
  inputs: Record<string, any>;
  delegatedBy: string;
  delegatedTo: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  deadline?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  result?: any;
  error?: string;
  metrics?: {
    startTime?: string;
    endTime?: string;
    duration?: number;
  };
}

/**
 * Task delegation system
 */
export class TaskDelegation {
  private tasks: Map<string, DelegatedTask> = new Map();
  private agents: Map<string, Agent>;
  private trafficManagerUrl: string;
  private tokenManager: ServiceTokenManager;

  private connection: amqp_connection_manager.AmqpConnectionManager | null = null;
  private channel: amqp_connection_manager.ChannelWrapper | null = null;
  private pendingDelegations: Map<string, { request: TaskDelegationRequest, delegatorId: string, recipientId: string, resolve: (response: TaskDelegationResponse) => void, reject: (error: Error) => void, timeout: NodeJS.Timeout }> = new Map(); // Map<taskId, delegationInfo>

  constructor(agents: Map<string, Agent>, trafficManagerUrl: string) {
    this.agents = agents;
    this.trafficManagerUrl = trafficManagerUrl;

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

          // Now, actually delegate the task
          try {
            const response = await this.performDelegation(pendingDelegation.delegatorId, pendingDelegation.recipientId, pendingDelegation.request);
            pendingDelegation.resolve(response);
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
      if (recipientAgent.getStatus() === AgentStatus.RUNNING) {
        return this.performDelegation(delegatorId, recipientId, request);
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

  // New private method to perform the actual delegation
  private async performDelegation(delegatorId: string, recipientId: string, request: TaskDelegationRequest): Promise<TaskDelegationResponse> {
    const recipientAgent = this.agents.get(recipientId);

    if (!recipientAgent) {
      // This should ideally not happen if the agent was found earlier,
      // but it's a safeguard against the agent being removed between checks.
      console.error(`Agent ${recipientId} not found in agents map during performDelegation.`);
      return {
        taskId: request.taskId,
        accepted: false,
        reason: `Agent ${recipientId} not found in agents map for delegation.`
      };
    }

    // Create task
    const task: DelegatedTask = {
      id: request.taskId || uuidv4(),
      taskType: request.taskType,
      description: request.description,
      inputs: request.inputs,
      delegatedBy: delegatorId,
      delegatedTo: recipientId,
      status: TaskStatus.PENDING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deadline: request.deadline,
      priority: request.priority || 'normal'
    };

    // Store task
    this.tasks.set(task.id, task);

    // Send task to recipient agent
    const message = {
      type: CollaborationMessageType.TASK_DELEGATION,
      sender: delegatorId,
      recipient: recipientId,
      content: task
    };

    const properTaskMessage = createCollaborationMessage(
      message.type,
      message.sender,
      message.recipient,
      message.content
    );
    await recipientAgent.handleCollaborationMessage(properTaskMessage);

    // Update task status
    task.status = TaskStatus.ACCEPTED;
    task.updatedAt = new Date().toISOString();

    return {
      taskId: task.id,
      accepted: true,
      estimatedCompletion: this.estimateCompletionTime(task)
    };
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

  /**
   * Estimate completion time for a task
   * @param task Task
   * @returns Estimated completion time
   */
  private estimateCompletionTime(task: DelegatedTask): string {
    // Simple estimation based on priority
    const now = new Date();
    let estimatedMinutes = 5; // Default

    switch (task.priority) {
      case 'urgent':
        estimatedMinutes = 1;
        break;
      case 'high':
        estimatedMinutes = 3;
        break;
      case 'normal':
        estimatedMinutes = 5;
        break;
      case 'low':
        estimatedMinutes = 10;
        break;
    }

    const estimatedCompletion = new Date(now.getTime() + estimatedMinutes * 60000);
    return estimatedCompletion.toISOString();
  }

  /**
   * Update task status
   * @param taskId Task ID
   * @param status New status
   * @param result Task result
   * @param error Error message
   */
  async updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    result?: any,
    error?: string
  ): Promise<void> {
    const task = this.tasks.get(taskId);

    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    // Update task
    task.status = status;
    task.updatedAt = new Date().toISOString();

    if (result !== undefined) {
      task.result = result;
    }

    if (error !== undefined) {
      task.error = error;
    }

    // Update metrics
    if (!task.metrics) {
      task.metrics = {};
    }

    if (status === TaskStatus.IN_PROGRESS && !task.metrics.startTime) {
      task.metrics.startTime = new Date().toISOString();
    }

    if ((status === TaskStatus.COMPLETED || status === TaskStatus.FAILED) && !task.metrics.endTime) {
      task.metrics.endTime = new Date().toISOString();

      if (task.metrics.startTime) {
        const startTime = new Date(task.metrics.startTime).getTime();
        const endTime = new Date(task.metrics.endTime).getTime();
        task.metrics.duration = (endTime - startTime) / 1000; // Duration in seconds
      }
    }

    // Notify delegator
    await this.notifyTaskUpdate(task);
  }

  /**
   * Notify delegator about task update
   * @param task Updated task
   */
  private async notifyTaskUpdate(task: DelegatedTask): Promise<void> {
    try {
      const delegatorAgent = this.agents.get(task.delegatedBy);

      if (delegatorAgent) {
        // Send task update to delegator agent
        const message = {
          type: task.status === TaskStatus.COMPLETED || task.status === TaskStatus.FAILED
            ? CollaborationMessageType.TASK_RESULT
            : CollaborationMessageType.TASK_STATUS,
          sender: task.delegatedTo,
          recipient: task.delegatedBy,
          content: task
        };

        const properDelegationMessage = createCollaborationMessage(
          message.type,
          message.sender,
          message.recipient,
          message.content
        );

        await delegatorAgent.handleCollaborationMessage(properDelegationMessage);
      } else {
        // Try to find delegator agent in other agent sets
        const agentLocation = await this.findAgentLocation(task.delegatedBy);

        if (agentLocation) {
          // Get a token for authentication
          const token = await this.tokenManager.getToken();

          // Forward task update to the agent's location
          await axios.post(`http://${agentLocation}/taskUpdate`, {
            taskId: task.id,
            status: task.status,
            result: task.result,
            error: task.error
          }, {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
        }
      }
    } catch (error) {
      analyzeError(error as Error);
      console.error('Error notifying task update:', error);
    }
  }

  /**
   * Get task by ID
   * @param taskId Task ID
   * @returns Task or undefined if not found
   */
  getTask(taskId: string): DelegatedTask | undefined {
    return this.tasks.get(taskId);
  }

  /**
   * Get tasks delegated by an agent
   * @param agentId Agent ID
   * @returns Tasks delegated by the agent
   */
  getTasksDelegatedBy(agentId: string): DelegatedTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.delegatedBy === agentId);
  }

  /**
   * Get tasks delegated to an agent
   * @param agentId Agent ID
   * @returns Tasks delegated to the agent
   */
  getTasksDelegatedTo(agentId: string): DelegatedTask[] {
    return Array.from(this.tasks.values())
      .filter(task => task.delegatedTo === agentId);
  }

  /**
   * Cancel a task
   * @param taskId Task ID
   * @param agentId Agent ID requesting cancellation
   * @returns True if cancelled, false if not found
   */
  async cancelTask(taskId: string, agentId: string): Promise<boolean> {
    const task = this.tasks.get(taskId);

    if (!task) {
      return false;
    }

    // Check if agent is the delegator
    if (task.delegatedBy !== agentId) {
      throw new Error(`Agent ${agentId} is not the delegator of task ${taskId}`);
    }

    // Check if task can be cancelled
    if (task.status === TaskStatus.COMPLETED ||
        task.status === TaskStatus.FAILED ||
        task.status === TaskStatus.CANCELLED) {
      return false;
    }

    // Update task status
    await this.updateTaskStatus(taskId, TaskStatus.CANCELLED);

    return true;
  }

  /**
   * Check for expired tasks
   */
  async checkExpiredTasks(): Promise<void> {
    const now = new Date();

    for (const [taskId, task] of this.tasks.entries()) {
      if (task.deadline &&
          task.status !== TaskStatus.COMPLETED &&
          task.status !== TaskStatus.FAILED &&
          task.status !== TaskStatus.CANCELLED &&
          task.status !== TaskStatus.EXPIRED) {

        const deadline = new Date(task.deadline);

        if (now > deadline) {
          await this.updateTaskStatus(taskId, TaskStatus.EXPIRED, undefined, 'Task deadline expired');
        }
      }
    }
  }
}
