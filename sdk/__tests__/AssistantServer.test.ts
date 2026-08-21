import request from 'supertest';
import { Assistant } from '../src/Assistant';
import { createAssistantServer } from '../src/AssistantServer';
import { ICoreEngineClient } from '../src/types';

describe('AssistantServer Multi-Instance / Multi-Client Support', () => {
  let mockCoreEngineClient: jest.Mocked<ICoreEngineClient>;
  let assistant: Assistant;

  beforeEach(() => {
    mockCoreEngineClient = {
      startMission: jest.fn().mockResolvedValue('mission-123'),
      sendMessageToMission: jest.fn().mockResolvedValue(undefined),
      submitHumanInputToMission: jest.fn().mockResolvedValue(undefined),
      getMissionHistory: jest.fn().mockResolvedValue([]),
      getMissionDetails: jest.fn().mockResolvedValue({ id: 'mission-123', name: 'Test', status: 'active' }),
      executeTool: jest.fn().mockResolvedValue({ success: true }),
      requestHumanInput: jest.fn().mockResolvedValue('req-1'),
      onMissionEvent: jest.fn().mockReturnValue(() => {}),
      getContext: jest.fn().mockResolvedValue({}),
      updateContext: jest.fn().mockResolvedValue(undefined),
      endMission: jest.fn().mockResolvedValue(undefined),
    };

    assistant = new Assistant({
      id: 'test-assistant',
      name: 'Test Assistant',
      role: 'Testing',
      personality: 'Helpful',
      coreEngineClient: mockCoreEngineClient,
    });

    jest.spyOn(assistant as any, 'getSimpleResponse').mockResolvedValue({ escalate: true, reason: 'Escalating for test' });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should accept instanceId, userId, and missionContext when starting conversations for multi-client support', async () => {
    const app = createAssistantServer(assistant);

    const response = await request(app)
      .post('/conversations')
      .send({
        initialPrompt: 'Help me with client A',
        clientId: 'client-A',
        userId: 'user-1',
        instanceId: 'virtual-instance-A',
        missionContext: 'Context A'
      });

    expect(response.status).toBe(201);
    expect(response.body.id).toBe('mission-123');

    expect(mockCoreEngineClient.startMission).toHaveBeenCalledWith(
      'Help me with client A',
      'test-assistant',
      [],
      'client-A',
      {
        userId: 'user-1',
        agentClass: 'test-assistant',
        instanceId: 'virtual-instance-A',
        missionContext: 'Context A'
      }
    );

    const session = assistant.getActiveSessions().get('mission-123');
    expect(session).toBeDefined();
    expect(session?.frontendClientId).toBe('client-A');
    expect(session?.userId).toBe('user-1');
    expect(session?.instanceId).toBe('virtual-instance-A');
  });

  it('should manage isolated concurrent sessions for multiple distinct clients/instances', async () => {
    const app = createAssistantServer(assistant);

    mockCoreEngineClient.startMission
      .mockResolvedValueOnce('mission-client-1')
      .mockResolvedValueOnce('mission-client-2');

    const res1 = await request(app)
      .post('/conversations')
      .send({
        initialPrompt: 'Task for Client 1',
        clientId: 'client-1',
        instanceId: 'inst-1',
      });

    const res2 = await request(app)
      .post('/conversations')
      .send({
        initialPrompt: 'Task for Client 2',
        clientId: 'client-2',
        instanceId: 'inst-2',
      });

    expect(res1.body.id).toBe('mission-client-1');
    expect(res2.body.id).toBe('mission-client-2');

    const sessions = assistant.getActiveSessions();
    expect(sessions.size).toBe(2);
    expect(sessions.get('mission-client-1')?.instanceId).toBe('inst-1');
    expect(sessions.get('mission-client-2')?.instanceId).toBe('inst-2');
  });
});
