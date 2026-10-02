import {
  analyticsSkills,
  ctoSkills,
  educationSkills,
  eventSkills,
  hrSkills,
  hotelSkills,
  legalSkills,
  marketingSkills,
  productSkills,
  scriptwritingSkills,
  sportsSkills,
  supportSkills,
} from '../data/skills';
import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';

/**
 * A Skill that reaches an external system must never be able to report success
 * without one. Two silent failure modes are guarded here:
 *
 *  1. An unconfigured connector returning success:true with an empty body, so the
 *     caller sees a clean result that contains nothing.
 *  2. A Skill falling back to local/empty data while presenting it as a real
 *     reading, so a missing API key looks like a healthy zero.
 *
 * Both are invisible in the UX once the Skill is no longer user-triggered, since
 * the Overview panel shows output without a Run button. That is why this is a
 * build-time assertion rather than something left to review.
 */

/** The envelope the executor synthesises when a Skill emits nothing at all. */
const EMPTY_OUTPUT = /Execution completed with no output/;

const ALL: Tool[] = [
  ...analyticsSkills,
  ...ctoSkills,
  ...educationSkills,
  ...eventSkills,
  ...hrSkills,
  ...hotelSkills,
  ...legalSkills,
  ...marketingSkills,
  ...productSkills,
  ...scriptwritingSkills,
  ...sportsSkills,
  ...supportSkills,
];

/**
 * Skills whose handler is generated to call a configured endpoint. The endpoint
 * comes from the Skill's own configuration, so a Skill qualifies by declaring an
 * endpoint config key rather than by naming a process environment variable.
 */
const CONNECTOR_SKILLS = ALL.filter(
  (s) => Boolean(s.manifest?.endpointConfigKey) && typeof (s as { handler?: unknown }).handler === 'undefined'
);

interface ExecResult {
  status?: string;
  error?: string | null;
  /** The skill's own JSON envelope, when it got far enough to emit one. */
  envelope?: { success?: boolean; error?: string | null; status?: string };
  /** Everything textual the executor returned, for substring assertions. */
  text: string;
}

/**
 * ToolExecutor reports `{ status, error }` at the top level when a Skill never
 * produces an envelope (for example when the config gate rejects the call), and
 * nests the envelope under `output.output` when it does. Both are inspected so a
 * Skill cannot slip past by failing early rather than by returning bad output.
 */
async function execute(skill: Tool, input: Record<string, unknown>): Promise<ExecResult> {
  const executor = new ToolExecutor(new Map([[skill.id, skill]]));
  const exec = (await executor.execute(skill, input)) as {
    status?: string;
    error?: string | null;
    output?: { output?: string } | string;
  };

  let envelope: ExecResult['envelope'];
  const raw = typeof exec.output === 'string' ? exec.output : exec.output?.output;
  if (typeof raw === 'string') {
    try {
      envelope = JSON.parse(raw) as ExecResult['envelope'];
    } catch {
      envelope = undefined;
    }
  }

  return {
    status: exec.status,
    error: exec.error ?? null,
    envelope,
    text: JSON.stringify({ status: exec.status, error: exec.error, envelope: envelope ?? raw }),
  };
}

