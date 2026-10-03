import {
  ctoSkills,
  educationSkills,
  hrSkills,
  hotelSkills,
  scriptwritingSkills,
  songwritingSkills,
  supportSkills,
  legalSkills,
} from '../data/skills';
import { lyricProsodyEvaluator } from '../assistants/songwriting';
import { SKILL_CLASSIFICATION } from '../adk/classification';
import { Tool } from '../types';
import { ToolExecutor } from '../services/ToolExecutor';

/**
 * These Skills all take the thing they act on as a required input, and every one
 * of them refuses to produce output when it is absent ("Not connected: no <X>
 * supplied", "no resume text supplied", and so on). With only a Schedule or Event
 * trigger nothing can supply that input, so as bound they were unreachable: the
 * schema asked for a value that could never arrive.
 *
 * Their honest trigger is User. This list is the regression guard for that fix --
 * see docs/assistants_design_0922_v7.md 0.14, which requires exactly one trigger
 * determined by how the Skill is actually invoked.
 */
const MUST_BE_USER_TRIGGERED = [
  'cto-architecture-tech-debt-evaluator',
  'cto-cloud-spend-infrastructure-optimizer',
  'cto-incident-war-room-synthesizer',
  'education-adaptive-personalization',
  'hr-assess-candidate',
  'hotel-revenue-performance-advisory',
  'scriptwriting-narrative-arc-pacing-evaluator',
  'songwriting_lyric_prosody_evaluator',
  'support-resolve-ticket',
  'support-sentiment-analysis',
  'support-issue-analysis',
  'support-search-kb',
];

const ALL: Tool[] = [
  ...ctoSkills,
  ...educationSkills,
  ...hrSkills,
  ...hotelSkills,
  ...legalSkills,
  ...scriptwritingSkills,
  ...songwritingSkills,
  ...supportSkills,
];

function getSkill(id: string): Tool {
  const s = ALL.find((t) => t.id === id) ?? (lyricProsodyEvaluator.id === id ? lyricProsodyEvaluator : undefined);
  if (!s) throw new Error('missing skill: ' + id);
  return s;
}

describe('Skills that require user-supplied content are user-triggered', () => {
  it('covers every skill in the guard list', () => {
    // lyricProsodyEvaluator is re-exported from songwritingSkills under the same
    // id; asserting presence catches a rename that would silently drop coverage.
    for (const id of MUST_BE_USER_TRIGGERED) {
      expect(() => getSkill(id)).not.toThrow();
    }
  });

  it.each(MUST_BE_USER_TRIGGERED)('%s has exactly one User trigger', (id) => {
    const skill = getSkill(id);
    expect(skill.triggers).toHaveLength(1);
    expect(skill.triggers![0].kind).toBe('user');
  });

  it.each(MUST_BE_USER_TRIGGERED)('%s has phrase_examples for routing', (id) => {
    const trigger = getSkill(id).triggers![0];
    expect(trigger.kind).toBe('user');
    if (trigger.kind !== 'user') throw new Error('unreachable');
    expect(trigger.phrase_examples.length).toBeGreaterThan(0);
    for (const phrase of trigger.phrase_examples) {
      expect(phrase.trim().length).toBeGreaterThan(0);
    }
  });

  it.each(MUST_BE_USER_TRIGGERED.filter((id) => SKILL_CLASSIFICATION[id]?.isSkill !== false))(
    '%s is not left classified as a non-skill',
    (id) => {
      // isSkill is what keeps a capability out of the user-facing list. A
      // capability the v9 blueprint classifies as a lower-order tool is
      // deliberately not in that list: it is reached by delegation from the
      // Skill that owns the conversation, not offered to the user directly.
      const isSkill = getSkill(id).isSkill;
      expect(isSkill === undefined || isSkill === true).toBe(true);
    },
  );

  it.each(MUST_BE_USER_TRIGGERED.filter((id) => SKILL_CLASSIFICATION[id]?.isSkill === false))(
    '%s is a lower-order tool, so it is reachable by delegation rather than as a panel',
    (id) => {
      expect(getSkill(id).isSkill).toBe(false);
    },
  );
});

describe('Schema does not demand inputs the handler ignores', () => {
  it('compliance-tracking-user does not require a document it never reads', () => {
    const skill = getSkill('compliance-tracking-user');
    const required = (skill.inputSchema as { required?: string[] }).required ?? [];
    // documentText used to be required. The handler never reads it -- there is no
    // rule set or provider wired up -- so it would demand a value and then discard
    // it while returning a placeholder report (0.8, 1.1).
    expect(required).not.toContain('documentText');
  });

  it('compliance-tracking-user reports honestly whether a document was supplied', async () => {
    const executor = new ToolExecutor(new Map([['compliance-tracking-user', getSkill('compliance-tracking-user')]]));

    const withDoc = await executor.execute(getSkill('compliance-tracking-user'), {
      documentText: 'Our policy retains customer data for 90 days.',
    });
    const withoutDoc = await executor.execute(getSkill('compliance-tracking-user'), {});

    const parse = (out: unknown): { data?: { report?: { documentProvided?: boolean } } } => {
      const raw = (out as { output?: string } | undefined)?.output;
      return typeof raw === 'string' ? (JSON.parse(raw) as { data?: { report?: { documentProvided?: boolean } } }) : {};
    };

    expect(parse(withDoc.output).data?.report?.documentProvided).toBe(true);
    expect(parse(withoutDoc.output).data?.report?.documentProvided).toBe(false);
  });
});

/**
 * 0.14 requires exactly one trigger per Skill. The Skills corrected for trigger
 * reachability are asserted directly above. This list is the pre-existing debt
 * that the same rule flags but that was out of scope for this change -- the four
 * hotel managers declare User + Event + Schedule together, which 0.14 calls out
 * as a template default rather than an honest description of invocation.
 *
 * The assertion is that this list does not grow, so the fix for each is
 * incremental and visible instead of silently accumulating.
 */
const KNOWN_MULTI_TRIGGER_DEBT = [
  'hotel-housekeeping-manager',
  'hotel-inventory-manager',
  'hotel-maintenance-dispatcher',
  'hotel-room-status-manager',
];

describe('Skills declaring more than one trigger', () => {
  it('is limited to the known debt and has not grown', () => {
    const multi = ALL.filter((s) => (s.triggers || []).length > 1).map((s) => s.id).sort();
    expect(multi).toEqual([...KNOWN_MULTI_TRIGGER_DEBT].sort());
  });

  it.each(MUST_BE_USER_TRIGGERED)('%s is not among it', (id) => {
    expect((getSkill(id).triggers || []).length).toBe(1);
  });
});