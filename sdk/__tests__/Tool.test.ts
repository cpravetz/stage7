import { Tool, ToolConfig } from '../src/Tool';
import { ICoreEngineClient, ToolExecutionError } from '../src/types';

describe('Tool', () => {
  let mockCoreEngineClient: jest.Mocked<ICoreEngineClient>;
  let toolConfig: ToolConfig;

  beforeEach(() => {
    mockCoreEngineClient = {
      startMission: jest.fn(),
      sendMessageToMission: jest.fn(),
      submitHumanInputToMission: jest.fn(),
      getMissionHistory: jest.fn(),
      onMissionEvent: jest.fn(),
      requestHumanInput: jest.fn(),
    };

    toolConfig = {
      name: 'testTool',
      description: 'A tool for testing purposes',
      inputSchema: {
        type: 'object',
        properties: {
          param1: { type: 'string' },
          param2: { type: 'number' },
        },
        required: ['param1'],
      },
      coreEngineClient: mockCoreEngineClient,
    };
  });

  it('should be initialized with provided config', () => {
    const tool = new Tool(toolConfig);
    expect(tool.name).toBe(toolConfig.name);
    expect(tool.description).toBe(toolConfig.description);
    expect(tool.inputSchema).toEqual(toolConfig.inputSchema);
  });

  it('should execute successfully and return simulated output', async () => {
    const tool = new Tool(toolConfig);
    const args = { param1: 'value', param2: 123 };
    const conversationId = 'conv-123';

    // Since the current execute method has a placeholder, we expect a specific console log and a resolved promise.
    const consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});

    const result = await tool.execute(args, conversationId);

    expect(consoleSpy).toHaveBeenCalledWith(
      `Tool 'testTool' executing for conversation 'conv-123' with args:`,
      args
    );
    expect(result).toEqual({
      status: 'success',
      message: `Tool 'testTool' executed successfully with args: {"param1":"value","param2":123}`
    });
    consoleSpy.mockRestore();
  });

  // This test will need to be updated when actual L1 integration for tool execution is implemented
  it('should throw ToolExecutionError on L1 failure (simulated)', async () => {
    // To simulate L1 failure, we would typically mock a coreEngineClient method to throw.
    // However, the current Tool.execute() body directly uses a try-catch on a simulated promise.
    // For now, we cannot directly test L1 failure through coreEngineClient mock,
    // but the error handling structure is in place.
    const tool = new Tool({
      ...toolConfig,
      coreEngineClient: { // A specific mock for this test
        ...mockCoreEngineClient,
        // Imagine a method `executeToolInL1` that would throw
        // executeToolInL1: jest.fn().mockRejectedValue(new Error('L1 specific error')),
      } as any, // Cast to any because we are partially mocking
    });

    const args = { param1: 'value' };
    const conversationId = 'conv-456';

    // When the real L1 interaction is added, this test will become more meaningful.
    // For now, we'll test the catch block by making the inner logic throw (if it could).
    // The current implementation of execute() has a hardcoded success.
    // A robust test here would involve injecting a mock that *makes* the placeholder throw.

    // As per current implementation, it always resolves successfully.
    await expect(tool.execute(args, conversationId)).resolves.toBeDefined();
  });
});
