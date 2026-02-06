import { HumanInTheLoop } from '../src/HumanInTheLoop';
import { Conversation } from '../src/Conversation';
import { ICoreEngineClient, HumanInputTimeoutError, SdkError } from '../src/types';

describe('HumanInTheLoop', () => {
  let mockCoreEngineClient: jest.Mocked<ICoreEngineClient>;
  let mockConversation: jest.Mocked<Conversation>;
  const conversationId = 'conv-test-123';
  const assistantId = 'assistant-test-abc';
  const mockUnsubscribe = jest.fn();

  beforeEach(() => {
    mockCoreEngineClient = {
      startMission: jest.fn(),
      sendMessageToMission: jest.fn(),
      submitHumanInputToMission: jest.fn(),
      getMissionHistory: jest.fn(),
      onMissionEvent: jest.fn().mockReturnValue(mockUnsubscribe),
      requestHumanInput: jest.fn(),
    };
    mockConversation = new Conversation(conversationId, assistantId, mockCoreEngineClient) as jest.Mocked<Conversation>;
    // Mock the `on` method of the conversation for HumanInTheLoop to use
    mockConversation.on = jest.fn().mockReturnValue(mockUnsubscribe);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('ask method', () => {
    it('should request human input via CoreEngineClient', async () => {
      const question = 'What is your name?';
      const inputStepId = 'step-ask-1';
      mockCoreEngineClient.requestHumanInput.mockResolvedValue(inputStepId);

      // Simulate a response coming from L1 after submitHumanInput is called
      let resolveAskPromise: (value: string) => void;
      const askPromise = new Promise<string>((resolve) => { resolveAskPromise = resolve; });

      // Mock conversation.on to immediately trigger a message event after requestHumanInput is called
      mockConversation.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          setTimeout(() => {
            handler({ sender: 'user', type: 'tool_output', content: 'Alice', metadata: { inputStepId } });
          }, 10); // Small delay to simulate async L1 event
        }
        return mockUnsubscribe;
      });


      const resultPromise = HumanInTheLoop.ask(mockConversation, question);

      await expect(mockCoreEngineClient.requestHumanInput).toHaveBeenCalledWith(
        conversationId,
        'ask',
        question,
        undefined
      );

      // Await the result
      const result = await resultPromise;
      expect(result).toBe('Alice');
      expect(mockUnsubscribe).toHaveBeenCalledTimes(2); // One for conversation.on, one for the internal event handler cleanup
    });

    it('should throw HumanInputTimeoutError if no response within timeout', async () => {
      const question = 'Are you there?';
      const inputStepId = 'step-timeout-1';
      mockCoreEngineClient.requestHumanInput.mockResolvedValue(inputStepId);
      mockConversation.on.mockReturnValue(mockUnsubscribe); // Ensure on returns an unsubscribe function

      const promise = HumanInTheLoop.ask(mockConversation, question, undefined, 100); // 100ms timeout

      await expect(promise).rejects.toThrow(HumanInputTimeoutError);
      await expect(promise).rejects.toThrow(/Human input timed out/);
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1); // Unsubscribe called on timeout
    });

    it('should pass metadata to requestHumanInput', async () => {
      const question = 'Pick one:';
      const metadata = { inputType: 'text', options: ['A', 'B'] };
      const inputStepId = 'step-meta-1';
      mockCoreEngineClient.requestHumanInput.mockResolvedValue(inputStepId);
      mockConversation.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          setTimeout(() => {
            handler({ sender: 'user', type: 'tool_output', content: 'Option A', metadata: { inputStepId } });
          }, 10);
        }
        return mockUnsubscribe;
      });

      await HumanInTheLoop.ask(mockConversation, question, metadata);

      expect(mockCoreEngineClient.requestHumanInput).toHaveBeenCalledWith(
        conversationId,
        'ask',
        question,
        metadata
      );
    });

    it('should throw SdkError if requestHumanInput fails', async () => {
      const question = 'Why?';
      const errorMessage = 'L1 failed to request input';
      mockCoreEngineClient.requestHumanInput.mockRejectedValue(new Error(errorMessage));

      const promise = HumanInTheLoop.ask(mockConversation, question);

      await expect(promise).rejects.toThrow(SdkError);
      await expect(promise).rejects.toThrow(/Failed to request human input/);
      expect(mockUnsubscribe).not.toHaveBeenCalled(); // No event listener would have been set up for cleanup
    });
  });

  describe('getApproval method', () => {
    it('should call ask with specific inputType and parse boolean response', async () => {
      const prompt = 'Approve this action?';
      const inputStepId = 'step-approval-1';
      mockCoreEngineClient.requestHumanInput.mockResolvedValue(inputStepId);
      mockConversation.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          setTimeout(() => {
            handler({ sender: 'user', type: 'tool_output', content: 'yes', metadata: { inputStepId } });
          }, 10);
        }
        return mockUnsubscribe;
      });

      const result = await HumanInTheLoop.getApproval(mockConversation, prompt);
      expect(result).toBe(true);
      expect(mockCoreEngineClient.requestHumanInput).toHaveBeenCalledWith(
        conversationId,
        'ask', // getApproval delegates to ask, so 'ask' is the type passed to L1
        prompt,
        { inputType: 'boolean' } // Expect metadata to specify boolean input
      );
    });

    it('should return false for negative responses', async () => {
      const prompt = 'Proceed?';
      const inputStepId = 'step-approval-2';
      mockCoreEngineClient.requestHumanInput.mockResolvedValue(inputStepId);
      mockConversation.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          setTimeout(() => {
            handler({ sender: 'user', type: 'tool_output', content: 'false', metadata: { inputStepId } });
          }, 10);
        }
        return mockUnsubscribe;
      });

      const result = await HumanInTheLoop.getApproval(mockConversation, prompt);
      expect(result).toBe(false);
    });
  });

  describe('selectOption method', () => {
    it('should call ask with specific inputType and options metadata', async () => {
      const prompt = 'Choose an option:';
      const options = ['Option A', 'Option B'];
      const inputStepId = 'step-select-1';
      mockCoreEngineClient.requestHumanInput.mockResolvedValue(inputStepId);
      mockConversation.on.mockImplementation((event, handler) => {
        if (event === 'message') {
          setTimeout(() => {
            handler({ sender: 'user', type: 'tool_output', content: 'Option A', metadata: { inputStepId } });
          }, 10);
        }
        return mockUnsubscribe;
      });

      const result = await HumanInTheLoop.selectOption(mockConversation, prompt, options);
      expect(result).toBe('Option A');
      expect(mockCoreEngineClient.requestHumanInput).toHaveBeenCalledWith(
        conversationId,
        'ask', // selectOption delegates to ask, so 'ask' is the type passed to L1
        prompt,
        { inputType: 'select', options } // Expect metadata to specify select input and options
      );
    });
  });
});
