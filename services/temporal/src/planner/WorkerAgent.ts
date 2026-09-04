import { Task, Phase, Plan } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

function artifactNameMatches(name: string, expected: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const base = expected.toLowerCase().replace(/\.[^.]+$/, '');
  return norm(name).includes(norm(base)) || norm(base).includes(norm(name));
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
}

export class WorkerAgent {
  private brainUrl: string;
  private agentRuntimeUrl: string | undefined;
  private workerPoolUrl: string | undefined;
  private assistantId: string | undefined;
  private agentDefinition: WorkerAgentOptions['agentDefinition'];

  constructor(options: WorkerAgentOptions) {
    this.brainUrl = options.brainUrl;
    this.agentRuntimeUrl = options.agentRuntimeUrl;
    this.workerPoolUrl = options.workerPoolUrl;
    this.assistantId = options.assistantId;
    this.agentDefinition = options.agentDefinition;
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

    const attempts = [
      { label: 'auto', body: { prompt: userPrompt, systemPrompt, maxTokens: 4096, temperature: 0.4 } },
      { label: 'openwebui', body: { prompt: userPrompt, systemPrompt, maxTokens: 4096, temperature: 0.4, provider: 'openwebui' } },
    ];

    let lastContent = '';
    const errors: string[] = [];
    for (const attempt of attempts) {
      try {
        const res = await fetch(`${this.brainUrl}/api/brain/complete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(attempt.body),
        });
        if (!res.ok) {
          const text = await res.text();
          errors.push(`[${attempt.label}] ${res.status}: ${text.slice(0, 200)}`);
          continue;
        }
        const data = await res.json() as { content: string; tokensUsed?: number };
        lastContent = data.content;

        // Self-correction: if the output produced none of the expected artifacts,
        // reflect on the gaps and refine once before returning.
        const artifacts = this.extractArtifacts(data.content, task.expectedArtifacts);
        const missing = (task.expectedArtifacts || []).filter(
          (e) => !artifacts.some((a) => artifactNameMatches(a.name, e)),
        );
        if (missing.length > 0) {
          const refined = await this.refine(task, phase, plan, systemPrompt, data.content, missing);
          if (refined) {
            return {
              output: refined,
              artifacts: this.extractArtifacts(refined, task.expectedArtifacts || []),
              tokensUsed: data.tokensUsed || 0,
            };
          }
        }

        logger.info(
          { task: task.title, phase: phase.name, provider: attempt.label, tokensUsed: data.tokensUsed || 0 },
          'Worker task completed',
        );
        return {
          output: data.content,
          artifacts,
          tokensUsed: data.tokensUsed || 0,
        };
      } catch (err: any) {
        errors.push(`[${attempt.label}] ${err.message}`);
      }
    }
    throw new Error(`Worker failed after all attempts: ${errors.join('; ')}. Last content: ${lastContent.slice(0, 200)}`);
  }

  private async refine(
    task: Task,
    phase: Phase,
    plan: Plan,
    systemPrompt: string,
    priorOutput: string,
    missing: string[],
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
        body: JSON.stringify({ prompt, systemPrompt, maxTokens: 4096, temperature: 0.4 }),
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
