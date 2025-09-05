
import { CollaborationManager } from '../src/collaboration/CollaborationManager';
import { AgentSet } from '../src/AgentSet';
import { TaskDelegation } from '../src/collaboration/TaskDelegation';
import { ConflictResolution } from '../src/collaboration/ConflictResolution';
import { CollaborationMessageType, createCollaborationMessage } from '../src/collaboration/CollaborationProtocol';

// Mock dependencies
jest.mock('../src/AgentSet');
jest.mock('../src/collaboration/TaskDelegation');
jest.mock('../src/collaboration/ConflictResolution');

describe('CollaborationManager', () => {
  let collaborationManager: CollaborationManager;
  let mockAgentSet: jest.Mocked<AgentSet>;
  let mockTaskDelegation: jest.Mocked<TaskDelegation>;
  let mockConflictResolution: jest.Mocked<ConflictResolution>;

  beforeEach(() => {
    mockAgentSet = new AgentSet() as jest.Mocked<AgentSet>;
    mockTaskDelegation = new TaskDelegation(new Map(), '') as jest.Mocked<TaskDelegation>;
    mockConflictResolution = new ConflictResolution(new Map(), '', '') as jest.Mocked<ConflictResolution>;

    collaborationManager = new CollaborationManager(mockAgentSet, mockTaskDelegation, mockConflictResolution);
  });

  describe('sendMessage', () => {
    it('should handle local message delivery', async () => {
      const mockAgent = { handleCollaborationMessage: jest.fn() };
      mockAgentSet.agents = new Map([['recipient-agent', mockAgent as any]]);

      const message = createCollaborationMessage(CollaborationMessageType.KNOWLEDGE_SHARE, 'sender-agent', 'recipient-agent', {});
      await collaborationManager.sendMessage(message);

      expect(mockAgent.handleCollaborationMessage).toHaveBeenCalledWith(message);
    });

    it('should handle remote message delivery', async () => {
      mockAgentSet.agents = new Map();
      mockAgentSet.forwardCollaborationMessage = jest.fn();

      const message = createCollaborationMessage(CollaborationMessageType.KNOWLEDGE_SHARE, 'sender-agent', 'recipient-agent', {});
      await collaborationManager.sendMessage(message);

      expect(mockAgentSet.forwardCollaborationMessage).toHaveBeenCalledWith(message);
    });
  });

  describe('delegateTask', () => {
    it('should call the task delegation module', async () => {
      const request = { taskId: 'test-task', taskType: 'test', description: '', inputs: {} };
      await collaborationManager.delegateTask('sender', 'recipient', request);

      expect(mockTaskDelegation.delegateTask).toHaveBeenCalledWith('sender', 'recipient', request);
    });
  });

  describe('resolveConflict', () => {
    it('should call the conflict resolution module', async () => {
      const request = { conflictId: 'test-conflict', description: '', conflictingData: [] };
      mockConflictResolution.createConflict.mockResolvedValue({} as any);
      mockConflictResolution.getConflict.mockReturnValue({ status: 'resolved' } as any);

      await collaborationManager.resolveConflict('sender', 'recipient', request);

      expect(mockConflictResolution.createConflict).toHaveBeenCalled();
    });
  });
});
