import { randomUUID } from 'node:crypto';
import type { AssistantDefinition, AssistantHarness, HeuristicEntry } from '@stage7-nextgen/shared';
import { logger } from '../utils/logger';
import { BrainService } from './BrainService';

export interface DistillationInput {
  assistantId: string;
  tenantId?: string;
  missionId?: string;
  taskId?: string;
  errors?: Array<{ message: string; context?: string; evidence?: string[] }>;
  events?: Array<Record<string, unknown>>;
  artifacts?: Array<Record<string, unknown>>;
  traces?: Array<Record<string, unknown>>;
}

export interface DistillationResult {
  heuristics: HeuristicEntry[];
  harnessVersion?: string;
}

const DISTILLATION_PROMPT = 'What errors occurred, what caused them, and what minimal rule/wrapper/tool change would prevent recurrence? Return concrete heuristics with evidence.';

export class DistillationService {
  constructor(private brain: BrainService) {}

  async distill(input: DistillationInput): Promise<DistillationResult> {
    const context = JSON.stringify(
      {
        assistantId: input.assistantId,
        missionId: input.missionId,
        taskId: input.taskId,
        errors: input.errors || [],
        events: input.events || [],
        artifacts: input.artifacts || [],
        traces: input.traces || [],
      },
      null,
      2,
    );

    const prompt = `${DISTILLATION_PROMPT}\n\nContext:\n${context}\n\nReturn a JSON object with shape: {"heuristics": [{"rule": "...", "rationale": "...", "confidence": 0-1, "evidence": ["..."], "context": "..."}]}`;

    try {
      const result = await this.brain.complete(prompt, {
        optimizeFor: 'speed',
        maxTokens: 1024,
        temperature: 0.2,
      });

      const content = result.content || '';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      let parsed: any = null;
      if (jsonMatch) {
        try {
          parsed = JSON.parse(jsonMatch[0]);
        } catch (e) {
          parsed = null;
        }
      }

      const heuristics: HeuristicEntry[] = [];
      if (parsed && Array.isArray(parsed.heuristics)) {
        for (const h of parsed.heuristics) {
          if (!h || typeof h.rule !== 'string') continue;
          const rule = h.rule.trim();
          if (!rule) continue;
          const entry: HeuristicEntry = {
            id: randomUUID(),
            rule,
            rationale: typeof h.rationale === 'string' ? h.rationale : undefined,
            confidence: typeof h.confidence === 'number' ? Math.max(0, Math.min(1, h.confidence)) : 0.7,
            source: 'distillation',
            appliedCount: 0,
            lastAppliedAt: undefined,
            evidence: Array.isArray(h.evidence) ? h.evidence.filter((e: any) => typeof e === 'string') : [],
            active: true,
            ts: new Date().toISOString(),
            context: typeof h.context === 'string' ? h.context : input.missionId || input.taskId || undefined,
            metadata: { missionId: input.missionId, taskId: input.taskId },
          };
          heuristics.push(entry);
        }
      }

      return { heuristics };
    } catch (err) {
      logger.warn({ err: err instanceof Error ? err.message : String(err), assistantId: input.assistantId }, 'Distillation failed');
      return { heuristics: [] };
    }
  }

  applyDistillation(def: AssistantDefinition, distill: DistillationResult): AssistantDefinition {
    const harness: AssistantHarness = def.harness
      ? { ...def.harness }
      : {
          version: '1.0',
          systemPrompt: def.systemPrompt,
          tools: def.tools,
          skills: [],
          heuristics: [],
          memory: { episodic: [], semantic: [], working: {} },
          subAgents: [],
          routing: {},
          guardrails: {},
          metadata: {},
          updatedAt: new Date(),
        };

    const existingHeuristics = Array.isArray(harness.heuristics) ? harness.heuristics : [];
    const newHeuristics = [...existingHeuristics, ...distill.heuristics];
    const currentVersion = harness.version || '1.0';
    let nextVersion: string;
    const num = Number(currentVersion);
    if (!isNaN(num)) {
      nextVersion = String(num + 1);
    } else if (currentVersion.includes('.')) {
      const parts = currentVersion.split('.');
      const last = Number(parts[parts.length - 1]);
      if (!isNaN(last)) {
        parts[parts.length - 1] = String(last + 1);
        nextVersion = parts.join('.');
      } else {
        nextVersion = currentVersion + '.1';
      }
    } else {
      nextVersion = currentVersion + '.1';
    }

    const history = Array.isArray(harness.history) ? [...harness.history] : [];
    const historyEntry: any = {
      version: harness.version || nextVersion,
      snapshot: { ...harness },
      timestamp: new Date(),
      reason: 'distillation',
    };
    history.push(historyEntry);
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }

    const updatedHarness: AssistantHarness = {
      ...harness,
      heuristics: newHeuristics,
      version: nextVersion,
      updatedAt: new Date(),
      history,
    };

    return {
      ...def,
      harness: updatedHarness,
      updatedAt: new Date(),
    };
  }
}

export function createDistillationService(brain: BrainService): DistillationService {
  return new DistillationService(brain);
}
