
import { TaskDelegation, TaskStatus } from '../src/collaboration/TaskDelegation';
import { Agent } from '../src/agents/Agent';
import { AgentStatus } from '../src/utils/agentStatus';
import { CollaborationMessageType, TaskDelegationRequest } from '../src/collaboration/CollaborationProtocol';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');
jest.mock('../src/agents/Agent');

const mockAxios = axios as jest.Mocked<typeof axios>;

describe('TaskDelegation', () => {
  let taskDelegation: TaskDelegation;
  let mockAgents: Map<string, Agent>;
  let mockAgent: jest.Mocked<Agent>;

  beforeEach(() => {
    mockAgents = new Map<string, Agent>();
    taskDelegation = new TaskDelegation(mockAgents, 'trafficmanager:5080');

    // Create a mock agent
    mockAgent = new Agent({
      id: 'recipient-agent',
      missionId: 'test-mission',
      actionVerb: 'TEST',
      agentSetUrl: 'http://localhost:9001',
    }) as jest.Mocked<Agent>;

    // Mock agent methods
    mockAgent.getStatus.mockReturnValue(AgentStatus.RUNNING);
    mockAgent.handleCollaborationMessage.mockResolvedValue(undefined);

    mockAgents.set('recipient-agent', mockAgent);
  });

  describe('delegateTask', () => {
    it('should delegate a task to a running agent', async () => {
      const request: TaskDelegationRequest = {
        taskId: 'test-task',
        taskType: 'test-type',
        description: 'test-description',
        inputs: {},
      };

      const response = await taskDelegation.delegateTask('delegator-agent', 'recipient-agent', request);

      expect(response.accepted).toBe(true);
      expect(response.taskId).toBe('test-task');
      expect(mockAgent.handleCollaborationMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: CollaborationMessageType.TASK_DELEGATION,
      }));
    });

    it('should reject a task to a non-running agent', async () => {
      mockAgent.getStatus.mockReturnValue(AgentStatus.PAUSED);
      const request: TaskDelegationRequest = {
        taskId: 'test-task',
        taskType: 'test-type',
        description: 'test-description',
        inputs: {},
      };

      const response = await taskDelegation.delegateTask('delegator-agent', 'recipient-agent', request);

      expect(response.accepted).toBe(false);
      expect(response.reason).toContain('is not running');
    });
  });

  describe('updateTaskStatus', () => {
    it('should update the status of a task', async () => {
      const request: TaskDelegationRequest = {
        taskId: 'test-task',
        taskType: 'test-type',
        description: 'test-description',
        inputs: {},
      };
      await taskDelegation.delegateTask('delegator-agent', 'recipient-agent', request);

      await taskDelegation.updateTaskStatus('test-task', TaskStatus.IN_PROGRESS);

      const task = taskDelegation.getTask('test-task');
      expect(task?.status).toBe(TaskStatus.IN_PROGRESS);
    });
  });

  describe('cancelTask', () => {
    it('should cancel a pending task', async () => {
      const request: TaskDelegationRequest = {
        taskId: 'test-task',
        taskType: 'test-type',
        description: 'test-description',
        inputs: {},
      };
      await taskDelegation.delegateTask('delegator-agent', 'recipient-agent', request);

      const result = await taskDelegation.cancelTask('test-task', 'delegator-agent');

      expect(result).toBe(true);
      const task = taskDelegation.getTask('test-task');
      expect(task?.status).toBe(TaskStatus.CANCELLED);
    });
  });

  describe('checkExpiredTasks', () => {
    it('should mark expired tasks as expired', async () => {
      const request: TaskDelegationRequest = {
        taskId: 'test-task',
        taskType: 'test-type',
        description: 'test-description',
        inputs: {},
        deadline: new Date(Date.now() - 1000).toISOString(), // Expired
      };
      await taskDelegation.delegateTask('delegator-agent', 'recipient-agent', request);

      await taskDelegation.checkExpiredTasks();

      const task = taskDelegation.getTask('test-task');
      expect(task?.status).toBe(TaskStatus.EXPIRED);
    });
  });
});
