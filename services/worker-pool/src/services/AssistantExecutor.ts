import {
  AssistantDefinition,
  AssistantExecutionResult,
  MCPToolCall,
  MCPToolResult,
} from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

export class AssistantExecutor {
  private toolExecutorUrl: string;

  constructor() {
    this.toolExecutorUrl = process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500';
  }

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

    const knowledgeBlock = definition.knowledge && definition.knowledge.length > 0
      ? `\n\nKnowledge Base:\n${definition.knowledge.map((k) => `- ${k.title}: ${k.content}`).join('\n')}`
      : '';

    const transactionBlock = definition.transactionGuidance && definition.transactionGuidance.length > 0
      ? `\n\nTransaction Guidance:\n${definition.transactionGuidance.map((g) => `- ${g}`).join('\n')}`
      : '';

    const toolsContext = definition.tools?.length
      ? `\n\nAvailable tools:\n${definition.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}\n\nTo use a tool, respond with ONLY a JSON object in this exact format:\n{"tool":"tool-name","args":{...}}`
      : '\n\nNo tools are available. Answer directly.';

    const systemPrompt = `${definition.systemPrompt}${knowledgeBlock}${transactionBlock}${toolsContext}`;

    const maxIterations = Math.max(1, Number(definition.metadata?.maxIterations) || 8);
    const conversation: Array<{ role: string; content: string }> = [{ role: 'user', content: prompt }];
    let tokensUsed = 0;
    let lastToolCall: { name: string; args: string } | null = null;
    let consecutiveSame = 0;
    let lastToolResultText: string | null = null;

    for (let i = 0; i < maxIterations; i++) {
      const brainRes = await this.callBrain(systemPrompt, conversation);
      if (!brainRes.ok) {
        return {
          assistantId: definition.id,
          success: false,
          error: brainRes.error,
          tokensUsed,
          durationMs: Date.now() - start,
        };
      }
      tokensUsed += brainRes.tokensUsed || 0;
      const content = (brainRes.content || '').trim();

      const toolCall = this.parseToolCall(content);
      if (toolCall) {
        const sig = `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`;
        if (lastToolCall && sig === `${lastToolCall.name}:${lastToolCall.args}`) {
          consecutiveSame++;
          if (consecutiveSame >= 3) {
            logger.warn(
              { assistantId: definition.id, toolName: toolCall.name, iterations: i + 1 },
              'Repeated identical tool call; stopping reasoning loop',
            );
            return {
              assistantId: definition.id,
              success: true,
              output: lastToolResultText ?? content,
              tokensUsed,
              durationMs: Date.now() - start,
            };
          }
        } else {
          lastToolCall = { name: toolCall.name, args: JSON.stringify(toolCall.arguments) };
          consecutiveSame = 0;
        }

        logger.info(
          { assistantId: definition.id, toolName: toolCall.name, args: toolCall.arguments },
          'Assistant requested tool execution',
        );
        const toolResult = await this.executeToolCall(toolCall);
        lastToolResultText = toolResult.content.map((c) => c.text || c.error || '').join('\n');
        const feedback = toolResult.isError
          ? `The tool "${toolCall.name}" returned an error:\n${lastToolResultText}\nCorrect your approach, retry with fixed arguments, or produce a final answer.`
          : `Tool "${toolCall.name}" returned:\n${lastToolResultText}\nContinue working toward the task. If you have everything needed, give your final answer WITHOUT a tool call.`;

        conversation.push({ role: 'assistant', content: `Tool call: ${content}` });
        conversation.push({ role: 'user', content: feedback });
        continue;
      }

      return {
        assistantId: definition.id,
        success: true,
        output: content,
        tokensUsed,
        durationMs: Date.now() - start,
      };
    }

    return {
      assistantId: definition.id,
      success: true,
      output: lastToolResultText ?? prompt,
      tokensUsed,
      durationMs: Date.now() - start,
    };
  }

  private async callBrain(
    systemPrompt: string,
    conversation: Array<{ role: string; content: string }>,
  ): Promise<{ ok: boolean; error?: string; content?: string; tokensUsed?: number }> {
    const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
    const prompt = conversation
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    try {
      const res = await fetch(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt,
          maxTokens: 4096,
          temperature: 0.7,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        return { ok: false, error: `Brain returned ${res.status}: ${text.slice(0, 200)}` };
      }
      const data = await res.json() as { content: string; tokensUsed?: number };
      return { ok: true, content: data.content, tokensUsed: data.tokensUsed };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  private parseToolCall(content: string): MCPToolCall | null {
    if (!content.startsWith('{')) return null;
    const match = content.match(/\{"tool":"([^"]+)","args":(\{[\s\S]*\})\}/);
    if (!match) return null;
    try {
      return { name: match[1], arguments: JSON.parse(match[2]) };
    } catch {
      return null;
    }
  }


  async executeToolCall(tool: MCPToolCall): Promise<MCPToolResult> {
    logger.info({ toolName: tool.name, arguments: tool.arguments }, 'Tool execution requested');

    try {
      const response = await fetch(`${this.toolExecutorUrl}/api/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `tool-${Date.now()}`,
          name: tool.name,
          type: 'mcp',
          manifest: {},
          input: tool.arguments || {},
        }),
      });

      if (response.status === 428) {
        const data = await response.json() as { error?: string; request?: any };
        return {
          content: [
            {
              type: 'text',
              text: `CREDENTIAL_REQUIRED: ${data.error || 'Missing credentials'}\nRequired: ${data.request?.missingCredentials?.map((m: any) => m.label || m.key).join(', ') || 'unknown'}`,
            },
          ],
          isError: true,
        };
      }

      if (!response.ok) {
        const text = await response.text();
        return {
          content: [{ type: 'text', text: `Tool executor returned ${response.status}: ${text.slice(0, 200)}` }],
          isError: true,
        };
      }

      const result = await response.json() as {
        status: string;
        output?: Record<string, unknown>;
        error?: string;
      };

      if (result.status === 'completed' && result.output) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.output, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.error || 'Tool execution returned no output',
          },
        ],
        isError: true,
      };
    } catch (error) {
      logger.error({ toolName: tool.name, error: error instanceof Error ? error.message : String(error) }, 'Tool execution threw');
      return {
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      };
    }
  }

  async provideCredentials(
    toolName: string,
    arguments_: Record<string, unknown>,
    credentials: Record<string, string>,
    storeInVault = false,
    vaultSecretId?: string,
  ): Promise<MCPToolResult> {
    logger.info({ toolName, arguments: arguments_, credentialsProvided: Object.keys(credentials).length }, 'Providing credentials for tool');

    try {
      const response = await fetch(`${this.toolExecutorUrl}/api/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: `tool-${Date.now()}`,
          name: toolName,
          type: 'mcp',
          manifest: {},
          input: arguments_ || {},
          credentials,
          storeInVault,
          vaultSecretId,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        return {
          content: [{ type: 'text', text: `Tool executor returned ${response.status}: ${text.slice(0, 200)}` }],
          isError: true,
        };
      }

      const result = await response.json() as {
        status: string;
        output?: Record<string, unknown>;
        error?: string;
        request?: any;
      };

      if (result.status === 'completed' && result.output) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result.output, null, 2),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: result.error || 'Tool execution returned no output',
          },
        ],
        isError: true,
      };
    } catch (error) {
      logger.error({ toolName, error: error instanceof Error ? error.message : String(error) }, 'Tool execution with credentials threw');
      return {
        content: [
          {
            type: 'text',
            text: error instanceof Error ? error.message : String(error),
          },
        ],
        isError: true,
      };
    }
  }
}
