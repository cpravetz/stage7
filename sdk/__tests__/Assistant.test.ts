import { Assistant, AssistantConfig, ChatSession } from '../src/Assistant';
import { Tool } from '../src/Tool';
import { Conversation } from '../src/Conversation';
import { ICoreEngineClient, ConversationMessage } from '../src/types';

describe('Assistant', () => {
  let mockCoreEngineClient: jest.Mocked<ICoreEngineClient>;
  let assistantConfig: AssistantConfig;

  beforeEach(() => {
    mockCoreEngineClient = {
      startMission: jest.fn(),
      sendMessageToMission: jest.fn(),
      submitHumanInputToMission: jest.fn(),
      getMissionHistory: jest.fn(),
      onMissionEvent: jest.fn(),
      requestHumanInput: jest.fn(), // Added for HumanInTheLoop interaction
      getContext: jest.fn(),
      updateContext: jest.fn(),
      endMission: jest.fn(),
      executeTool: jest.fn(),
    };

    assistantConfig = {
      id: 'test-assistant-id',
      name: 'TestAssistant',
      role: 'testing',
      personality: 'Helpful and precise',
      coreEngineClient: mockCoreEngineClient,
      tools: [],
    };
  });

  it('should be initialized with provided config', () => {
    const assistant = new Assistant(assistantConfig);
    expect(assistant.id).toBe(assistantConfig.id);
    expect(assistant.name).toBe(assistantConfig.name);
    expect(assistant.role).toBe(assistantConfig.role);
    expect(assistant.personality).toBe(assistantConfig.personality);
  });

  it('should register and retrieve tools', () => {
    const assistant = new Assistant(assistantConfig);
    const mockTool = new Tool({
      name: 'mockTool',
      description: 'A mock tool',
      inputSchema: { type: 'object' },
      coreEngineClient: mockCoreEngineClient,
    });

    assistant.registerTool(mockTool);
    expect(assistant.getTool('mockTool')).toBe(mockTool);
  });

  it('should allow overwriting of a registered tool', () => {
    const assistant = new Assistant(assistantConfig);
    const mockTool1 = new Tool({
      name: 'duplicateTool',
      description: 'First mock tool',
      inputSchema: { type: 'object' },
      coreEngineClient: mockCoreEngineClient,
    });
    const mockTool2 = new Tool({
      name: 'duplicateTool',
      description: 'Second mock tool',
      inputSchema: { type: 'object' },
      coreEngineClient: mockCoreEngineClient,
    });

    assistant.registerTool(mockTool1);
    assistant.registerTool(mockTool2); // Overwrite
    expect(assistant.getTool('duplicateTool')).toBe(mockTool2);
  });

  it('should start a conversation and return a Conversation instance', async () => {
    const assistant = new Assistant(assistantConfig);
    const initialPrompt = 'Hello, assistant!';
    const missionId = 'mission-123';

    mockCoreEngineClient.startMission.mockResolvedValue(missionId);
    mockCoreEngineClient.onMissionEvent.mockReturnValue(() => {}); // Mock unsubscribe

    const conversation = await assistant.startConversation(initialPrompt);

    expect(mockCoreEngineClient.startMission).toHaveBeenCalledWith(
      initialPrompt,
      assistantConfig.id,
      [], // No tools registered initially in assistantConfig
      expect.any(String),
      expect.objectContaining({ agentClass: assistantConfig.id })
    );
    expect(conversation).toBeInstanceOf(Conversation);
    expect(conversation.id).toBe(missionId);
  });

  it('should pass registered tools to startMission', async () => {
    const mockTool = new Tool({
      name: 'testTool',
      description: 'A tool for testing',
      inputSchema: { type: 'object' },
      coreEngineClient: mockCoreEngineClient,
    });
    assistantConfig.tools = [mockTool]; // Add tool via config
    const assistant = new Assistant(assistantConfig);
    const initialPrompt = 'Hello, assistant!';
    const missionId = 'mission-123';

    mockCoreEngineClient.startMission.mockResolvedValue(missionId);
    mockCoreEngineClient.onMissionEvent.mockReturnValue(() => {});

    await assistant.startConversation(initialPrompt);

    expect(mockCoreEngineClient.startMission).toHaveBeenCalledWith(
      initialPrompt,
      assistantConfig.id,
      [{ name: mockTool.name, description: mockTool.description, inputSchema: mockTool.inputSchema }],
      expect.any(String),
      expect.objectContaining({ agentClass: assistantConfig.id })
    );
  });

  it('should retrieve context (placeholder implementation)', async () => {
    const assistant = new Assistant(assistantConfig);
    const context = await assistant.getContext();
    expect(context).toEqual({}); // Expect empty object from placeholder
    // In a real scenario, mockCoreEngineClient would be called for context
  });

  it('should update context (placeholder implementation)', async () => {
    const assistant = new Assistant(assistantConfig);
    const newContext = { data: 'some-data' };
    await expect(assistant.updateContext(newContext)).resolves.toBeUndefined();
    // In a real scenario, mockCoreEngineClient would be called for context update
  });

  // New tests for centralized chat functionality
  it('should track active chat sessions', async () => {
    const assistant = new Assistant(assistantConfig);
    const initialPrompt = 'Hello, assistant!';
    const missionId = 'mission-123';

    mockCoreEngineClient.startMission.mockResolvedValue(missionId);
    mockCoreEngineClient.onMissionEvent.mockReturnValue(() => {});

    const conversation = await assistant.startConversation(initialPrompt);
    
    // Check that session is tracked
    const activeSessions = assistant.getActiveSessions();
    expect(activeSessions.size).toBe(1);
    expect(activeSessions.has(missionId)).toBe(true);
    
    const session = activeSessions.get(missionId);
    expect(session).toBeDefined();
    expect(session?.conversationId).toBe(missionId);
    expect(session?.conversation).toBe(conversation);
  });

  it('should retrieve conversation by ID', async () => {
    const assistant = new Assistant(assistantConfig);
    const initialPrompt = 'Hello, assistant!';
    const missionId = 'mission-123';

    mockCoreEngineClient.startMission.mockResolvedValue(missionId);
    mockCoreEngineClient.onMissionEvent.mockReturnValue(() => {});

    await assistant.startConversation(initialPrompt);
    
    const retrievedConversation = assistant.getConversation(missionId);
    expect(retrievedConversation).toBeDefined();
    expect(retrievedConversation?.id).toBe(missionId);
  });

  it('should get conversation history', async () => {
    const assistant = new Assistant(assistantConfig);
    const initialPrompt = 'Hello, assistant!';
    const missionId = 'mission-123';
    const mockHistory: ConversationMessage[] = [
      {
        sender: 'user',
        type: 'text',
        content: 'Hello',
        timestamp: new Date()
      }
    ];

    mockCoreEngineClient.startMission.mockResolvedValue(missionId);
    mockCoreEngineClient.onMissionEvent.mockReturnValue(() => {});
    mockCoreEngineClient.getMissionHistory.mockResolvedValue(mockHistory);

    await assistant.startConversation(initialPrompt);
    
    const history = await assistant.getConversationHistory(missionId);
    expect(history).toEqual(mockHistory);
  });

  it('should manage conversation context', async () => {
    const assistant = new Assistant(assistantConfig);
    const initialPrompt = 'Hello, assistant!';
    const missionId = 'mission-123';

    mockCoreEngineClient.startMission.mockResolvedValue(missionId);
    mockCoreEngineClient.onMissionEvent.mockReturnValue(() => {});

    await assistant.startConversation(initialPrompt);
    
    // Test getting empty context
    let context = await assistant.getConversationContext(missionId);
    expect(context).toEqual({});
    
    // Test updating context
    const newContext = { userPreferences: { language: 'en' } };
    await assistant.updateConversationContext(missionId, newContext);
    
    context = await assistant.getConversationContext(missionId);
    expect(context).toEqual(newContext);
  });

  it('should manage global context', async () => {
    const assistant = new Assistant(assistantConfig);
    
    // Test getting empty global context
    let globalContext = await assistant.getGlobalContext();
    expect(globalContext).toEqual({});
    
    // Test updating global context
    const newGlobalContext = { systemSettings: { debugMode: true } };
    await assistant.updateGlobalContext(newGlobalContext);
    
    globalContext = await assistant.getGlobalContext();
    expect(globalContext).toEqual(newGlobalContext);
  });

  it('should send context-aware messages', async () => {
    const assistant = new Assistant(assistantConfig);
    const initialPrompt = 'Hello, assistant!';
    const missionId = 'mission-123';

    mockCoreEngineClient.startMission.mockResolvedValue(missionId);
    mockCoreEngineClient.onMissionEvent.mockReturnValue(() => {});
    mockCoreEngineClient.sendMessageToMission.mockResolvedValue(undefined);

    await assistant.startConversation(initialPrompt);
    
    // Set some context
    const context = { userName: 'John', preferences: { language: 'en' } };
    await assistant.updateConversationContext(missionId, context);
    
    // Send a message with context
    const message = 'What can you do for me?';
    await assistant.sendMessageToConversation(missionId, message);
    
    // Verify the message was enhanced with context
    expect(mockCoreEngineClient.sendMessageToMission).toHaveBeenCalled();
    const calledMessage = mockCoreEngineClient.sendMessageToMission.mock.calls[0][1];
    expect(calledMessage).toContain('Context:');
    expect(calledMessage).toContain('userName');
    expect(calledMessage).toContain('John');
    expect(calledMessage).toContain('User Message:');
    expect(calledMessage).toContain(message);
  });

  it('should end conversation and clean up', async () => {
    const assistant = new Assistant(assistantConfig);
    const initialPrompt = 'Hello, assistant!';
    const missionId = 'mission-123';

    mockCoreEngineClient.startMission.mockResolvedValue(missionId);
    mockCoreEngineClient.onMissionEvent.mockReturnValue(() => {});
    mockCoreEngineClient.endMission.mockResolvedValue(undefined);

    await assistant.startConversation(initialPrompt);
    
    // Verify session exists
    let activeSessions = assistant.getActiveSessions();
    expect(activeSessions.size).toBe(1);
    
    // End conversation
    await assistant.endConversation(missionId);
    
    // Verify session was cleaned up
    activeSessions = assistant.getActiveSessions();
    expect(activeSessions.size).toBe(0);
    expect(mockCoreEngineClient.endMission).toHaveBeenCalledWith(missionId);
  });

  it('should handle context override in messages', async () => {
    const assistant = new Assistant(assistantConfig);
    const initialPrompt = 'Hello, assistant!';
    const missionId = 'mission-123';

    mockCoreEngineClient.startMission.mockResolvedValue(missionId);
    mockCoreEngineClient.onMissionEvent.mockReturnValue(() => {});
    mockCoreEngineClient.sendMessageToMission.mockResolvedValue(undefined);

    await assistant.startConversation(initialPrompt);
    
    // Set base context
    const baseContext = { userName: 'John' };
    await assistant.updateConversationContext(missionId, baseContext);
    
    // Send message with context override
    const overrideContext = { userName: 'Jane', temporarySetting: 'test' };
    const message = 'Who am I?';
    await assistant.sendMessageToConversation(missionId, message, overrideContext);
    
    // Verify the message used the override context
    const calledMessage = mockCoreEngineClient.sendMessageToMission.mock.calls[0][1];
    expect(calledMessage).toContain('Jane'); // Override value
    expect(calledMessage).not.toContain('John'); // Base value should be overridden
    expect(calledMessage).toContain('temporarySetting');
  });
});
