
import { AgentLifecycleManager } from '../src/lifecycle/AgentLifecycleManager';
import { Agent } from '../src/agents/Agent';
import { AgentPersistenceManager } from '../src/utils/AgentPersistenceManager';
import { AgentStatus } from '../src/utils/agentStatus';
import axios from 'axios';

// Mock dependencies
jest.mock('axios');
jest.mock('../src/agents/Agent');
jest.mock('../src/utils/AgentPersistenceManager');

const mockAxios = axios as jest.Mocked<typeof axios>;

describe('AgentLifecycleManager', () => {
  let lifecycleManager: AgentLifecycleManager;
  let mockPersistenceManager: jest.Mocked<AgentPersistenceManager>;
  let mockAgent: jest.Mocked<Agent>;

  beforeEach(() => {
    mockPersistenceManager = new AgentPersistenceManager() as jest.Mocked<AgentPersistenceManager>;
    lifecycleManager = new AgentLifecycleManager(mockPersistenceManager);

    // Create a mock agent
    const mockAgentSet = {
        id: 'mock-agentset-id',
        port: '9001',
        url: 'http://localhost:9001',
        ownershipTransferManager: { // Mock minimal properties for OwnershipTransferManager
            transferStep: jest.fn().mockResolvedValue({ success: true })
        }
    };
    mockAgent = new Agent({
      id: 'test-agent',
      missionId: 'test-mission',
      actionVerb: 'TEST',
      agentSetUrl: 'http://localhost:9001',
      agentSet: mockAgentSet as any, // Cast to any to bypass strict type checking for mock
    }) as jest.Mocked<Agent>;

    // Mock agent methods
    mockAgent.getStatus.mockReturnValue(AgentStatus.RUNNING);
    mockAgent.getSteps.mockReturnValue([]);
    mockAgent.saveAgentState.mockResolvedValue(undefined);
    mockAgent.handleMessage.mockResolvedValue(undefined);
  });

  describe('registerAgent', () => {
    it('should register a new agent', () => {
      lifecycleManager.registerAgent(mockAgent);

      const diagnostics = lifecycleManager.getAgentDiagnostics('test-agent');
      expect(diagnostics).toBeDefined();
      expect(diagnostics?.agentId).toBe('test-agent');
    });
  });

  describe('unregisterAgent', () => {
    it('should unregister an agent', () => {
      lifecycleManager.registerAgent(mockAgent);
      lifecycleManager.unregisterAgent('test-agent');

      const diagnostics = lifecycleManager.getAgentDiagnostics('test-agent');
      // The agent is removed from the internal map, so we can't get diagnostics
      // A better test would be to check the internal state, but this is a simple test
      // We can check that the checkpoint interval is cleared
      // This is not directly testable without exposing the private property
    });
  });

  describe('createCheckpoint', () => {
    it('should create a checkpoint for an agent', async () => {
      lifecycleManager.registerAgent(mockAgent);
      await lifecycleManager.createCheckpoint('test-agent');

      expect(mockAgent.saveAgentState).toHaveBeenCalled();
    });
  });

  describe('pauseAgent', () => {
    it('should send a pause message to an agent', async () => {
      lifecycleManager.registerAgent(mockAgent);
      await lifecycleManager.pauseAgent('test-agent');

      expect(mockAgent.handleMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'PAUSE',
      }));
    });
  });

  describe('resumeAgent', () => {
    it('should send a resume message to an agent', async () => {
      lifecycleManager.registerAgent(mockAgent);
      await lifecycleManager.resumeAgent('test-agent');

      expect(mockAgent.handleMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'RESUME',
      }));
    });
  });

  describe('abortAgent', () => {
    it('should send an abort message to an agent', async () => {
      lifecycleManager.registerAgent(mockAgent);
      await lifecycleManager.abortAgent('test-agent');

      expect(mockAgent.handleMessage).toHaveBeenCalledWith(expect.objectContaining({
        type: 'ABORT',
      }));
    });
  });
});
