import { AgentSet } from '../src/AgentSet';
import { Agent } from '../src/agents/Agent';
import { AgentStatus } from '../src/utils/agentStatus';
import axios from 'axios';
import express from 'express';

jest.mock('axios');
jest.mock('../src/agents/Agent');
jest.mock('express', () => {
  const mockExpress = {
    json: jest.fn(),
    listen: jest.fn(),
    post: jest.fn(),
    get: jest.fn(),
  };
  return jest.fn(() => mockExpress);
});

describe('AgentSet', () => {
  let agentSet: AgentSet;
  const mockAgent = {
    id: 'test-agent-id',
    pause: jest.fn(),
    resume: jest.fn(),
    abort: jest.fn(),
    handleMessage: jest.fn(),
    getMissionId: jest.fn(),
    getStatus: jest.fn(),
    getStatistics: jest.fn(),
    getOutput: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (Agent as jest.Mock).mockImplementation(() => mockAgent);
    agentSet = new AgentSet();
  });

  test('addAgent adds a new agent to the set', async () => {
    const req = {
      body: {
        agentId: 'test-agent-id',
        actionVerb: 'TEST',
        inputValue: 'test',
        args: {},
        capabilitiesManagerUrl: 'http://test.com',
        trafficManagerUrl: 'http://test.com',
        missionId: 'test-mission',
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await (agentSet as any).initializeServer().post('/addAgent')(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ message: 'Agent added', agentId: 'test-agent-id' });
    expect(agentSet.agents.size).toBe(1);
  });

  test('pauseAgents pauses all agents in the set', async () => {
    agentSet.agents.set('test-agent-id', mockAgent as unknown as Agent);
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await (agentSet as any).initializeServer().post('/pauseAgents')(req, res);

    expect(mockAgent.pause).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ message: 'All agents paused' });
  });

  test('resumeAgents resumes all agents in the set', async () => {
    agentSet.agents.set('test-agent-id', mockAgent as unknown as Agent);
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await (agentSet as any).initializeServer().post('/resumeAgents')(req, res);

    expect(mockAgent.resume).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ message: 'All agents resumed' });
  });

  test('abortAgents aborts all agents in the set', async () => {
    agentSet.agents.set('test-agent-id', mockAgent as unknown as Agent);
    const req = {};
    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
    };

    await (agentSet as any).initializeServer().post('/abortAgents')(req, res);

    expect(mockAgent.abort).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.send).toHaveBeenCalledWith({ message: 'All agents aborted' });
  });

  test('getAgentStatistics returns statistics for agents in a mission', async () => {
    agentSet.agents.set('test-agent-id', mockAgent as unknown as Agent);
    mockAgent.getMissionId.mockReturnValue('test-mission');
    mockAgent.getStatus.mockReturnValue(AgentStatus.RUNNING);
    mockAgent.getStatistics.mockResolvedValue({ id: 'test-agent-id', status: AgentStatus.RUNNING });

    const req = { params: { missionId: 'test-mission' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await (agentSet as any).getAgentStatistics(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      agentsCount: 1,
      agentsByStatus: expect.objectContaining({
        [AgentStatus.RUNNING]: [{ id: 'test-agent-id', status: AgentStatus.RUNNING }]
      })
    }));
  });

  test('getAgentOutput returns output for a specific agent', async () => {
    agentSet.agents.set('test-agent-id', mockAgent as unknown as Agent);
    mockAgent.getOutput.mockReturnValue('Test output');

    const req = { params: { agentId: 'test-agent-id' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await (agentSet as any).getAgentOutput(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ output: 'Test output' });
  });
});