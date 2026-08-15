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
      getMissionDetails: jest.fn(),
      executeTool: jest.fn().mockResolvedValue({
        status: 'success',
        message: `Tool 'testTool' executed successfully with args: {"param1":"value","param2":123}`
      }),
      getContext: jest.fn(),
      updateContext: jest.fn(),
      endMission: jest.fn(),
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
    expect(mockCoreEngineClient.executeTool).toHaveBeenCalledWith(conversationId, 'testTool', args);
    expect(result).toEqual({
      status: 'success',
      message: `Tool 'testTool' executed successfully with args: {"param1":"value","param2":123}`
    });
    consoleSpy.mockRestore();
  });

  it('should throw ToolExecutionError on L1 failure (simulated)', async () => {
    mockCoreEngineClient.executeTool.mockRejectedValueOnce(new Error('L1 specific error'));

    const tool = new Tool({
      ...toolConfig,
      coreEngineClient: mockCoreEngineClient,
    });

    const args = { param1: 'value' };
    const conversationId = 'conv-456';

    await expect(tool.execute(args, conversationId)).rejects.toThrow(ToolExecutionError);
  });
});
