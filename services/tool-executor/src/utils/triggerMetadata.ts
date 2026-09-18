import { SkillTrigger } from '../types';

export interface ValidatedTrigger {
  kind: string;
  valid: boolean;
  details: Record<string, unknown>;
  errors: string[];
}

export interface TriggerValidationResult {
  triggers: ValidatedTrigger[];
  valid: boolean;
  errorCount: number;
}

const REQUIRED_FIELDS: Record<string, string[]> = {
  user: ['phrase_examples'],
  schedule: ['cadence'],
  event: ['on'],
  data: ['condition'],
};

export function validateTriggers(triggers: SkillTrigger[] | undefined): TriggerValidationResult {
  if (!triggers || triggers.length === 0) {
    return { triggers: [], valid: true, errorCount: 0 };
  }

  const results: ValidatedTrigger[] = triggers.map((trigger) => {
    const kind = trigger.kind;
    const required = REQUIRED_FIELDS[kind] || [];
    const errors: string[] = [];

    for (const field of required) {
      const value = (trigger as Record<string, unknown>)[field];
      if (value === undefined || value === null) {
        errors.push(`Missing required field "${field}" for trigger kind "${kind}"`);
      } else if (Array.isArray(value) && value.length === 0) {
        errors.push(`Empty array field "${field}" for trigger kind "${kind}"`);
      } else if (typeof value === 'string' && value.trim() === '') {
        errors.push(`Empty string field "${field}" for trigger kind "${kind}"`);
      }
    }

    const details: Record<string, unknown> = {};
    for (const key of Object.keys(trigger)) {
      details[key] = (trigger as Record<string, unknown>)[key];
    }

    return {
      kind,
      valid: errors.length === 0,
      details,
      errors,
    };
  });

  const errorCount = results.filter((r) => !r.valid).length;

  return {
    triggers: results,
    valid: errorCount === 0,
    errorCount,
  };
}

export interface ExportedTrigger {
  kind: string;
  summary: string;
}

export function exportTriggerSummary(triggers: SkillTrigger[] | undefined): ExportedTrigger[] {
  if (!triggers) return [];

  return triggers.map((trigger) => {
    switch (trigger.kind) {
      case 'user':
        return {
          kind: 'user',
          summary: `User-triggered (${(trigger as { phrase_examples: string[] }).phrase_examples.length} phrase examples)`,
        };
      case 'schedule':
        return {
          kind: 'schedule',
          summary: `Schedule: ${(trigger as { cadence: string }).cadence}`,
        };
      case 'event':
        return {
          kind: 'event',
          summary: `Event: ${(trigger as { on: string }).on}`,
        };
      case 'data':
        return {
          kind: 'data',
          summary: `Data condition: ${(trigger as { condition: string }).condition}`,
        };
      default:
        return {
          kind: (trigger as SkillTrigger & { kind: string }).kind,
          summary: 'Unknown trigger type',
        };
    }
  });
}