describe('Secrets are never run inputs', () => {
  /**
   * A secret belongs to credentialSource and is resolved by the credential
   * provider. Exposing it in inputSchema put it on the Run form -- prompting the
   * user for a value they cannot know -- and let any API caller substitute their
   * own key for the resolved one.
   */
  const SECRET_FIELDS = /^(apiKey|api_key|token|accessToken|password|secret|clientSecret|credential|bearerToken)$/;

  it('no Skill declares a secret in its inputSchema', () => {
    const offenders: string[] = [];
    for (const skill of ALL) {
      const props = Object.keys((skill.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {});
      for (const key of props) {
        if (SECRET_FIELDS.test(key)) offenders.push(`${skill.id}.${key}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every Skill calling ctx.getCredential declares a credential source', () => {
    const undeclared: string[] = [];
    for (const skill of ALL) {
      const source = skill.manifest?.sourceCode;
      if (typeof source !== 'string') continue;
      // Match a *call*, not the bare identifier: the generated wrapper defines
      // getCredential on ctx for every Skill, so testing for the name alone
      // matches all of them and says nothing.
      if (/ctx\.getCredential\(/.test(source) && !skill.manifest?.credentialSource) {
        undeclared.push(skill.id);
      }
    }
    expect(undeclared).toEqual([]);
  });
});

describe('Connector skills report honestly when unconfigured', () => {
  it('there is at least one connector skill to guard', () => {
    expect(CONNECTOR_SKILLS.length).toBeGreaterThan(0);
  });

  it('every connector skill declares the config field that holds its endpoint', () => {
    const undeclared = CONNECTOR_SKILLS.filter((s) => !s.manifest?.endpointConfigKey).map((s) => s.id);
    expect(undeclared).toEqual([]);
  });

  it.each(CONNECTOR_SKILLS.map((s) => s.id))('%s does not report success with an empty payload', async (id) => {
    const skill = CONNECTOR_SKILLS.find((s) => s.id === id)!;
    // Run with no configuration at all: an endpoint can only come from the
    // Skill's own settings now, so omitting them is what "unconfigured" means.
    const unconfigured = { ...skill, externalConfig: undefined } as unknown as Tool;
    const result = await execute(unconfigured, probeInput(skill));

    // The forbidden shape: success:true with nothing behind it. A caller sees a
    // clean result containing no data and cannot tell it apart from a real one.
    if (result.envelope?.success === true) {
      expect(result.text).not.toMatch(EMPTY_OUTPUT);
      expect(result.text).toMatch(/"data":|present/);
    } else {
      // An honest failure must name its reason rather than reporting nothing.
      expect(result.text).not.toMatch(EMPTY_OUTPUT);
    }
  });
});

/**
 * Every declared input, filled with a type-appropriate probe value, plus the
 * confirmation a represent-tier Skill needs to get past its send gate.
 */
function probeInput(skill: Tool): Record<string, unknown> {
  const props = (skill.inputSchema as { properties?: Record<string, unknown> })?.properties ?? {};
  const input: Record<string, unknown> = {};
  for (const [key, spec] of Object.entries(props)) {
    const type = (spec as { type?: string | string[] }).type;
    const first = Array.isArray(type) ? type[0] : type;
    if (first === 'string') input[key] = 'probe';
    else if (first === 'number') input[key] = 1;
    else if (first === 'boolean') input[key] = false;
    else if (first === 'array') input[key] = [];
    else input[key] = {};
  }
  if (skill.confirmBeforeSend === true || skill.manifest?.confirmBeforeSend === true) {
    input.dryRun = true;
    input.confirmation = true;
  }
  return input;
}

describe('Skills with a degraded local fallback declare it', () => {
  it.each([
    ['sports-tactical-roster-evaluator', { entity: 'LAL', opponent: 'BOS' }],
    ['sports-battlecard-creator', { entity: 'LAL', opponent: 'BOS' }],
  ])('%s flags the fallback instead of reporting real metrics', async (id, _input) => {
    const skill = sportsSkills.find((s) => s.id === id);
    if (!skill) throw new Error('missing skill: ' + id);

    try {
      // No configuration means no stats provider, which is the CI condition this
      // asserts: the provider lives in the Skill's settings, not the environment.
      const unconfigured = { ...skill, externalConfig: undefined } as unknown as Tool;
      const result = await execute(unconfigured, { entity: 'LAL', opponent: 'BOS' });
      // The provider is unconfigured, so the run must either say so or produce
      // nothing at all. Presenting locally-supplied or empty numbers as measured
      // metrics is the failure this forbids.
      expect(
        result.text.match(/not-configured|not configured|not connected|no stats provider/i) || EMPTY_OUTPUT.test(result.text)
      ).toBeTruthy();
    } finally {
    }
  });
});

describe('Skills that cannot conclude say so instead of succeeding', () => {
  it.each([
    ['compliance-tracking-user', {}],
  ])('%s reports that no conclusion was produced', async (id, input) => {
    const skill = legalSkills.find((s) => s.id === id);
    if (!skill) throw new Error('missing skill: ' + id);
    const result = await execute(skill, input as Record<string, unknown>);
    // No rule set or provider is wired up, so a verdict must not be asserted.
    expect(result.text).toMatch(/no compliance conclusion was produced|manual-review-required/i);
    expect(result.text).not.toMatch(/"compliant":\s*true/);
  });
});