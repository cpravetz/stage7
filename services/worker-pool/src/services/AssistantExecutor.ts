import {
  AssistantDefinition,
  AssistantExecutionResult,
  MCPToolCall,
  MCPToolResult,
} from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

export class AssistantExecutor {
  async execute(
    definition: AssistantDefinition,
    prompt: string,
    _context?: Record<string, unknown>,
  ): Promise<AssistantExecutionResult> {
    const start = Date.now();
    logger.info(
      { assistantId: definition.id, promptLength: prompt.length },
      'Assistant execution started',
    );

    const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
    try {
      const response = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt: definition.systemPrompt,
          options: definition.model ? { model: definition.model } : undefined,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ assistantId: definition.id, status: response.status, body: errorText }, 'Brain complete failed');
        return {
          assistantId: definition.id,
          success: false,
          error: `Brain returned ${response.status}: ${errorText}`,
          durationMs: Date.now() - start,
        };
      }

      const data = await response.json() as { content: string; model: string };
      return {
        assistantId: definition.id,
        success: true,
        output: data.content,
        tokensUsed: data.content.length,
        durationMs: Date.now() - start,
      };
    } catch (error) {
      logger.error({ assistantId: definition.id, error: error instanceof Error ? error.message : String(error) }, 'Brain call failed');
      return {
        assistantId: definition.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - start,
      };
    }
  }

  async executeToolCall(tool: MCPToolCall): Promise<MCPToolResult> {
    logger.info({ toolName: tool.name }, 'Tool execution requested');

    const knownTools = ['get_weather', 'calculate', 'search_web'];

    if (knownTools.includes(tool.name)) {
      return {
        content: [
          {
            type: 'text',
            text: `Mock result for ${tool.name} with args ${JSON.stringify(tool.arguments)}`,
          },
        ],
      };
    }

    return {
      content: [
        {
          type: 'error',
          error: `Unknown tool: ${tool.name}`,
        },
      ],
      isError: true,
    };
  }
}
