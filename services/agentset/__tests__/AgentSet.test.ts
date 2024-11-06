import { AgentSet } from '../src/AgentSet';
import { Agent } from '../src/agents/Agent';
import { AgentPersistenceManager } from '../src/utils/AgentPersistenceManager';
import express from 'express';
import axios from 'axios';

jest.mock('../src/agents/Agent');
jest.mock('../src/utils/AgentPersistenceManager');
jest.mock('axios');

describe('AgentSet', () => {
  let agentSet: AgentSet;

  beforeEach(() => {
    agentSet = new AgentSet();
    (Agent as jest.Mock).mockClear();
    (AgentPersistenceManager as jest.Mock).mockClear();
    (axios.post as jest.Mock).mockClear();
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
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        agentsCount: 2,
        agentsByStatus: expect.objectContaining({
          ACTIVE: [{ someStats: 'value' }],
          IDLE: [{ someOtherStats: 'value' }]
        })
      }));
    });
  });
});