import { nextModelCooldown, normalizeCooldownError } from '../src/services/BrainService';

const BASE = 300_000;
const MAX = 24 * 60 * 60 * 1000;

describe('nextModelCooldown', () => {
  it('uses the base cooldown for the first failure', () => {
    const result = nextModelCooldown(undefined, '400 invalid argument', BASE, MAX);
    expect(result.consecutiveFailures).toBe(1);
    expect(result.cooldownMs).toBe(BASE);
  });

  it('doubles the cooldown when the same error repeats after expiry', () => {
    const first = nextModelCooldown(undefined, '400 invalid argument', BASE, MAX);
    const second = nextModelCooldown(
      { reason: '400 invalid argument', consecutiveFailures: first.consecutiveFailures },
      '400 invalid argument',
      BASE,
      MAX,
    );
    expect(second.consecutiveFailures).toBe(2);
    expect(second.cooldownMs).toBe(BASE * 2);

    const third = nextModelCooldown(
      { reason: '400 invalid argument', consecutiveFailures: second.consecutiveFailures },
      '400 invalid argument',
      BASE,
      MAX,
    );
    expect(third.consecutiveFailures).toBe(3);
    expect(third.cooldownMs).toBe(BASE * 4);
  });

  it('resets to the base cooldown when a different error occurs', () => {
    const result = nextModelCooldown(
      { reason: '400 invalid argument', consecutiveFailures: 4 },
      '429 rate limited',
      BASE,
      MAX,
    );
    expect(result.consecutiveFailures).toBe(1);
    expect(result.cooldownMs).toBe(BASE);
  });

  it('treats volatile values in an error as the same failure', () => {
    const result = nextModelCooldown(
      { reason: '400 invalid argument (request abc12345, retry in 5.2s)', consecutiveFailures: 1 },
      '400 invalid argument (request deadbeef, retry in 9.8s)',
      BASE,
      MAX,
    );
    expect(result.consecutiveFailures).toBe(2);
    expect(result.cooldownMs).toBe(BASE * 2);
  });

  it('caps the cooldown at the configured maximum', () => {
    const result = nextModelCooldown(
      { reason: '400 invalid argument', consecutiveFailures: 20 },
      '400 invalid argument',
      BASE,
      MAX,
    );
    expect(result.cooldownMs).toBe(MAX);
  });
});

describe('normalizeCooldownError', () => {
  it('collapses volatile numbers and hex ids', () => {
    expect(normalizeCooldownError('400 request 1a2b3c4d5e6f in 12.5s'))
      .toBe(normalizeCooldownError('400 request deadbeef in 30.0s'));
  });
});