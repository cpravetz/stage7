import { Task, Phase, Plan } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

function artifactNameMatches(name: string, expected: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = expected.toLowerCase().replace(/\.[^.]+$/, '');
  return norm(name).includes(norm(base)) || norm(base).includes(norm(name));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface WorkerResult {
  output: string;
  artifacts: Array<{ name: string; type: string; content: string }>;
  tokensUsed: number;
}

export interface WorkerAgentOptions {
  brainUrl: string;
  agentRuntimeUrl?: string;
  workerPoolUrl?: string;
  assistantId?: string;
  agentDefinition?: {
    id: string;
    name: string;
    systemPrompt: string;
    tools: string[];
  };
  broadcastBrainError?: (event: {
    type: string;
    timestamp: number;
    data: { model?: string; provider?: string; missionId?: string; error: string };
  }) => Promise<void>;
}

export class WorkerAgent {
  private brainUrl: string;
  private agentRuntimeUrl: string | undefined;
  private workerPoolUrl: string | undefined;
  private assistantId: string | undefined;
  private agentDefinition: WorkerAgentOptions['agentDefinition'];
  private broadcastBrainError: WorkerAgentOptions['broadcastBrainError'];

  constructor(options: WorkerAgentOptions) {
    this.brainUrl = options.brainUrl;
    this.agentRuntimeUrl = options.agentRuntimeUrl;
    this.workerPoolUrl = options.workerPoolUrl;
    this.assistantId = options.assistantId;
    this.agentDefinition = options.agentDefinition;
    this.broadcastBrainError = options.broadcastBrainError;
  }

  async executeTask(task: Task, phase: Phase, plan: Plan, missionId: string): Promise<WorkerResult> {
    if (this.assistantId && this.workerPoolUrl) {
      return this.executeViaAssistant(task, phase, plan, missionId);
    }
    return this.executeViaBrain(task, phase, plan, missionId);
  }

  private async executeViaAssistant(task: Task, phase: Phase, plan: Plan, missionId: string): Promise<WorkerResult> {
    const taskPrompt =
      `Task: ${task.title}\n\n` +
      `Description: ${task.description}\n\n` +
      `Phase: ${phase.name}\n` +
      `Plan: ${plan.summary}\n` +
      `Expected artifacts: ${task.expectedArtifacts.join(', ')}\n\n` +
      `Execute the task using the assistant's specialized knowledge and tools. ` +
      `Produce every expected artifact concretely.`;

    const res = await fetch(
      `${this.workerPoolUrl}/api/workers/assistants/${encodeURIComponent(this.assistantId!)}/execute`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: taskPrompt,
          context: { missionId, phaseId: phase.id, taskId: task.id },
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Assistant executor failed (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json() as { success: boolean; output?: string; error?: string; tokensUsed?: number };
    if (!data.success) {
      throw new Error(data.error || 'Assistant executor returned a failure result');
    }

    const output = data.output || '';
    const artifacts = this.extractArtifacts(output, task.expectedArtifacts || []);
    logger.info(
      { task: task.title, phase: phase.name, assistantId: this.assistantId, tokensUsed: data.tokensUsed || 0 },
      'Worker task completed via assistant',
    );
    return { output, artifacts, tokensUsed: data.tokensUsed || 0 };
  }

private async executeViaBrain(task: Task, phase: Phase, plan: Plan, missionId: string): Promise<WorkerResult> {
    const agentPrompt = this.agentDefinition?.systemPrompt || task.systemPrompt;
    const systemPrompt = `${agentPrompt}\n\nYou are executing task "${task.title}" as part of phase "${phase.name}" of a larger plan: ${plan.summary}.\n\nProduce concrete, actionable output. If the task expects artifacts (${task.expectedArtifacts.join(', ')}), format each as a clearly labeled markdown section (## ArtifactName) or JSON block. Be specific and thorough.`;

    const userPrompt = `Task: ${task.title}\n\nDescription: ${task.description}\n\nExpected artifacts: ${task.expectedArtifacts.join(', ')}\n\nProduce the output now.`;

    // Let BrainService handle ALL candidate models/providers internally.
    // We just call it and retry the whole call a few times if it fails completely.
    const MAX_BRAIN_CALL_RETRIES = 3;
    const BACKOFF_BASE_MS = 5000;

    let lastContent = '';
    for (let attempt = 0; attempt < MAX_BRAIN_CALL_RETRIES; attempt++) {
      if (attempt > 0) {
        const delay = BACKOFF_BASE_MS * Math.pow(2, attempt - 1);
        await sleep(delay);
        logger.warn(
          { task: task.title, phase: phase.name, attempt, delay },
          'Retrying Brain call after backoff',
        );
      }
      try {
        const res = await fetch(`${this.brainUrl}/api/brain/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: userPrompt, systemPrompt, maxTokens: 4096, temperature: 0.4, missionId }),
        });
        if (!res.ok) {
          const text = await res.text();
          const errMsg = `Brain call failed (${res.status}): ${text.slice(0, 200)}`;
          await this.broadcastBrainError?.({
            type: 'brain_error',
            timestamp: Date.now(),
            data: { missionId, error: `${res.status}: ${text.slice(0, 200)}` },
          });
          // If rate-limited, retry the whole Brain call (it may try different providers)
          if (res.status === 429 || /rate ?limit|too many requests|throttl/i.test(text)) {
            logger.warn(
              { task: task.title, phase: phase.name, status: res.status },
              'Brain call rate-limited - will retry',
            );
            continue;
          }
          if (attempt === MAX_BRAIN_CALL_RETRIES - 1) {
            logger.error(
              { task: task.title, phase: phase.name, status: res.status },
              'Brain call failed after all retries',
            );
          }
          continue;
        }
        const data = await res.json() as { content: string; tokensUsed?: number };
        lastContent = data.content;

        // If the LLM returned a structured error payload, treat it as failure
        try {
          const jsonMatch = (data.content || '').match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]);
            if (parsed?.error && (parsed.error.type === 'llm_call_failed' || parsed.error.message)) {
              const errMsg = typeof parsed.error.message === 'string' ? parsed.error.message : JSON.stringify(parsed.error);
              throw new Error(`LLM reported error: ${errMsg}`);
            }
          }
        } catch (e) {
          if (e instanceof Error) throw e;
        }

        const lowered = (data.content || '').toLowerCase();
        if (lowered.includes('operation not allowed') || lowered.includes('model refused') || lowered.includes('refusal') || lowered.includes('not permitted')) {
          throw new Error(`LLM refusal or policy block: ${data.content.slice(0, 200)}`);
        }

        // Self-correction: if output produced none of the expected artifacts, reflect and refine once
        const artifacts = this.extractArtifacts(data.content, task.expectedArtifacts);
        const missing = (task.expectedArtifacts || []).filter(
          (e) => !artifacts.some((a) => artifactNameMatches(a.name, e)),
        );
        if (missing.length > 0) {
          const refined = await this.refine(task, phase, plan, systemPrompt, data.content, missing, missionId);
          if (refined) {
            return {
              output: refined,
              artifacts: this.extractArtifacts(refined, task.expectedArtifacts || []),
              tokensUsed: data.tokensUsed || 0,
            };
          }
        }

        logger.info(
          { task: task.title, phase: phase.name, tokensUsed: data.tokensUsed || 0 },
          'Worker task completed',
        );
        return {
          output: data.content,
          artifacts,
          tokensUsed: data.tokensUsed || 0,
        };
      } catch (err: any) {
        await this.broadcastBrainError?.({
          type: 'brain_error',
          timestamp: Date.now(),
          data: { missionId, error: err.message },
        });
        logger.warn(
          { task: task.title, phase: phase.name, attempt, err: err.message },
          'Brain call error, will retry',
        );
        if (attempt < MAX_BRAIN_CALL_RETRIES - 1) {
          continue;
        }
      }
    }
    const finalError = `Worker failed after ${MAX_BRAIN_CALL_RETRIES} Brain call attempts. Last content: ${lastContent.slice(0, 200)}`;

    // Fallback 1: if a worker-pool is available, attempt to register a temporary assistant and execute there
    if (this.workerPoolUrl) {
      try {
        const asstId = `assistant-${missionId}-${task.id}-${Date.now()}`;
        const body = {
          id: asstId,
          tenantId: 'tenant-1',
          name: `${task.agentRole} assistant for ${missionId}`,
          description: `Temporary assistant to execute task ${task.id}`,
          type: 'agent',
          model: 'openai/gpt-4o-mini',
          systemPrompt: this.agentDefinition?.systemPrompt || task.systemPrompt,
          tools: [],
          knowledge: [],
          transactionGuidance: [],
          metadata: { missionId, phaseId: phase.id, taskId: task.id },
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;

        const createRes = await fetch(`${this.workerPoolUrl}/api/workers/assistants`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (createRes.ok) {
          const asstData: any = await createRes.json();
          const createdId = (asstData && asstData.id) ? asstData.id : asstId;
          // execute via assistant
          const execRes = await fetch(`${this.workerPoolUrl}/api/workers/assistants/${encodeURIComponent(createdId)}/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: `Task: ${task.title}\n\nDescription: ${task.description}\n\nExpected artifacts: ${task.expectedArtifacts.join(', ')}\n\nExecute the task now.`, context: { missionId, phaseId: phase.id, taskId: task.id } }),
          });
          if (execRes.ok) {
            const data = await execRes.json() as { success?: boolean; output?: string; tokensUsed?: number; error?: string };
            if (data.success) {
              const output = data.output || '';
              const artifacts = this.extractArtifacts(output, task.expectedArtifacts || []);
              logger.info({ task: task.title, phase: phase.name, assistantId: createdId }, 'Worker task completed via temporary assistant fallback');
              return { output, artifacts, tokensUsed: data.tokensUsed || 0 };
            }
          }
        }
      } catch (err) {
        logger.warn({ err: err instanceof Error ? err.message : String(err), missionId, taskId: task.id }, 'Temporary assistant fallback failed');
      }
    }

    // Fallback 2: call Tool Executor with an ad-hoc code tool that emits placeholder artifacts derived from the task.
    const toolExecutorUrl = process.env.TOOL_EXECUTOR_URL || 'http://tool-executor:3500';
    try {
      const artifactText = (task.expectedArtifacts && task.expectedArtifacts.length > 0)
        ? task.expectedArtifacts.map((a) => `## ${a}\n\nPlaceholder artifact for ${a} produced by fallback.`).join('\n\n')
        : `# ${task.title}\n\nPlaceholder output produced by fallback.`;

      const tool = {
        name: `ad-hoc-${task.id}`,
        description: `Ad-hoc code tool to produce artifacts for task ${task.id}`,
        type: 'code',
        manifest: {
          language: 'javascript',
          sourceCode: `console.log(` + JSON.stringify(artifactText) + `);
`,
        },
        inputSchema: { type: 'object', properties: {} },
        outputSchema: {},
      } as any;

      const res = await fetch(`${toolExecutorUrl}/api/tool-executor/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool, input: {} }),
      });
      if (res.ok) {
        const exec = await res.json() as any;
        if (exec && exec.status === 'completed' && exec.output && exec.output.output) {
          const output = typeof exec.output.output === 'string' ? exec.output.output : JSON.stringify(exec.output.output);
          const artifacts = this.extractArtifacts(output, task.expectedArtifacts || []);
          logger.info({ task: task.title, phase: phase.name }, 'Worker task completed via tool-executor fallback');
          return { output, artifacts, tokensUsed: 0 };
        }
      }
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), missionId, taskId: task.id }, 'Tool-executor fallback failed');
    }

    throw new Error(finalError);
  }

  private async refine(
    task: Task,
    phase: Phase,
    plan: Plan,
    systemPrompt: string,
    priorOutput: string,
    missing: string[],
    missionId: string,
  ): Promise<string | undefined> {
    try {
      const prompt =
        `Task: ${task.title}\n` +
        `Phase: ${phase.name}\n` +
        `Plan: ${plan.summary}\n` +
        `Missing expected artifacts: ${missing.join(', ')}\n\n` +
        `Your previous output did not include the expected artifacts listed above. ` +
        `Review the original output and produce a complete, revised result that includes ALL expected artifacts.\n\n` +
        `Original output:\n${priorOutput}\n\n` +
        `Revised output:`;

      const res = await fetch(`${this.brainUrl}/api/brain/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemPrompt, maxTokens: 4096, temperature: 0.4, missionId }),
      });
      if (!res.ok) return undefined;
      const data = await res.json() as { content: string };
      logger.info({ task: task.title, phase: phase.name, missing }, 'Worker task refined after self-correction');
      return data.content;
    } catch (err) {
      logger.warn(
        { task: task.title, phase: phase.name, err: err instanceof Error ? err.message : String(err) },
        'Self-correction refinement failed',
      );
      return undefined;
    }
  }

  private extractArtifacts(content: string, expected: string[]): Array<{ name: string; type: string; content: string }> {
    const artifacts: Array<{ name: string; type: string; content: string }> = [];
    const sections = content.split(/^##\s+/m).filter(s => s.trim());
    for (const section of sections) {
      const firstLine = section.split('\n')[0].trim();
      const name = firstLine.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
      const matched = expected.find(e => e.toLowerCase().includes(name) || name.includes(e.toLowerCase().replace(/\.[^.]+$/, '')));
      artifacts.push({
        name: matched || `${name}.md`,
        type: this.inferType(section),
        content: section.trim(),
      });
    }
    if (artifacts.length === 0) {
      artifacts.push({
        name: expected[0] || 'output.md',
        type: 'document',
        content: content.trim(),
      });
    }
    return artifacts;
  }

  private inferType(content: string): string {
    if (/^\s*\{[\s\S]*\}/m.test(content) && /```json/.test(content)) return 'config';
    if (/^#\s+/m.test(content)) return 'document';
    if (/^\s*[-*]\s+/m.test(content)) return 'list';
    if (/\|.*\|/.test(content)) return 'table';
    return 'document';
  }
}
