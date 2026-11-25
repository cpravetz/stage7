import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LLM_SETTINGS,
  buildSavePayload,
  parseLlmSettingsDoc,
  parseModelIdList,
} from './llmSettings';

describe('parseLlmSettingsDoc', () => {
  it('returns defaults for a missing document', () => {
    expect(parseLlmSettingsDoc(undefined)).toEqual(DEFAULT_LLM_SETTINGS);
    expect(parseLlmSettingsDoc(null)).toEqual(DEFAULT_LLM_SETTINGS);
  });

  it('returns defaults for an old doc containing only freeModelsOnly', () => {
    const parsed = parseLlmSettingsDoc({ freeModelsOnly: true });
    expect(parsed.freeModelsOnly).toBe(true);
    expect(parsed.providerTimeoutMs).toBe(DEFAULT_LLM_SETTINGS.providerTimeoutMs);
    expect(parsed.approvalTimeoutMs).toBe(DEFAULT_LLM_SETTINGS.approvalTimeoutMs);
    expect(parsed.preferredModelIds).toEqual([]);
  });

  it('keeps valid values and drops invalid ones per field', () => {
    const parsed = parseLlmSettingsDoc({
      freeModelsOnly: 'yes', // invalid type
      providerTimeoutMs: 111, // valid
      providerAttemptTimeoutMs: -5, // non-positive
      completionDeadlineMs: Number.POSITIVE_INFINITY, // non-finite
      circuitThreshold: 2.5, // non-integer
      circuitCooldownMs: 'fast', // wrong type
      preferredModelIds: ['a', 42, '', 'b'], // non-strings and blanks dropped
      forbiddenModelIds: 'not-an-array',
      approvalTimeoutMs: 5000,
      approvalPollIntervalMs: 0,
      watchSchedulerPollMs: 7500,
    });
    expect(parsed.freeModelsOnly).toBe(false);
    expect(parsed.providerTimeoutMs).toBe(111);
    expect(parsed.providerAttemptTimeoutMs).toBe(DEFAULT_LLM_SETTINGS.providerAttemptTimeoutMs);
    expect(parsed.completionDeadlineMs).toBe(DEFAULT_LLM_SETTINGS.completionDeadlineMs);
    expect(parsed.circuitThreshold).toBe(DEFAULT_LLM_SETTINGS.circuitThreshold);
    expect(parsed.circuitCooldownMs).toBe(DEFAULT_LLM_SETTINGS.circuitCooldownMs);
    expect(parsed.preferredModelIds).toEqual(['a', 'b']);
    expect(parsed.forbiddenModelIds).toEqual([]);
    expect(parsed.approvalTimeoutMs).toBe(5000);
    expect(parsed.approvalPollIntervalMs).toBe(DEFAULT_LLM_SETTINGS.approvalPollIntervalMs);
    expect(parsed.watchSchedulerPollMs).toBe(7500);
  });
});

describe('parseModelIdList', () => {
  it('splits on commas, trims, and drops blanks', () => {
    expect(parseModelIdList('openai:gpt-4o,  anthropic:claude-3 ,,' )).toEqual([
      'openai:gpt-4o',
      'anthropic:claude-3',
    ]);
    expect(parseModelIdList('')).toEqual([]);
  });
});

describe('buildSavePayload', () => {
  it('includes every known field, edited and untouched', () => {
    const loaded = parseLlmSettingsDoc({ freeModelsOnly: true, providerTimeoutMs: 111 });
    const payload = buildSavePayload(
      { freeModelsOnly: true, providerTimeoutMs: 111, futureField: { nested: 1 } },
      { ...loaded, approvalTimeoutMs: 999 },
      'a, b',
      'c'
    );
    expect(Object.keys(payload).sort()).toEqual(
      expect.arrayContaining([
        'freeModelsOnly',
        'providerTimeoutMs',
        'providerAttemptTimeoutMs',
        'completionDeadlineMs',
        'circuitThreshold',
        'circuitCooldownMs',
        'preferredModelIds',
        'forbiddenModelIds',
        'approvalTimeoutMs',
        'approvalPollIntervalMs',
        'watchSchedulerPollMs',
      ])
    );
    expect(payload.freeModelsOnly).toBe(true);
    expect(payload.providerTimeoutMs).toBe(111); // untouched, preserved
    expect(payload.approvalTimeoutMs).toBe(999); // edited
    expect(payload.preferredModelIds).toEqual(['a', 'b']);
    expect(payload.forbiddenModelIds).toEqual(['c']);
    expect(payload.futureField).toEqual({ nested: 1 }); // unknown fields survive
  });

  it('writes an empty list when the editor text is cleared', () => {
    const loaded = parseLlmSettingsDoc({ preferredModelIds: ['a'] });
    const payload = buildSavePayload({ preferredModelIds: ['a'] }, loaded, '', '');
    expect(payload.preferredModelIds).toEqual([]);
    expect(payload.forbiddenModelIds).toEqual([]);
  });

  it('omits loaded-data merging when nothing was loaded', () => {
    const payload = buildSavePayload(undefined, DEFAULT_LLM_SETTINGS, '', '');
    expect(Object.keys(payload)).toHaveLength(11);
  });
});
