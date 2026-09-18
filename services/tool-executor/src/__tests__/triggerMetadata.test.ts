import { validateTriggers, exportTriggerSummary } from '../utils/triggerMetadata';
import { SkillTrigger } from '../types';

describe('validateTriggers', () => {
  it('returns valid for empty triggers', () => {
    const result = validateTriggers(undefined);
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
    expect(result.triggers).toHaveLength(0);
  });

  it('returns valid for empty array', () => {
    const result = validateTriggers([]);
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('validates user triggers', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'user', phrase_examples: ['hello', 'hi'] },
    ];
    const result = validateTriggers(triggers);
    expect(result.valid).toBe(true);
    expect(result.errorCount).toBe(0);
  });

  it('detects missing user phrase_examples', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'user', phrase_examples: [] },
    ];
    const result = validateTriggers(triggers);
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBe(1);
    expect(result.triggers[0].errors[0]).toContain('phrase_examples');
  });

  it('validates schedule triggers', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'schedule', cadence: 'daily' },
    ];
    const result = validateTriggers(triggers);
    expect(result.valid).toBe(true);
  });

  it('detects missing schedule cadence', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'schedule', cadence: '' },
    ];
    const result = validateTriggers(triggers);
    expect(result.valid).toBe(false);
    expect(result.triggers[0].errors[0]).toContain('cadence');
  });

  it('validates event triggers', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'event', on: 'deployment' },
    ];
    const result = validateTriggers(triggers);
    expect(result.valid).toBe(true);
  });

  it('detects missing event on', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'event', on: '' },
    ];
    const result = validateTriggers(triggers);
    expect(result.valid).toBe(false);
  });

  it('validates data triggers', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'data', condition: 'metrics > 0' },
    ];
    const result = validateTriggers(triggers);
    expect(result.valid).toBe(true);
  });

  it('detects missing data condition', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'data', condition: '' },
    ];
    const result = validateTriggers(triggers);
    expect(result.valid).toBe(false);
  });

  it('validates mixed triggers', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'user', phrase_examples: ['hello'] },
      { kind: 'schedule', cadence: 'daily' },
      { kind: 'event', on: '' },
    ];
    const result = validateTriggers(triggers);
    expect(result.valid).toBe(false);
    expect(result.errorCount).toBe(1);
  });

  it('returns details for each trigger', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'user', phrase_examples: ['hello'] },
    ];
    const result = validateTriggers(triggers);
    expect(result.triggers[0].details).toEqual({
      kind: 'user',
      phrase_examples: ['hello'],
    });
  });
});

describe('exportTriggerSummary', () => {
  it('returns empty for undefined', () => {
    expect(exportTriggerSummary(undefined)).toHaveLength(0);
  });

  it('exports user trigger summary', () => {
    const triggers: SkillTrigger[] = [{ kind: 'user', phrase_examples: ['hello', 'hi'] }];
    const result = exportTriggerSummary(triggers);
    expect(result).toEqual([
      { kind: 'user', summary: 'User-triggered (2 phrase examples)' },
    ]);
  });

  it('exports schedule trigger summary', () => {
    const triggers: SkillTrigger[] = [{ kind: 'schedule', cadence: 'weekly' }];
    const result = exportTriggerSummary(triggers);
    expect(result).toEqual([
      { kind: 'schedule', summary: 'Schedule: weekly' },
    ]);
  });

  it('exports event trigger summary', () => {
    const triggers: SkillTrigger[] = [{ kind: 'event', on: 'deployment' }];
    const result = exportTriggerSummary(triggers);
    expect(result).toEqual([
      { kind: 'event', summary: 'Event: deployment' },
    ]);
  });

  it('exports data trigger summary', () => {
    const triggers: SkillTrigger[] = [{ kind: 'data', condition: 'x > 1' }];
    const result = exportTriggerSummary(triggers);
    expect(result).toEqual([
      { kind: 'data', summary: 'Data condition: x > 1' },
    ]);
  });

  it('exports multiple trigger summaries', () => {
    const triggers: SkillTrigger[] = [
      { kind: 'user', phrase_examples: ['go'] },
      { kind: 'schedule', cadence: 'daily' },
    ];
    const result = exportTriggerSummary(triggers);
    expect(result).toHaveLength(2);
    expect(result[0].kind).toBe('user');
    expect(result[1].kind).toBe('schedule');
  });
});
