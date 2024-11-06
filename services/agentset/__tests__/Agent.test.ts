import { Agent, AgentConfig } from '../src/agents/Agent';
import axios from 'axios';
import { AgentStatus } from '../src/utils/agentStatus';
import { PluginInput, PluginOutput, PluginParameterType } from '@cktmcs/shared';

jest.mock('axios');
jest.mock('../src/utils/postOffice');
jest.mock('../src/utils/AgentPersistenceManager');

describe('Agent', () => {
  let agent: Agent;
  let mockConfig: AgentConfig;

  beforeEach(() => {
    mockConfig = {
      actionVerb: 'TEST',
      inputs: new Map(),
      missionId: 'test-mission',
      dependencies: [],
      postOfficeUrl: 'test-postoffice:5000',
      agentSetUrl: 'test-agentset:5001',
      id: 'test-agent-id',
      missionContext: 'Test mission context'
    };

    (axios.create as jest.Mock).mockReturnValue({
      post: jest.fn().mockResolvedValue({ data: {} }),
      get: jest.fn().mockResolvedValue({ data: {} })
    });

    agent = new Agent(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('Agent initialization', () => {
    expect(agent.id).toBe('test-agent-id');
    expect(agent.status).toBe(AgentStatus.INITIALIZING);
    expect(agent.missionId).toBe('test-mission');
  });

  test('Agent runAgent method', async () => {
    const runAgentSpy = jest.spyOn(agent as any, 'runAgent');
    await (agent as any).initializeAgent();
    expect(runAgentSpy).toHaveBeenCalled();
    expect(agent.status).toBe(AgentStatus.RUNNING);
  });

  test('Agent processStep method', async () => {
    const mockStep = {
      id: 'test-step-id',
      stepNo: 1,
      actionVerb: 'TEST',
      inputs: new Map<string, PluginInput>(),
      dependencies: new Map<string, number>(),
      status: 'pending',
      result: undefined
    };

    const mockPluginOutput: PluginOutput = {
      success: true,
      resultType: PluginParameterType.STRING,
      resultDescription: 'Test result',
      result: 'Test output',
      mimeType: 'text/plain'
    };

    (agent as any).executeActionWithCapabilitiesManager = jest.fn().mockResolvedValue(mockPluginOutput);

    await (agent as any).processStep(mockStep);

    expect(mockStep.status).toBe('completed');
    expect(mockStep.result).toBe('Test output');
  });

  test('Agent handleMessage method', async () => {
    const mockMessage = {
      type: 'ANSWER',
      content: { answer: 'Test answer', questionGuid: 'test-guid' }
    };

    agent.questions = ['test-guid'];
    (agent as any).currentQuestionResolve = jest.fn();

    await agent.handleMessage(mockMessage);

    expect(agent.questions).not.toContain('test-guid');
    expect((agent as any).currentQuestionResolve).toHaveBeenCalledWith('Test answer');
  });

  test('Agent pause and resume methods', async () => {
    await agent.pause();
    expect(agent.status).toBe(AgentStatus.PAUSED);

    await agent.resume();
    expect(agent.status).toBe(AgentStatus.RUNNING);
  });

  test('Agent abort method', async () => {
    await agent.abort();
    expect(agent.status).toBe(AgentStatus.ABORTED);
  });

  test('Agent getStatistics method', async () => {
    const stats = await agent.getStatistics();
    expect(stats.id).toBe('test-agent-id');
    expect(stats.status).toBe(agent.status);
  });
});