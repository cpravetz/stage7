import { createDistillationService, DistillationInput } from './DistillationService';
import { BrainService } from './BrainService';

export interface DistillationOrchestratorDeps {
  brain: BrainService;
  getAssistant: (assistantId: string) => Promise<any | undefined>;
  saveAssistant: (assistant: any) => Promise<any>;
  getMissionEvents?: (missionId: string) => Promise<Array<Record<string, unknown>>>;
  getMissionArtifacts?: (missionId: string) => Promise<Array<Record<string, unknown>>>;
}

export class DistillationOrchestrator {
  private distillation;

  constructor(private deps: DistillationOrchestratorDeps) {
    this.distillation = createDistillationService(deps.brain);
  }

  async triggerAsync(input: DistillationInput): Promise<void> {
    setTimeout(() => {
      this.trigger(input).catch(() => {
        // ignore
      });
    }, 0);
  }

  async trigger(input: DistillationInput): Promise<void> {
    const assistant = await this.deps.getAssistant(input.assistantId);
    if (!assistant) return;
    const events = input.events || (this.deps.getMissionEvents ? await this.deps.getMissionEvents(input.missionId || '') : []) || [];
    const artifacts = input.artifacts || (this.deps.getMissionArtifacts ? await this.deps.getMissionArtifacts(input.missionId || '') : []) || [];
    const result = await this.distillation.distill({ ...input, events, artifacts });
    const updated = this.distillation.applyDistillation(assistant, result);
    await this.deps.saveAssistant(updated);
  }
}

export function createDistillationOrchestrator(deps: DistillationOrchestratorDeps): DistillationOrchestrator {
  return new DistillationOrchestrator(deps);
}
