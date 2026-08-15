import { Tool } from './Tool';
import { ICoreEngineClient, JsonSchema } from './types';
import { MCPTool, MCPActionMapping } from '@cktmcs/shared';

export interface McpServerConfig {
  name: string;
  baseUrl: string;
  tools?: {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    outputSchema?: JsonSchema;
  }[];
  headers?: Record<string, string>;
}

export class McpAdapter {
  private coreEngineClient: ICoreEngineClient;

  constructor(coreEngineClient: ICoreEngineClient) {
    this.coreEngineClient = coreEngineClient;
  }

  /**
   * Converts an Anthropic/Stage7 MCPTool interface structure into Stage7 L2 Tool instances.
   */
  public convertMcpToolToL2Tools(mcpTool: MCPTool): Tool[] {
    return mcpTool.actionMappings.map((actionMapping: MCPActionMapping) => {
      const toolName = `${mcpTool.id}_${actionMapping.actionVerb}`;
      const inputProperties: Record<string, any> = {};
      const requiredInputs: string[] = [];

      (actionMapping.inputs || []).forEach(input => {
        inputProperties[input.name] = {
          type: input.type ? input.type.toLowerCase() : 'string',
          description: input.description || '',
        };
        if (input.required) {
          requiredInputs.push(input.name);
        }
      });

      const inputSchema: JsonSchema = {
        type: 'object',
        properties: inputProperties,
        required: requiredInputs.length > 0 ? requiredInputs : undefined,
      };

      return new Tool({
        name: toolName,
        description: actionMapping.description || `${actionMapping.actionVerb} action for ${mcpTool.name}`,
        inputSchema,
        coreEngineClient: this.coreEngineClient,
      });
    });
  }

  /**
   * Converts an external MCP server descriptor into Stage7 L2 Tool instances.
   */
  public convertMcpServerToTools(serverConfig: McpServerConfig): Tool[] {
    const serverTools = serverConfig.tools || [];
    return serverTools.map(toolDef => {
      const toolName = `mcp_${serverConfig.name}_${toolDef.name}`;
      return new Tool({
        name: toolName,
        description: toolDef.description,
        inputSchema: toolDef.inputSchema,
        outputSchema: toolDef.outputSchema,
        coreEngineClient: this.coreEngineClient,
      });
    });
  }
}
