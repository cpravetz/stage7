import { AgentSet } from '../src/AgentSet';
import { Agent } from '../src/agents/Agent';
import { AgentPersistenceManager } from '../src/utils/AgentPersistenceManager';
import express from 'express';
import axios from 'axios';

jest.mock('../src/agents/Agent');
jest.mock('../src/utils/AgentPersistenceManager');
jest.mock('../src/lifecycle/AgentLifecycleManager'); // Mock AgentLifecycleManager
jest.mock('axios');


describe('AgentSet', () => {
  let agentSet: AgentSet;
  let mockLifecycleManagerInstance: jest.Mocked<any>; // Store the mock instance

  beforeEach(() => {
    // Create a mock instance of AgentLifecycleManager
    // We can't get the actual instance from agentSet easily without making it public or having a getter
    // So, we will spy on the one that gets created if possible, or ensure methods are mocked on the class itself.
    // For now, let's assume AgentSet constructor creates its own, and we'll test its effects.
    // To assert calls on lifecycleManager, we'd typically inject it or spy on its prototype.
    // Given the current structure, we will mock the prototype for unregisterAgent.
    mockLifecycleManagerInstance = {
      registerAgent: jest.fn(),
      unregisterAgent: jest.fn(),
      pauseAgent: jest.fn(),
      resumeAgent: jest.fn(),
      createCheckpoint: jest.fn(),
      // Add other methods if they are called and need mocking
    };

    // If AgentLifecycleManager is instantiated within AgentSet, this direct mock might be tricky.
    // A common pattern is to mock the constructor of the dependency.
    // jest.spyOn(AgentLifecycleManager.prototype, 'unregisterAgent').mockImplementation(jest.fn());
    // This doesn't work as AgentLifecycleManager is not a class in this mock scope.
    // So we mock the module:
    const { AgentLifecycleManager: MockedLifecycleManager } = jest.requireMock('../src/lifecycle/AgentLifecycleManager');
    MockedLifecycleManager.mockImplementation(() => mockLifecycleManagerInstance);


    agentSet = new AgentSet();
    // Assign the specific mock instance to the agentSet instance for direct checking if possible,
    // or ensure the prototype mock is in place.
    // This assignment is to make sure OUR mock instance is used by agentSet.
    (agentSet as any).lifecycleManager = mockLifecycleManagerInstance;


    (Agent as jest.Mock).mockClear();
    (AgentPersistenceManager as jest.Mock).mockClear();
    (axios.post as jest.Mock).mockClear();
    mockLifecycleManagerInstance.unregisterAgent.mockClear(); // Clear mock calls for lifecycleManager
  });

  describe('addAgent', () => {
    it('should add a new agent and return its ID', async () => {
      const mockReq = {
        body: {
          agentId: 'test-agent-id',
          actionVerb: 'TEST_ACTION',
          inputs: { key: 'value' },
          missionId: 'test-mission-id',
          missionContext: 'test-context'
        }
      } as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as unknown as express.Response;

      await (agentSet as any).addAgent(mockReq, mockRes);

      expect(Agent).toHaveBeenCalledWith(expect.objectContaining({
        id: 'test-agent-id',
        actionVerb: 'TEST_ACTION',
        missionId: 'test-mission-id'
      }));
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Agent added',
        agentId: expect.any(String)
      }));
    });
  });

  describe('handleAgentMessage', () => {
    it('should handle a message for an existing agent', async () => {
      const mockAgent = {
        handleMessage: jest.fn().mockResolvedValue(undefined)
      };
      (agentSet as any).agents.set('test-agent-id', mockAgent);

      const mockReq = {
        params: { agentId: 'test-agent-id' },
        body: { content: 'test message' }
      } as unknown as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as unknown as express.Response;

      await (agentSet as any).handleAgentMessage(mockReq, mockRes);

      expect(mockAgent.handleMessage).toHaveBeenCalledWith({ content: 'test message' });
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith({ status: 'Message delivered to agent' });
    });

    it('should return 404 for non-existent agent', async () => {
      const mockReq = {
        params: { agentId: 'non-existent-agent' },
        body: { content: 'test message' }
      } as unknown as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn()
      } as unknown as express.Response;

      await (agentSet as any).handleAgentMessage(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.send).toHaveBeenCalledWith({ error: 'Agent not found' });
    });
  });

  describe('getAgentStatistics', () => {
    it('should return statistics for agents in a mission', async () => {
      const mockAgent1 = {
        getMissionId: jest.fn().mockReturnValue('test-mission'),
        getStatus: jest.fn().mockReturnValue('ACTIVE'),
        getStatistics: jest.fn().mockResolvedValue({ someStats: 'value' })
      };
      const mockAgent2 = {
        getMissionId: jest.fn().mockReturnValue('test-mission'),
        getStatus: jest.fn().mockReturnValue('IDLE'),
        getStatistics: jest.fn().mockResolvedValue({ someOtherStats: 'value' })
      };
      (agentSet as any).agents.set('agent1', mockAgent1);
      (agentSet as any).agents.set('agent2', mockAgent2);

      const mockReq = {
        params: { missionId: 'test-mission' }
      } as unknown as express.Request;
      const mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as unknown as express.Response;

      await (agentSet as any).getAgentStatistics(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      // The actual data structure is a Map which gets serialized.
      // For testing, we might need to check the structure after MapSerializer.transformForSerialization
      // or trust that the Map content is correct.
      const responseData = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(responseData.agentsCount).toBe(2);

      // Deserialize for easier checking if it was serialized by the method
      // const deserializedAgentsByStatus = new Map(Object.entries(responseData.agentsByStatus.value));
      // For now, let's assume the structure is okay if counts match and it's an object.
      expect(typeof responseData.agentsByStatus).toBe('object'); // Serialized Map
    });
  });

  describe('removeAgentFromSet', () => {
    it('should remove an agent from the agents map and unregister it from lifecycleManager', async () => {
      const mockAgentId = 'agent-to-remove';
      const mockAgentInstance = { id: mockAgentId, missionId: 'mission1' };
      (agentSet as any).agents.set(mockAgentId, mockAgentInstance as any);

      // Spy on lifecycleManager.unregisterAgent before calling removeAgentFromSet
      // This is already done by using the mocked instance.

      await (agentSet as any).removeAgentFromSet(mockAgentId, 'completed');

      expect((agentSet as any).agents.has(mockAgentId)).toBe(false);
      expect(mockLifecycleManagerInstance.unregisterAgent).toHaveBeenCalledWith(mockAgentId);
    });

    it('should log a warning if agent to remove is not found', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const mockAgentId = 'non-existent-agent-for-removal';

      await (agentSet as any).removeAgentFromSet(mockAgentId, 'completed');

      expect((agentSet as any).agents.has(mockAgentId)).toBe(false);
      expect(mockLifecycleManagerInstance.unregisterAgent).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Agent ${mockAgentId} not found in AgentSet during removal attempt`));
      consoleWarnSpy.mockRestore();
    });
  });

  describe('POST /removeAgent endpoint', () => {
    it('should call removeAgentFromSet and return 200 on success', async () => {
        const agentIdToRemove = 'test-agent-id-remove-endpoint';
        const status = 'completed';
        // Mock removeAgentFromSet to check if it's called
        const removeAgentFromSetSpy = jest.spyOn(agentSet as any, 'removeAgentFromSet').mockResolvedValue(undefined);

        const mockReq = {
            body: { agentId: agentIdToRemove, status: status }
        } as express.Request;
        const mockRes = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        } as unknown as express.Response;

        // Find the handler for /removeAgent
        const removeAgentHandler = (agentSet as any).app.post.mock.calls.find(
            (call: any) => call[0] === '/removeAgent'
        )?.[1];

        expect(removeAgentHandler).toBeDefined();
        await removeAgentHandler(mockReq, mockRes, jest.fn()); // Call with mock next function

        expect(removeAgentFromSetSpy).toHaveBeenCalledWith(agentIdToRemove, status);
        expect(mockRes.status).toHaveBeenCalledWith(200);
        expect(mockRes.send).toHaveBeenCalledWith({ message: `Agent ${agentIdToRemove} processed for removal with status ${status}.` });

        removeAgentFromSetSpy.mockRestore();
    });

     it('should return 400 if agentId or status is missing', async () => {
        const mockReq = { body: {} } as express.Request; // Missing agentId and status
        const mockRes = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        } as unknown as express.Response;

        const removeAgentHandler = (agentSet as any).app.post.mock.calls.find(
            (call: any) => call[0] === '/removeAgent'
        )?.[1];

        await removeAgentHandler(mockReq, mockRes, jest.fn());

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.send).toHaveBeenCalledWith({ error: 'agentId and status are required for removal' });
    });
  });


  describe('abortMissionAgents', () => {
    it('should call abort on agents matching the missionId and subsequently remove them', async () => {
      const targetMissionId = 'mission-to-abort';
      const otherMissionId = 'other-mission';

      const mockAgent1 = { id: 'agent1', getMissionId: () => targetMissionId, abort: jest.fn() };
      const mockAgent2 = { id: 'agent2', getMissionId: () => otherMissionId, abort: jest.fn() };
      const mockAgent3 = { id: 'agent3', getMissionId: () => targetMissionId, abort: jest.fn() };

      // Simulate Agent.abort() calling back to removeAgentFromSet
      mockAgent1.abort.mockImplementation(async () => { await (agentSet as any).removeAgentFromSet(mockAgent1.id, 'aborted'); });
      mockAgent3.abort.mockImplementation(async () => { await (agentSet as any).removeAgentFromSet(mockAgent3.id, 'aborted'); });


      (agentSet as any).agents.set(mockAgent1.id, mockAgent1 as any);
      (agentSet as any).agents.set(mockAgent2.id, mockAgent2 as any);
      (agentSet as any).agents.set(mockAgent3.id, mockAgent3 as any);

      // Register with lifecycle manager so unregister can be checked
      mockLifecycleManagerInstance.registerAgent.mockImplementation((agent: any) => {}); // Dummy mock
      (agentSet as any).lifecycleManager.registerAgent(mockAgent1 as any);
      (agentSet as any).lifecycleManager.registerAgent(mockAgent2 as any);
      (agentSet as any).lifecycleManager.registerAgent(mockAgent3 as any);


      const mockReq = { body: { missionId: targetMissionId } } as express.Request;
      const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

      await (agentSet as any).abortMissionAgents(mockReq, mockRes);

      expect(mockAgent1.abort).toHaveBeenCalledTimes(1);
      expect(mockAgent3.abort).toHaveBeenCalledTimes(1);
      expect(mockAgent2.abort).not.toHaveBeenCalled();

      expect((agentSet as any).agents.has(mockAgent1.id)).toBe(false);
      expect((agentSet as any).agents.has(mockAgent3.id)).toBe(false);
      expect((agentSet as any).agents.has(mockAgent2.id)).toBe(true); // Agent from other mission should remain

      expect(mockLifecycleManagerInstance.unregisterAgent).toHaveBeenCalledWith(mockAgent1.id);
      expect(mockLifecycleManagerInstance.unregisterAgent).toHaveBeenCalledWith(mockAgent3.id);
      expect(mockLifecycleManagerInstance.unregisterAgent).not.toHaveBeenCalledWith(mockAgent2.id);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.send).toHaveBeenCalledWith({ message: `2 agents for mission ${targetMissionId} have been signaled to abort.` });
    });

    it('should return 400 if missionId is not provided to abortMissionAgents', async () => {
        const mockReq = { body: {} } as express.Request;
        const mockRes = { status: jest.fn().mockReturnThis(), send: jest.fn() } as unknown as express.Response;

        await (agentSet as any).abortMissionAgents(mockReq, mockRes);
        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.send).toHaveBeenCalledWith({ error: 'missionId is required to abort agents.' });
    });
  });

});