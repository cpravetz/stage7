import { ICoreEngineClient, JsonSchema, ToolExecutionError } from './types';

export interface ToolConfig {
  name: string; // Unique name for the tool (used by LLM for function calling)
  description: string; // Detailed description for the LLM on what the tool does and when to use it
  inputSchema: JsonSchema; // JSON schema defining the expected input arguments for the execute method
  outputSchema?: JsonSchema; // Optional JSON schema defining the expected output structure
  coreEngineClient: ICoreEngineClient; // Client to communicate with the Core Engine
}

export class Tool {
  public readonly name: string;
  public readonly description: string;
  public readonly inputSchema: JsonSchema;
  public readonly outputSchema?: JsonSchema;
  private coreEngineClient: ICoreEngineClient;

  constructor(config: ToolConfig) {
    this.name = config.name;
    this.description = config.description;
    this.inputSchema = config.inputSchema;
    this.outputSchema = config.outputSchema;
    this.coreEngineClient = config.coreEngineClient;
  }

  /**
   * Executes the tool's defined action. This method will typically interact with the Core Engine
   * by constructing and dispatching appropriate L1 plans/steps derived from the tool's purpose.
   *
   * @param args The input arguments conforming to the inputSchema.
   * @param conversationId The ID of the conversation context in which the tool is being executed.
   * @returns A Promise resolving with the tool's output, conforming to outputSchema.
   * @throws ToolExecutionError if the tool execution fails in L1.
   */
  public async execute(args: any, conversationId: string): Promise<any> {
    console.log(`Tool '${this.name}' executing for conversation '${conversationId}' with args:`, args);

    try {
      // This now uses a direct, structured call to the L1 engine, which is more robust.
      // The L1 engine is responsible for fetching any necessary configuration (e.g., API keys)
      // from the central settings service to execute the underlying L1 plugin.
      const result = await this.coreEngineClient.executeTool(
        conversationId,
        this.name,
        args
      );
      return result;
    } catch (error: any) {
      throw new ToolExecutionError(
        `Failed to execute tool '${this.name}': ${error.message}`,
        this.name,
        error
      );
    }
  }

  /**
   * Simplified version of the Tool class with execute method provided in the constructor.
   */
  public static createSimpleTool(config: {
    name: string;
    description: string;
    inputSchema: JsonSchema;
    outputSchema?: JsonSchema;
    coreEngineClient: ICoreEngineClient;
    execute: (args: any, conversationId: string) => Promise<any>;
  }): Tool {
    const tool = new Tool(config);
    tool.execute = config.execute;
    return tool;
  }
}