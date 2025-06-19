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
    // Ensure steps are at least an empty array if not specifically tested here
    expect(stats.steps).toBeInstanceOf(Array);
  });

  describe('saveWorkProduct', () => {
    let mockStepId: string;
    let mockPluginOutput: PluginOutput[];
    let sendMessageSpy: jest.SpyInstance;

    beforeEach(() => {
      mockStepId = 'step-123';
      mockPluginOutput = [{
        success: true,
        name: 'testOutput',
        resultType: PluginParameterType.STRING,
        resultDescription: 'A test output',
        result: 'output data'
      }];

      // Ensure agent.agentPersistenceManager.saveWorkProduct is a mock
      (agent as any).agentPersistenceManager = {
        saveWorkProduct: jest.fn().mockResolvedValue(undefined),
        logEvent: jest.fn().mockResolvedValue(undefined) // also mock logEvent if called by saveWorkProduct
      };

      // Spy on the sendMessage method of the specific agent instance
      sendMessageSpy = jest.spyOn(agent as any, 'sendMessage');
    });

    afterEach(() => {
      sendMessageSpy.mockRestore();
    });

    test('should send WORK_PRODUCT_UPDATE with type "Final" and scope "MissionOutput" when isAgentEndpoint=true, hasDependentAgentsValue=false', async () => {
      (agent as any).steps = [{ id: 's1' }]; // ensure steps.length is not 1 for this specific case, unless testing single step
      await (agent as any).saveWorkProduct(mockStepId, mockPluginOutput, true, false);
      expect(sendMessageSpy).toHaveBeenCalledWith(
        MessageType.WORK_PRODUCT_UPDATE,
        'user',
        expect.objectContaining({
          id: mockStepId,
          type: 'Final',
          scope: 'MissionOutput'
        })
      );
    });

    test('should send WORK_PRODUCT_UPDATE with type "Interim" and scope "AgentOutput" when isAgentEndpoint=true, hasDependentAgentsValue=true', async () => {
      (agent as any).steps = [{ id: 's1' }, { id: 's2' }]; // Make sure steps.length > 1
      await (agent as any).saveWorkProduct(mockStepId, mockPluginOutput, true, true);
      expect(sendMessageSpy).toHaveBeenCalledWith(
        MessageType.WORK_PRODUCT_UPDATE,
        'user',
        expect.objectContaining({
          id: mockStepId,
          type: 'Interim',
          scope: 'AgentOutput'
        })
      );
    });

    test('should send WORK_PRODUCT_UPDATE with type "Interim" and scope "AgentStep" when isAgentEndpoint=false, hasDependentAgentsValue=false', async () => {
      (agent as any).steps = [{ id: 's1' }, { id: 's2' }];
      await (agent as any).saveWorkProduct(mockStepId, mockPluginOutput, false, false);
      expect(sendMessageSpy).toHaveBeenCalledWith(
        MessageType.WORK_PRODUCT_UPDATE,
        'user',
        expect.objectContaining({
          id: mockStepId,
          type: 'Interim',
          scope: 'AgentStep'
        })
      );
    });

    test('should send WORK_PRODUCT_UPDATE with type "Interim" and scope "AgentStep" when isAgentEndpoint=false, hasDependentAgentsValue=true', async () => {
      (agent as any).steps = [{ id: 's1' }, { id: 's2' }];
      await (agent as any).saveWorkProduct(mockStepId, mockPluginOutput, false, true);
      expect(sendMessageSpy).toHaveBeenCalledWith(
        MessageType.WORK_PRODUCT_UPDATE,
        'user',
        expect.objectContaining({
          id: mockStepId,
          type: 'Interim',
          scope: 'AgentStep'
        })
      );
    });

    test('should send WORK_PRODUCT_UPDATE with type "Interim" and scope "MissionOutput" for single-step agent with dependents', async () => {
      // For a single-step agent, this.steps.length will be 1.
      // Agent constructor already adds one step.
      // Re-create agent or modify steps for this specific test case.
      const singleStepAgent = new Agent(mockConfig); // mockConfig creates an agent with 1 step
      (singleStepAgent as any).agentPersistenceManager = {
        saveWorkProduct: jest.fn().mockResolvedValue(undefined),
        logEvent: jest.fn().mockResolvedValue(undefined)
      };
      const singleStepSendMessageSpy = jest.spyOn(singleStepAgent as any, 'sendMessage');

      await (singleStepAgent as any).saveWorkProduct(mockStepId, mockPluginOutput, true, true); // isAgentEndpoint=true (it's the only step), hasDependents=true

      expect(singleStepSendMessageSpy).toHaveBeenCalledWith(
        MessageType.WORK_PRODUCT_UPDATE,
        'user',
        expect.objectContaining({
          id: mockStepId,
          type: 'Interim', // Because hasDependentAgentsValue is true
          scope: 'MissionOutput' // Because steps.length is 1
        })
      );
      singleStepSendMessageSpy.mockRestore();
    });

    test('should send WORK_PRODUCT_UPDATE with type "Final" and scope "MissionOutput" for single-step agent without dependents', async () => {
      const singleStepAgent = new Agent(mockConfig);
       (singleStepAgent as any).agentPersistenceManager = {
        saveWorkProduct: jest.fn().mockResolvedValue(undefined),
        logEvent: jest.fn().mockResolvedValue(undefined)
      };
      const singleStepSendMessageSpy = jest.spyOn(singleStepAgent as any, 'sendMessage');

      await (singleStepAgent as any).saveWorkProduct(mockStepId, mockPluginOutput, true, false); // isAgentEndpoint=true, hasDependents=false

      expect(singleStepSendMessageSpy).toHaveBeenCalledWith(
        MessageType.WORK_PRODUCT_UPDATE,
        'user',
        expect.objectContaining({
          id: mockStepId,
          type: 'Final',
          scope: 'MissionOutput'
        })
      );
      singleStepSendMessageSpy.mockRestore();
    });

    test('should not send WORK_PRODUCT_UPDATE if agent status is PAUSED', async () => {
      agent.status = AgentStatus.PAUSED;
      await (agent as any).saveWorkProduct(mockStepId, mockPluginOutput, true, false);
      expect(sendMessageSpy).not.toHaveBeenCalled();
    });

    test('should not send WORK_PRODUCT_UPDATE if agent status is ABORTED', async () => {
      agent.status = AgentStatus.ABORTED;
      await (agent as any).saveWorkProduct(mockStepId, mockPluginOutput, true, false);
      expect(sendMessageSpy).not.toHaveBeenCalled();
    });
  });
});