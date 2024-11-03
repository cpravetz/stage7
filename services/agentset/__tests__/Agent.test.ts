import { Agent } from '../src/agents/Agent';
import axios from 'axios';
import { AgentStatus } from '../src/utils/agentStatus';

jest.mock('axios');
jest.mock('uuid', () => ({ v4: () => 'mocked-uuid' }));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Agent', () => {
  let agent: Agent;
  const mockConfig = {
    actionVerb: 'TEST',
    inputValue: 'test-inputValue',
    args: { testArg: 'value' },
    missionId: 'test-mission',
    dependencies: [],
    postOfficeUrl: 'test-postoffice-url',
    id: 'test-agent-id',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockedAxios.create.mockReturnValue(mockedAxios);
    mockedAxios.post.mockResolvedValue({ data: {} });
    mockedAxios.get.mockResolvedValue({ data: {} });
    agent = new Agent(mockConfig);
  });

  test('Agent initialization', () => {
    expect(agent.getMissionId()).toBe('test-mission');
    expect(agent.getStatus()).toBe(AgentStatus.INITIALIZING);
  });

  test('Agent runAgent method', async () => {
    await agent['runAgent']();
    expect(agent.getStatus()).toBe(AgentStatus.COMPLETED);
  });

  test('Agent handleMessage method', async () => {
    const mockMessage = { type: 'TEST_MESSAGE', content: 'test content' };
    await agent.handleMessage(mockMessage);
    // Add assertions based on expected behavior
  });

  test('Agent pause method', async () => {
    await agent.pause();
    expect(agent.getStatus()).toBe(AgentStatus.PAUSED);
  });

  test('Agent resume method', async () => {
    await agent.pause();
    await agent.resume();
    expect(agent.getStatus()).toBe(AgentStatus.RUNNING);
  });

  test('Agent abort method', async () => {
    await agent.abort();
    expect(agent.getStatus()).toBe(AgentStatus.ABORTED);
  });

  test('Agent getStatistics method', async () => {
    const stats = await agent.getStatistics();
    expect(stats).toHaveProperty('id', 'test-agent-id');
    expect(stats).toHaveProperty('status');
    expect(stats).toHaveProperty('taskCount');
    expect(stats).toHaveProperty('currenTaskNo');
    expect(stats).toHaveProperty('currentTaskVerb');
  });

  test('Agent processStep method', async () => {
    const mockStep = {
      id: 'test-step-id',
      stepNo: 1,
      actionVerb: 'TEST',
      inputValue: 'test-inputValue',
      args: {},
      dependencies: [],
      status: 'pending' as const,
    };

    mockedAxios.post.mockResolvedValueOnce({ 
      data: { 
        success: true, 
        resultType: 'object', 
        result: { test: 'result' } 
      } 
    });

    await agent['processStep'](mockStep);
    expect(mockStep.status).toBe('completed');
  });

  // Add more tests for other methods as needed
});