import { McpAdapter } from '../src/McpAdapter';
import { ICoreEngineClient } from '../src/types';
import { MCPTool } from '@cktmcs/shared';

describe('McpAdapter', () => {
  let mockCoreEngineClient: jest.Mocked<ICoreEngineClient>;
  let mcpAdapter: McpAdapter;

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
      endMission: jest.fn(),
      onMissionEvent: jest.fn(),
      requestHumanInput: jest.fn(),
    };

    mcpAdapter = new McpAdapter(mockCoreEngineClient);
  });

  it('should convert MCPTool definition to L2 Tools', () => {
    const mockMcpTool: MCPTool = {
      id: 'mcp_billing',
      name: 'MCP Billing Service',
      description: 'Handles billing actions',
      version: '1.0.0',
      actionMappings: [
        {
          actionVerb: 'CHARGE_USER',
          description: 'Charge user account',
          mcpServiceTarget: {
            serviceName: 'billing_service',
            endpointOrCommand: '/charge',
            method: 'POST',
          },
          inputs: [
            { name: 'userId', type: 'string', required: true, description: 'User ID' },
            { name: 'amount', type: 'number', required: true, description: 'Amount to charge' },
          ],
          outputs: [],
        },
      ],
      metadata: {
        created: new Date().toISOString(),
      },
    };

    const tools = mcpAdapter.convertMcpToolToL2Tools(mockMcpTool);
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('mcp_billing_CHARGE_USER');
    expect(tools[0].description).toBe('Charge user account');
    expect(tools[0].inputSchema).toEqual({
      type: 'object',
      properties: {
        userId: { type: 'string', description: 'User ID' },
        amount: { type: 'number', description: 'Amount to charge' },
      },
      required: ['userId', 'amount'],
    });
  });

  it('should convert McpServerConfig to L2 Tools', () => {
    const serverConfig = {
      name: 'weather_server',
      baseUrl: 'http://weather-mcp:8080',
      tools: [
        {
          name: 'get_forecast',
          description: 'Get forecast for a location',
          inputSchema: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
            required: ['location'],
          },
        },
      ],
    };

    const tools = mcpAdapter.convertMcpServerToTools(serverConfig);
    expect(tools.length).toBe(1);
    expect(tools[0].name).toBe('mcp_weather_server_get_forecast');
    expect(tools[0].description).toBe('Get forecast for a location');
  });
});
