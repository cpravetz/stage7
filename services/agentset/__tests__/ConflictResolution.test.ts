
import { ConflictResolution, ConflictResolutionStrategy, ConflictStatus } from '../src/collaboration/ConflictResolution';
import { Agent } from '../src/agents/Agent';
import { CollaborationMessageType, ConflictResolutionRequest } from '../src/collaboration/CollaborationProtocol';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');
jest.mock('../src/agents/Agent');

const mockAxios = axios as jest.Mocked<typeof axios>;

describe('ConflictResolution', () => {
  let conflictResolution: ConflictResolution;
  let mockAgents: Map<string, Agent>;
  let mockAgent: jest.Mocked<Agent>;

  beforeEach(() => {
    mockAgents = new Map<string, Agent>();
    conflictResolution = new ConflictResolution(mockAgents, 'trafficmanager:5080', 'brain:5070');

    // Create a mock agent
    mockAgent = new Agent({
      id: 'participant-agent',
      missionId: 'test-mission',
      actionVerb: 'TEST',
      agentSetUrl: 'http://localhost:9001',
    }) as jest.Mocked<Agent>;

    // Mock agent methods
    mockAgent.handleCollaborationMessage.mockResolvedValue(undefined);

    mockAgents.set('participant-agent', mockAgent);
  });

  describe('createConflict', () => {
    it('should create a new conflict and notify participants', async () => {
      const request: ConflictResolutionRequest = {
        conflictId: 'test-conflict',
        description: 'test-description',
        conflictingData: [],
      };

      const conflict = await conflictResolution.createConflict('initiator-agent', request, ['participant-agent']);

      expect(conflict.id).toBe('test-conflict');
      expect(conflict.status).toBe(ConflictStatus.PENDING);
      expect(mockAgent.handleCollaborationMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: CollaborationMessageType.CONFLICT_RESOLUTION,
      }));
    });
  });

  describe('submitVote', () => {
    it('should submit a vote for a conflict', async () => {
      const request: ConflictResolutionRequest = {
        conflictId: 'test-conflict',
        description: 'test-description',
        conflictingData: [],
      };
      await conflictResolution.createConflict('initiator-agent', request, ['participant-agent']);

      await conflictResolution.submitVote('test-conflict', 'participant-agent', 'vote-option-1');

      const conflict = conflictResolution.getConflict('test-conflict');
      expect(conflict?.votes?.[(mockAgent as any).id].vote).toBe('vote-option-1');
    });
  });

  describe('resolveConflict', () => {
    it('should resolve a conflict by voting', async () => {
      const request: ConflictResolutionRequest = {
        conflictId: 'test-conflict',
        description: 'test-description',
        conflictingData: [],
      };
      await conflictResolution.createConflict('initiator-agent', request, ['participant-agent'], ConflictResolutionStrategy.VOTING);

      await conflictResolution.submitVote('test-conflict', 'participant-agent', 'vote-option-1');
      await conflictResolution.submitVote('test-conflict', 'initiator-agent', 'vote-option-1');

      const conflict = conflictResolution.getConflict('test-conflict');
      expect(conflict?.status).toBe(ConflictStatus.RESOLVED);
      expect(conflict?.resolution).toBe('vote-option-1');
    });
  });

  describe('checkExpiredConflicts', () => {
    it('should escalate expired conflicts', async () => {
      const request: ConflictResolutionRequest = {
        conflictId: 'test-conflict',
        description: 'test-description',
        conflictingData: [],
        deadline: new Date(Date.now() - 1000).toISOString(), // Expired
      };
      await conflictResolution.createConflict('initiator-agent', request, ['participant-agent']);

      await conflictResolution.checkExpiredConflicts();

      const conflict = conflictResolution.getConflict('test-conflict');
      expect(conflict?.status).toBe(ConflictStatus.ESCALATED);
    });
  });
});
