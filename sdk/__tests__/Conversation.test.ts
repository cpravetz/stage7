import { Conversation } from '../src/Conversation';
import { ICoreEngineClient, ConversationError, ConversationMessage } from '../src/types';

describe('Conversation', () => {
  let mockCoreEngineClient: jest.Mocked<ICoreEngineClient>;
  let conversation: Conversation;
  const conversationId = 'conv-test-123';
  const assistantId = 'assistant-test-abc';

  beforeEach(() => {
    mockCoreEngineClient = {
      startMission: jest.fn(),
      sendMessageToMission: jest.fn(),
      submitHumanInputToMission: jest.fn(),
      getMissionHistory: jest.fn(),
      getMissionDetails: jest.fn(),
      executeTool: jest.fn(),
      getContext: jest.fn(),
      updateContext: jest.fn(),
      endMission: jest.fn().mockResolvedValue(undefined),
      onMissionEvent: jest.fn().mockReturnValue(() => {}), // Mock unsubscribe function
      requestHumanInput: jest.fn(),
    };
    conversation = new Conversation(conversationId, assistantId, mockCoreEngineClient);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be initialized with provided IDs and client', () => {
    expect(conversation.id).toBe(conversationId);
    expect(conversation.assistantId).toBe(assistantId);
    expect(mockCoreEngineClient.onMissionEvent).toHaveBeenCalledWith(conversationId, expect.any(Function));
  });

  it('should register and emit events', () => {
    const handler = jest.fn();
    const unsubscribe = conversation.on('message', handler);

    // Simulate an event coming from L1 (via the internal onMissionEvent handler)
    const l1EventHandler = mockCoreEngineClient.onMissionEvent.mock.calls[0][1];
    const testMessage = { sender: 'assistant', type: 'text', content: 'Hello', timestamp: new Date() };
    l1EventHandler('message', testMessage);

    expect(handler).toHaveBeenCalledWith('message', testMessage);

    unsubscribe();
    l1EventHandler('message', { ...testMessage, content: 'Another message' });
    expect(handler).toHaveBeenCalledTimes(1); // Should not be called again after unsubscribe
  });

  it('should send a message to L1 and emit a user message event', async () => {
    const message = 'User query';
    const handler = jest.fn();
    conversation.on('message', handler);

    mockCoreEngineClient.sendMessageToMission.mockResolvedValue(undefined);

    await conversation.sendMessage(message);

    expect(mockCoreEngineClient.sendMessageToMission).toHaveBeenCalledWith(conversationId, message);
    expect(handler).toHaveBeenCalledWith('message', expect.objectContaining({
      sender: 'user',
      type: 'text',
      content: message,
    }));
  });

  it('should throw ConversationError if sendMessage fails', async () => {
    const message = 'User query';
    const errorMessage = 'L1 send failed';
    mockCoreEngineClient.sendMessageToMission.mockRejectedValue(new Error(errorMessage));

    await expect(conversation.sendMessage(message)).rejects.toThrow(
      new ConversationError(`Failed to send message to conversation ${conversationId}: ${errorMessage}`, conversationId, expect.any(Error))
    );
  });

  it('should submit human input to L1', async () => {
    const response = 'User response';
    const inputStepId = 'step-456';
    const handler = jest.fn();
    conversation.on('message', handler);

    mockCoreEngineClient.submitHumanInputToMission.mockResolvedValue(undefined);

    await conversation.submitHumanInput(response, inputStepId);

    expect(mockCoreEngineClient.submitHumanInputToMission).toHaveBeenCalledWith(
      conversationId,
      inputStepId,
      response
    );
    expect(handler).toHaveBeenCalledWith('message', expect.objectContaining({
      sender: 'user',
      type: 'text',
      content: `Human input provided for step ${inputStepId}: ${response}`,
    }));
  });

  it('should throw ConversationError if submitHumanInput fails', async () => {
    const response = 'User response';
    const inputStepId = 'step-456';
    const errorMessage = 'L1 human input failed';
    mockCoreEngineClient.submitHumanInputToMission.mockRejectedValue(new Error(errorMessage));

    await expect(conversation.submitHumanInput(response, inputStepId)).rejects.toThrow(
      new ConversationError(`Failed to submit human input for conversation ${conversationId}, step ${inputStepId}: ${errorMessage}`, conversationId, expect.any(Error))
    );
  });

  it('should retrieve conversation history from L1', async () => {
    const mockHistory: ConversationMessage[] = [{ sender: 'user', type: 'text', content: 'Hi', timestamp: new Date() }];
    mockCoreEngineClient.getMissionHistory.mockResolvedValue(mockHistory);

    const history = await conversation.getHistory();

    expect(mockCoreEngineClient.getMissionHistory).toHaveBeenCalledWith(conversationId);
    expect(history).toEqual(mockHistory);
  });

  it('should throw ConversationError if getHistory fails', async () => {
    const errorMessage = 'L1 history failed';
    mockCoreEngineClient.getMissionHistory.mockRejectedValue(new Error(errorMessage));

    await expect(conversation.getHistory()).rejects.toThrow(
      new ConversationError(`Failed to retrieve conversation history for ${conversationId}: ${errorMessage}`, conversationId, expect.any(Error))
    );
  });

  it('should end the conversation and unsubscribe from L1 events', async () => {
    const unsubscribeMock = jest.fn();
    mockCoreEngineClient.onMissionEvent.mockReturnValue(unsubscribeMock); // Make sure it returns a real mock
    mockCoreEngineClient.endMission = jest.fn().mockResolvedValue(undefined);
    const conversationInstance = new Conversation(conversationId, assistantId, mockCoreEngineClient); // Re-instantiate to get the mock unsubscribe
    
    const handler = jest.fn();
    conversationInstance.on('end', handler);

    await conversationInstance.end();

    expect(unsubscribeMock).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith('end', { conversationId });
  });

  it('should throw ConversationError if end fails', async () => {
    mockCoreEngineClient.endMission = jest.fn().mockRejectedValue(new Error('L1 termination failed'));

    const conv = new Conversation(conversationId, assistantId, mockCoreEngineClient);
    await expect(conv.end()).rejects.toThrow(ConversationError);
  });
});
