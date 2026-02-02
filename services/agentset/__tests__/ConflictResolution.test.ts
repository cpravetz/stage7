
import { ConflictResolution, ConflictResolutionStrategy, ConflictStatus } from '../src/collaboration/ConflictResolution';
import { Agent } from '../src/agents/Agent';
import { CollaborationMessageType, ConflictResolutionRequest } from '../src/collaboration/CollaborationProtocol';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');
jest.mock('../src/agents/Agent', () => {
    return {
        Agent: jest.fn().mockImplementation((config) => {
            return {
                id: config.id || 'mock-agent-id',
                missionId: config.missionId || 'mock-mission-id',
                handleCollaborationMessage: jest.fn(),
                // Add other methods that might be called on Agent instances
            };
        }),
    };
});

const mockAxios = axios as jest.Mocked<typeof axios>;

describe('ConflictResolution', () => {
  let conflictResolution: ConflictResolution;
  let mockAgents: Map<string, Agent>;
  let mockAgent: jest.Mocked<Agent>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockAgents = new Map<string, Agent>();
    conflictResolution = new ConflictResolution(mockAgents, 'brain:5070');

    // Mock the get method of mockAgents to return mockAgent with missionId
    jest.spyOn(mockAgents, 'get').mockImplementation((agentId) => {
        if (agentId === 'participant-agent') {
            return {
                id: 'participant-agent',
                missionId: 'test-mission',
                handleCollaborationMessage: jest.fn().mockResolvedValue(undefined)
            } as any;
        }
        if (agentId === 'initiator-agent') {
            return {
                id: 'initiator-agent',
                missionId: 'test-mission'
            } as any;
        }
        return undefined;
    });

    // Create a mock agent for direct access in tests
    mockAgent = new Agent({
        id: 'participant-agent',
        missionId: 'test-mission',
    }) as jest.Mocked<Agent>;

    mockAgents.set('participant-agent', mockAgent);

    // Suppress console logs
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Mock findAgentLocation and authenticatedApi.post for MissionControl calls
    jest.spyOn(conflictResolution as any, 'findAgentLocation').mockResolvedValue('http://mock-agentset-url');
    (conflictResolution as any).authenticatedApi.post.mockImplementation((url: string, data: any) => {
        if (url.includes('escalateConflict')) {
            return Promise.resolve({ status: 200, data: {} });
        }
        // Default behavior for other authenticatedApi.post calls
        return Promise.resolve({ status: 200, data: {} });
    });
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
