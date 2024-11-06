import { TrafficManager } from '../src/TrafficManager';
import express from 'express';
import axios from 'axios';
import { agentSetManager } from '../src/utils/agentSetManager';
import { dependencyManager } from '../src/utils/dependencyManager';
import { AgentStatus } from '../src/utils/status';
import { v4 as uuidv4 } from 'uuid';

jest.mock('axios');
jest.mock('../src/utils/agentSetManager');
jest.mock('../src/utils/dependencyManager');
jest.mock('uuid');

describe('TrafficManager', () => {
  let trafficManager: TrafficManager;
  let mockRequest: Partial<express.Request>;
  let mockResponse: Partial<express.Response>;

  beforeEach(() => {
    trafficManager = new TrafficManager();
    mockRequest = {
      body: {},
      params: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createAgent', () => {
    it('should create an agent successfully', async () => {
      const mockAgentId = 'mock-agent-id';
      (uuidv4 as jest.Mock).mockReturnValue(mockAgentId);
      (dependencyManager.registerDependencies as jest.Mock).mockResolvedValue(undefined);
      (agentSetManager.assignAgentToSet as jest.Mock).mockResolvedValue({ success: true });

      mockRequest.body = {
        actionVerb: 'TEST',
        inputs: { input1: 'value1' },
        missionId: 'mission-1',
        missionContext: 'test context',
      };

      await trafficManager['createAgent'](mockRequest as express.Request, mockResponse as express.Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.send).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Agent created and assigned.',
        agentId: mockAgentId,
      }));
    });
  });

  describe('checkDependenciesRecursive', () => {
    it('should return true when all dependencies are satisfied', async () => {
      (dependencyManager.getDependencies as jest.Mock).mockResolvedValue(['dep1', 'dep2']);
      (trafficManager as any).getAgentStatus = jest.fn()
        .mockResolvedValueOnce(AgentStatus.COMPLETED)
        .mockResolvedValueOnce(AgentStatus.COMPLETED);

      const result = await trafficManager['checkDependenciesRecursive']('agent1');

      expect(result).toBe(true);
    });

    it('should return false when a dependency is not satisfied', async () => {
      (dependencyManager.getDependencies as jest.Mock).mockResolvedValue(['dep1', 'dep2']);
      (trafficManager as any).getAgentStatus = jest.fn()
        .mockResolvedValueOnce(AgentStatus.COMPLETED)
        .mockResolvedValueOnce(AgentStatus.RUNNING);

      const result = await trafficManager['checkDependenciesRecursive']('agent1');

      expect(result).toBe(false);
    });
  });

  describe('getAgentStatistics', () => {
    it('should return agent statistics for a given mission', async () => {
      const mockMissionId = 'mission-1';
      mockRequest.params = { missionId: mockMissionId };

      const mockAgentSetStatistics = {
        totalAgentsCount: 5,
        agentSetsCount: 2,
        agentsByStatus: new Map([
          ['running', ['agent1', 'agent2']],
          ['completed', ['agent3', 'agent4', 'agent5']],
        ]),
      };

      (agentSetManager.getAgentStatistics as jest.Mock).mockResolvedValue(mockAgentSetStatistics);

      await trafficManager['getAgentStatistics'](mockRequest as express.Request, mockResponse as express.Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(expect.objectContaining({
        agentStatisticsByType: {
          totalAgents: 5,
          agentCountByStatus: { running: 2, completed: 3 },
          agentSetCount: 2,
        },
        runningAgentStatistics: {
          runningAgentsCount: 2,
          runningAgents: ['agent1', 'agent2'],
        },
      }));
    });
  });
});