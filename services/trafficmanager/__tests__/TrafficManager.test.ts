import { TrafficManager } from '../src/TrafficManager';
import express from 'express';
import axios from 'axios';
import { agentSetManager } from '../src/utils/agentSetManager';
import { dependencyManager } from '../src/utils/dependencyManager';
import { updateAgentStatus, AgentStatus } from '../src/utils/status';
import { v4 as uuidv4 } from 'uuid';

jest.mock('axios');
jest.mock('../src/utils/agentSetManager');
jest.mock('../src/utils/dependencyManager');
jest.mock('../src/utils/status');
jest.mock('uuid');

describe('TrafficManager', () => {
  let trafficManager: TrafficManager;
  let mockRequest: Partial<express.Request>;
  let mockResponse: Partial<express.Response>;

  beforeEach(() => {
    trafficManager = new TrafficManager();
    mockRequest = {
      body: {},
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
    it('should create an agent successfully when dependencies are satisfied', async () => {
      const mockAgentId = 'mock-agent-id';
      (uuidv4 as jest.Mock).mockReturnValue(mockAgentId);
      (dependencyManager.registerDependencies as jest.Mock).mockResolvedValue(undefined);
      (agentSetManager.assignAgentToSet as jest.Mock).mockResolvedValue({ success: true });

      mockRequest.body = {
        actionVerb: 'TEST',
        goal: 'Test goal',
        args: {},
        dependencies: ['dep1', 'dep2'],
        missionId: 'mission-1',
      };

      await trafficManager['createAgent'](mockRequest as express.Request, mockResponse as express.Response);

      expect(dependencyManager.registerDependencies).toHaveBeenCalledWith(mockAgentId, ['dep1', 'dep2']);
      expect(agentSetManager.assignAgentToSet).toHaveBeenCalledWith(mockAgentId, 'TEST', 'Test goal', {}, 'mission-1');
      expect(updateAgentStatus).toHaveBeenCalledWith(mockAgentId, AgentStatus.RUNNING);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.send).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Agent created and assigned.',
        agentId: mockAgentId,
      }));
    });

    it('should create an agent in PAUSED state when dependencies are not satisfied', async () => {
      const mockAgentId = 'mock-agent-id';
      (uuidv4 as jest.Mock).mockReturnValue(mockAgentId);
      (dependencyManager.registerDependencies as jest.Mock).mockResolvedValue(undefined);
      (trafficManager as any).checkDependenciesRecursive = jest.fn().mockResolvedValue(false);

      mockRequest.body = {
        actionVerb: 'TEST',
        goal: 'Test goal',
        args: {},
        dependencies: ['dep1', 'dep2'],
        missionId: 'mission-1',
      };

      await trafficManager['createAgent'](mockRequest as express.Request, mockResponse as express.Response);

      expect(dependencyManager.registerDependencies).toHaveBeenCalledWith(mockAgentId, ['dep1', 'dep2']);
      expect(updateAgentStatus).toHaveBeenCalledWith(mockAgentId, AgentStatus.PAUSED);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.send).toHaveBeenCalledWith({
        message: 'Agent created but waiting for dependencies.',
        agentId: mockAgentId,
      });
    });
  });

  describe('checkDependenciesRecursive', () => {
    it('should return true when there are no dependencies', async () => {
      (dependencyManager.getDependencies as jest.Mock).mockResolvedValue([]);

      const result = await trafficManager['checkDependenciesRecursive']('agent-1');

      expect(result).toBe(true);
    });

    it('should return true when all dependencies are completed', async () => {
      (dependencyManager.getDependencies as jest.Mock).mockResolvedValue(['dep1', 'dep2']);
      (trafficManager as any).getAgentStatus = jest.fn()
        .mockResolvedValueOnce(AgentStatus.COMPLETED)
        .mockResolvedValueOnce(AgentStatus.COMPLETED);

      const result = await trafficManager['checkDependenciesRecursive']('agent-1');

      expect(result).toBe(true);
    });

    it('should return false when a dependency is not completed', async () => {
      (dependencyManager.getDependencies as jest.Mock).mockResolvedValue(['dep1', 'dep2']);
      (trafficManager as any).getAgentStatus = jest.fn()
        .mockResolvedValueOnce(AgentStatus.COMPLETED)
        .mockResolvedValueOnce(AgentStatus.RUNNING);

      const result = await trafficManager['checkDependenciesRecursive']('agent-1');

      expect(result).toBe(false);
    });
  });

  describe('getAgentStatistics', () => {
    it('should return agent statistics for a given mission', async () => {
      const mockMissionId = 'mission-1';
      const mockAgentSetManagerStats = {
        totalAgentsCount: 5,
        agentSetsCount: 2,
        agentsByStatus: new Map([
          ['running', ['agent1', 'agent2']],
          ['completed', ['agent3', 'agent4', 'agent5']],
        ]),
      };

      (agentSetManager.getAgentStatistics as jest.Mock).mockResolvedValue(mockAgentSetManagerStats);

      mockRequest.params = { missionId: mockMissionId };

      await trafficManager['getAgentStatistics'](mockRequest as express.Request, mockResponse as express.Response);

      expect(agentSetManager.getAgentStatistics).toHaveBeenCalledWith(mockMissionId);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        agentStatisticsByType: {
          totalAgents: 5,
          agentCountByStatus: { running: 2, completed: 3 },
          agentSetCount: 2,
        },
        runningAgentStatistics: {
          runningAgentsCount: 2,
          runningAgents: ['agent1', 'agent2'],
        },
      });
    });

    it('should return an error when missionId is not provided', async () => {
      mockRequest.params = {};

      await trafficManager['getAgentStatistics'](mockRequest as express.Request, mockResponse as express.Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.send).toHaveBeenCalledWith('Missing missionId parameter');
    });
  });
});