import { Task, Phase, Plan } from '@stage7-nextgen/shared';
import { logger } from '@stage7-nextgen/shared';

export interface WorkerResult {
  output: string;
  artifacts: Array<{ name: string; type: string; content: string }>;
  tokensUsed: number;
}

export class WorkerAgent {
  constructor(private brainUrl: string) {}

  async executeTask(task: Task, phase: Phase, plan: Plan, missionId: string): Promise<WorkerResult> {
    const systemPrompt = `${task.systemPrompt}\n\nYou are executing task "${task.title}" as part of phase "${phase.name}" of a larger plan: ${plan.summary}.\n\nProduce concrete, actionable output. If the task expects artifacts (${task.expectedArtifacts.join(', ')}), format each as a clearly labeled markdown section or JSON block. Be specific.`;

    const userPrompt = `Task: ${task.title}\n\nDescription: ${task.description}\n\nExpected artifacts: ${task.expectedArtifacts.join(', ')}\n\nProduce the output now.`;

    const attempts = [
      { label: 'auto', body: { prompt: userPrompt, systemPrompt, maxTokens: 4096, temperature: 0.4 } },
      { label: 'openwebui', body: { prompt: userPrompt, systemPrompt, maxTokens: 4096, temperature: 0.4, provider: 'openwebui' } },
    ];

    const errors: string[] = [];
    let lastError: Error | null = null;
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

        const artifacts = this.extractArtifacts(data.content, task.expectedArtifacts);

        logger.info({ task: task.title, phase: phase.name, provider: attempt.label, tokensUsed: data.tokensUsed || 0 }, 'Worker task completed');
        return {
          output: data.content,
          artifacts,
          tokensUsed: data.tokensUsed || 0,
        };
      } catch (err: any) {
        errors.push(`[${attempt.label}] ${err.message}`);
        lastError = err;
      }
    }
    throw new Error(`Worker failed after all attempts: ${errors.join('; ')}. Last error: ${lastError?.message}`);
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
