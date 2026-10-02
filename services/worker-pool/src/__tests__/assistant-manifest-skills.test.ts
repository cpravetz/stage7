import path from 'node:path';
import { loadAssistantCatalog, listAssistantIds } from '../data/assistantCatalog';

/**
 * The tool-executor owns the definition of every skill: its ID, and which
 * skills an assistant exposes. `assistants/<id>/assistant.json` repeats that
 * list so the worker pool can seed assistants without a build-time dependency
 * on the tool executor.
 *
 * That duplication is only safe if something checks it, which is this file.
 * The old catalog had no such check, so its career entry drifted out of order
 * from the tool executor's and the rendered skill order silently stopped
 * matching the intended one. The count-only assertion that replaced it could
 * not have caught that, because the count was unchanged.
 */

const SKILLS_DIR = path.resolve(__dirname, '..', '..', '..', 'tool-executor', 'src', 'data', 'skills');

/**
 * Assistant id -> [tool-executor folder, exported skill array].
 *
 * Folders are not always named after the assistant (`songwriter` lives in
 * `songwriting`), which is exactly why this mapping is explicit.
 */
const SKILL_SOURCES: Record<string, [string, string]> = {
  career: ['career', 'careerCanonicalSkills'],
  cto: ['cto', 'ctoCanonicalSkills'],
  healthcare: ['healthcare', 'healthcareCanonicalSkills'],
  restaurant: ['restaurant', 'restaurantCanonicalSkills'],
  hr: ['hr', 'hrSkills'],
  education: ['education', 'educationSkills'],
  marketing: ['marketing', 'marketingSkills'],
  product: ['product', 'productSkills'],
  sales: ['sales', 'salesSkills'],
  support: ['support', 'supportSkills'],
  content: ['content', 'contentSkills'],
  sports: ['sports', 'sportsSkills'],
  event: ['event', 'eventSkills'],
  executive: ['executive', 'executiveSkills'],
  finance: ['finance', 'financeSkills'],
  hotel: ['hotel', 'hotelSkills'],
  investment: ['investment', 'investmentSkills'],
  legal: ['legal', 'legalSkills'],
  songwriter: ['songwriting', 'songwritingSkills'],
  scriptwriter: ['scriptwriting', 'scriptwritingSkills'],
  analytics: ['analytics', 'analyticsSkills'],
};

/**
 * Bindings that name a skill the tool executor does not define.
 *
 * Empty by design: the last of the pre-existing rot was repaired, so every
 * binding resolves. This list stays as a zero-length declaration because the two
 * tests that read it are what stop it silently refilling -- if a binding ever
 * breaks again, `binds only skill IDs the tool executor actually defines` fails
 * with the offending IDs, and they get added here deliberately rather than
 * drifting.
 */
const KNOWN_UNRESOLVED_BINDINGS: Record<string, string[]> = {};

const catalog = loadAssistantCatalog();

/**
 * Assistants whose bound skills are ordered differently from the tool-executor
 * folder. Also pre-existing, and also unresolved: the folder order is the
 * intended one, so these are listed rather than asserted away.
 *
 *   marketing     - `marketing-center` is bound before the research/insight
 *                   skills, but the folder defines it third
 *   scriptwriter  - genre evaluation is bound last, folder defines it third
 */
const KNOWN_ORDER_DIVERGENCES = ['marketing', 'scriptwriter'];

function folderSkillIds(assistantId: string): string[] {
  const source = SKILL_SOURCES[assistantId];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const skills = require(path.join(SKILLS_DIR, source[0], 'index.ts'))[source[1]] as Array<{ id: string }>;
  return skills.map((s) => s.id);
}

describe('assistant manifests agree with the tool-executor skill folders', () => {
  it('checks every discovered assistant that it has a skill source for', () => {
    // The source map is a list of assistants to CHECK, not a definition of
    // them: nothing is seeded from it. A new assistant that is not listed here
    // is reported rather than skipped, so it cannot go unchecked by omission.
    const discovered = listAssistantIds();
    const uncovered = discovered.filter((id) => !SKILL_SOURCES[id]);

    expect(uncovered).toEqual([]);
  });

  it('binds only skill IDs the tool executor actually defines', () => {
    const unresolved: Record<string, string[]> = {};

    for (const assistant of catalog) {
      const defined = folderSkillIds(assistant.id);
      const bound = assistant.tools.map((t) => t.name);
      const known = KNOWN_UNRESOLVED_BINDINGS[assistant.id] ?? [];
      const unexpected = bound.filter((id) => !defined.includes(id) && !known.includes(id));
      if (unexpected.length) unresolved[assistant.id] = unexpected;
    }

    // Any new mismatch fails. Pre-existing ones are enumerated above, so this
    // reports additions rather than the whole backlog.
    expect(unresolved).toEqual({});
  });

  it('lists every unresolved binding as a known issue', () => {
    // The inverse of the check above, so the quarantine list cannot rot: if a
    // documented ID is quietly fixed in the tool executor, this fails and the
    // entry gets removed rather than masking a fresh break.
    const stillBroken: Record<string, string[]> = {};

    for (const assistant of catalog) {
      const defined = folderSkillIds(assistant.id);
      const bound = new Set(assistant.tools.map((t) => t.name));
      const resolved = (KNOWN_UNRESOLVED_BINDINGS[assistant.id] ?? []).filter((id) => !defined.includes(id));
      if (resolved.length) stillBroken[assistant.id] = resolved;
    }

    expect(stillBroken).toEqual(KNOWN_UNRESOLVED_BINDINGS);
  });

  it('binds the resolved skills in the same relative order as the folder', () => {
    // Relative, not absolute: an assistant intentionally exposes a subset of
    // its folder's skills, so only the order of the ones it does bind is fixed.
    const diverged: string[] = [];

    for (const assistant of catalog) {
      const defined = folderSkillIds(assistant.id);
      const indices = assistant.tools
        .map((t) => t.name)
        .filter((id) => defined.includes(id))
        .map((id) => defined.indexOf(id));

      if (JSON.stringify(indices) !== JSON.stringify([...indices].sort((a, b) => a - b))) {
        diverged.push(assistant.id);
      }
    }

    // Any new divergence fails; the pre-existing ones are enumerated above.
    expect(diverged.sort()).toEqual([...KNOWN_ORDER_DIVERGENCES].sort());
  });

  it('keeps the career panel in the intended candidate-workflow order', () => {
    // The order a candidate actually works in: shape the profile, then resume
    // and templates, then search, apply, follow up, track, prepare, upskill.
    // Job Search is deliberately third, not first: it depends on the profile
    // and the resume being in place, and the ranking it produces is what the
    // positioning advisor reads.
    const career = catalog.find((a) => a.id === 'career')!;
    expect(career.tools.map((t) => t.name)).toEqual([
      'career-job-market-positioning-evaluator',
      'career-resume-template-manager',
      'career-job-discovery-fit-ranking',
      'career-application-execution-orchestrator',
      'career-governed-application-outreach-manager',
      'career-portal-recruiter-workflow',
      'career-pipeline-outcome-tracker',
      'career-interview-practice-mock-interviewer',
      'career-interview-compensation-battlecard-creator',
      'career-upskill-role-targeted-learning-planner',
    ]);
  });
});
