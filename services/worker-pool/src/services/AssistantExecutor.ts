import {
  AssistantDefinition,
  AssistantExecutionResult,
  logger,
  httpRequest,
  llmCallTimeoutMs,
  DEFAULT_TENANT_ID,
  MCPToolCall,
  MCPToolResult,
  parseSpendLimitRefusalPayload,
} from '@stage7-nextgen/shared';
import type { SpendLimitRefusalPayload } from '@stage7-nextgen/shared';
import { KnowledgeService } from './KnowledgeService';
import {
  applyKnowledgeBudget,
  fuseKnowledgeRankings,
  knowledgeQueryTokens,
  rankKnowledgeEntries,
  selectLessons,
} from './knowledgeBudget';
import type { AssistantLoader } from './AssistantLoader';

export class AssistantExecutor {
  private toolExecutorUrl: string;

  constructor(private knowledge: KnowledgeService, private loader?: AssistantLoader) {
    this.toolExecutorUrl = process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500';
  }

  private sanitizeContext(context: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = new Set([
      'password', 'passwd', 'secret', 'token', 'apiKey', 'api_key',
      'credentials', 'auth', 'privateKey', 'private_key', 'accessToken',
      'access_token', 'refreshToken', 'refresh_token', 'vaultSecret',
    ]);
    const sanitizeValue = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(sanitizeValue);
      if (value && typeof value === 'object') {
        return this.sanitizeContext(value as Record<string, unknown>);
      }
      return value;
    };
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(context)) {
      sanitized[key] = sensitiveKeys.has(key) ? '[REDACTED]' : sanitizeValue(value);
    }
    return sanitized;
  }

  async execute(
    definition: AssistantDefinition,
    prompt: string,
    context?: Record<string, unknown>,
  ): Promise<AssistantExecutionResult> {
    const start = Date.now();
    logger.info(
      { assistantId: definition.id, promptLength: prompt.length },
      'Assistant execution started',
    );

    const contextBlock = context && Object.keys(context).length > 0
      ? `\n\nRuntime Context:\n${JSON.stringify(this.sanitizeContext(context), null, 2)}`
      : '';

    // Knowledge is read from the store on every execution, not carried on the
    // definition, so that entries recorded for this assistant — or shared with
    // all of them — take effect without redeploying. Entries are ranked (tag
    // match against the assistant/task first, recency second) and capped to a
    // character budget so a growing store cannot overflow the context window.
    const knowledgeRecords = await this.knowledge.listForAssistantWithMeta(definition.id);
    if (knowledgeRecords.length === 0) {
      logger.warn(
        { assistantId: definition.id },
        'Assistant has no knowledge in the store; executing without knowledge block',
      );
    }

    // Semantic retrieval: the task prompt is embedded once per execution and
    // fused with the lexical ordering by RRF. A null embedding (no model
    // configured, or the call failed) skips fusion entirely, which keeps the
    // ranking — and therefore the rendered prompt — byte-identical to the
    // lexical-only path.
    const queryEmbedding = await this.knowledge.embedQuery(prompt);
    let semanticScores: Map<string, number> | undefined;
    if (queryEmbedding) {
      const vectorScores = await this.knowledge.semanticScores(
        queryEmbedding.vectors[0],
        queryEmbedding.model,
      );
      const lexicalOrder = rankKnowledgeEntries(
        knowledgeRecords,
        knowledgeQueryTokens(definition.id, definition.name, prompt),
      ).map((r) => r.entry.id);
      semanticScores = fuseKnowledgeRankings(lexicalOrder, vectorScores);
    }

    const rankedKnowledge = rankKnowledgeEntries(
      knowledgeRecords,
      knowledgeQueryTokens(definition.id, definition.name, prompt),
      semanticScores,
    );
    const budgeted = applyKnowledgeBudget(rankedKnowledge);
    const lessons = selectLessons(budgeted.selected);
    const lessonIds = new Set(lessons.map((l) => l.id));
    const knowledge = budgeted.selected
      .filter((r) => !lessonIds.has(r.entry.id))
      .map((r) => r.entry);

    // Knowledge content is authored as multi-line markdown in per-assistant
    // files, so each entry is rendered as its own labelled section rather than
    // flattened onto one line. High-confidence lessons render in their own
    // section; excluding them here keeps the budget spent exactly once.
    const knowledgeBlock = knowledge.length > 0
      ? `\n\n## Your Knowledge\n${knowledge.map((k) => `### ${k.title}\n${k.content}`).join('\n\n')}`
      : '';

    const lessonsBlock = lessons.length > 0
      ? `\n\n## Lessons from past missions\n${lessons.map((k) => `### ${k.title}\n${k.content}`).join('\n\n')}`
      : '';

    const transactionBlock = definition.transactionGuidance && definition.transactionGuidance.length > 0
      ? `\n\nTransaction Guidance:\n${definition.transactionGuidance.map((g) => `- ${g}`).join('\n')}`
      : '';

    const toolsContext = definition.tools?.length
      ? `\n\nAvailable tools:\n${definition.tools.map((t) => `- ${t.name}: ${t.description}`).join('\n')}\n\nTo use a tool, respond with ONLY a JSON object in this exact format:\n{"tool":"tool-name","args":{...}}`
      : '\n\nNo tools are available. Answer directly.';

    const systemPrompt = `${definition.systemPrompt}${contextBlock}${knowledgeBlock}${lessonsBlock}${transactionBlock}${toolsContext}`;

    const maxIterations = Math.max(1, Number(definition.metadata?.maxIterations) || 8);
    const conversation: Array<{ role: string; content: string }> = [{ role: 'user', content: prompt }];
    let tokensUsed = 0;
    let lastToolCall: { name: string; args: string } | null = null;
    let consecutiveSame = 0;
    let lastToolResultText: string | null = null;

    for (let i = 0; i < maxIterations; i++) {
      const brainRes = await this.callBrain(definition, systemPrompt, conversation);
      if (!brainRes.ok) {
        return {
          assistantId: definition.id,
          success: false,
          error: brainRes.error,
          ...(brainRes.spendRefusal ? { spendRefusal: brainRes.spendRefusal } : {}),
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
          { assistantId: definition.id, toolName: toolCall.name, args: this.sanitizeContext(toolCall.arguments) },
          'Assistant requested tool execution',
        );
        const toolResult = await this.executeToolCall(toolCall, definition.id);
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
    definition: AssistantDefinition,
    systemPrompt: string,
    conversation: Array<{ role: string; content: string }>,
  ): Promise<{ ok: boolean; error?: string; content?: string; tokensUsed?: number; spendRefusal?: SpendLimitRefusalPayload }> {
    const brainUrl = process.env.BRAIN_URL || 'http://brain:3100';
    const prompt = conversation
      .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
      .join('\n\n');
    // Entity-memory context: brain keys memories by sha256(tenantId\0assistantId\0entityId),
    // so the same three values the extraction path wrote under must be sent
    // here or the nudges can never fire. The slot default matches the
    // extraction fallback (assistantId) and DEFAULT_TENANT_ID.
    const entityId = typeof definition.metadata?.entityId === 'string' && definition.metadata.entityId.trim()
      ? definition.metadata.entityId.trim()
      : definition.id;
    try {
      const res = await httpRequest(`${brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          systemPrompt,
          maxTokens: 4096,
          temperature: 0.7,
          entityId,
          assistantId: definition.id,
          tenantId: definition.tenantId || DEFAULT_TENANT_ID,
          // Spend attribution (OD-5): assistant-initiated spend keys to the
          // assistant's owner; undefined falls to Brain's system bucket.
          ...(definition.ownerId ? { userId: definition.ownerId } : {}),
        }),
        timeoutMs: llmCallTimeoutMs(),
      });
      if (!res.ok) {
        if (res.status === 429) {
          // Preserve the Brain's spend-limit refusal contract so the caller
          // can surface the limit-reached notice instead of a generic failure
          // string (OD-5 review finding B). A malformed body is not a refusal.
          const refusal = parseSpendLimitRefusalPayload(await res.json().catch(() => undefined));
          if (refusal) {
            return { ok: false, error: `Brain returned ${res.status}: LLM spending limit reached`, spendRefusal: refusal };
          }
        }
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


  /**
   * The settings saved against an assistant's tool binding, if any.
   *
   * `config` on the binding is what the Skill settings tab writes; the executor
   * expects the same values as `externalConfig`, so they are looked up here rather
   * than at each call site.
   */
  private bindingConfig(assistantId: string | undefined, toolName: string): Record<string, unknown> | undefined {
    if (!assistantId) return undefined;
    try {
      const definition = this.loader?.get(assistantId);
      const binding = definition?.tools?.find((t) => t.name === toolName);
      const config = (binding as { config?: Record<string, unknown>; externalConfig?: Record<string, unknown> } | undefined)?.config
        ?? (binding as { externalConfig?: Record<string, unknown> } | undefined)?.externalConfig;
      return config && Object.keys(config).length > 0 ? config : undefined;
    } catch (err) {
      logger.warn({ assistantId, toolName, err }, 'Could not resolve skill settings for tool call');
      return undefined;
    }
  }

  async executeToolCall(tool: MCPToolCall, assistantId?: string, workspaceId?: string): Promise<MCPToolResult> {
    logger.info({ toolName: tool.name, arguments: tool.arguments, workspaceId }, 'Tool execution requested');

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (assistantId) headers['X-Assistant-Id'] = assistantId;
      // The Skill's settings are stored against the assistant's tool binding, but
      // until now nothing sent them, so the executor built the Skill with empty
      // configuration and every handler read its defaults.
      const config = this.bindingConfig(assistantId, tool.name);
      const response = await httpRequest(`${this.toolExecutorUrl}/api/tool-executor/tools/execute`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id: `tool-${Date.now()}`,
          name: tool.name,
          type: 'mcp',
          manifest: {},
          input: tool.arguments || {},
          workspaceId,
          assistantId,
          ...(config ? { externalConfig: config } : {}),
        }),
        // A skill execution may transit an LLM completion, so it needs the long ceiling.
        timeoutMs: llmCallTimeoutMs(),
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
      const response = await httpRequest(`${this.toolExecutorUrl}/api/tool-executor/tools/execute`, {
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
        timeoutMs: llmCallTimeoutMs(),
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
