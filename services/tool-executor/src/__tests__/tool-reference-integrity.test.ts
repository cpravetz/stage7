import { Tool } from '../types';
import { careerSkills } from '../data/skills/career';
import { ctoSkills } from '../data/skills/cto';
import { educationSkills } from '../data/skills/education';
import { marketingSkills } from '../data/skills/marketing';
import { productSkills } from '../data/skills/product';
import { healthcareSkills } from '../data/skills/healthcare';
import { sportsSkills } from '../data/skills/sports';
import { supportSkills } from '../data/skills/support';
import { contentSkills } from '../data/skills/content';
import { hrSkills } from '../data/skills/hr';
import { creativeSkills } from '../data/skills/creative';
import { scriptwritingSkills } from '../data/skills/scriptwriting';
import { songwritingSkills } from '../data/skills/songwriting';
import { analyticsSkills } from '../data/skills/analytics';
import { eventSkills } from '../data/skills/event';
import { executiveSkills } from '../data/skills/executive';
import { financeSkills } from '../data/skills/finance';
import { hotelSkills } from '../data/skills/hotel';
import { investmentSkills } from '../data/skills/investment';
import { legalSkills } from '../data/skills/legal';
import { restaurantSkills } from '../data/skills/restaurant';
import { salesSkills } from '../data/skills/sales';
import {
  ctoCanonicalSkills,
  healthcareCanonicalSkills,
  restaurantCanonicalSkills,
  careerCanonicalSkills,
  hrCanonicalSkills,
} from '../data/skills';
import {
  careerCanonicalExtendedSkills,
  careerCanonicalInternalTools,
} from '../data/skills/career-canonical-extended';
import { nativeTools } from '../data/nativeTools';
import { legacyGeneralTools } from '../data/generalTools';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Every assistant's skill array. Used to verify that all referenced
 * lower-order tools are actually defined in the registry.
 */
const ALL_SKILL_ARRAYS: { name: string; skills: Tool[] }[] = [
  { name: 'career', skills: careerSkills },
  { name: 'cto', skills: ctoSkills },
  { name: 'education', skills: educationSkills },
  { name: 'marketing', skills: marketingSkills },
  { name: 'product', skills: productSkills },
  { name: 'healthcare', skills: healthcareSkills },
  { name: 'sports', skills: sportsSkills },
  { name: 'support', skills: supportSkills },
  { name: 'content', skills: contentSkills },
  { name: 'hr', skills: hrSkills },
  { name: 'creative', skills: creativeSkills },
  { name: 'scriptwriting', skills: scriptwritingSkills },
  { name: 'songwriting', skills: songwritingSkills },
  { name: 'analytics', skills: analyticsSkills },
  { name: 'event', skills: eventSkills },
  { name: 'executive', skills: executiveSkills },
  { name: 'finance', skills: financeSkills },
  { name: 'hotel', skills: hotelSkills },
  { name: 'investment', skills: investmentSkills },
  { name: 'legal', skills: legalSkills },
  { name: 'restaurant', skills: restaurantSkills },
  { name: 'sales', skills: salesSkills },
];

/**
 * Core tools that live outside the per-assistant skill arrays but are
 * registered as defaults and are therefore legitimate delegation targets for
 * any skill's `__execute_tool('<id>')`:
 *
 *  - nativeTools / legacyGeneralTools (src/data/nativeTools.ts, generalTools.ts):
 *    search_web, api_client, file_storage, data_analysis, email_sender, ...
 *  - the canonical skill arrays: a subset of the domain arrays above today, but
 *    src/index.ts registers them from a separate list, so they are named
 *    explicitly here rather than relied on to stay that way.
 *  - careerCanonicalInternalTools (src/data/skills/career-canonical-extended.ts):
 *    internal tools such as career-gmail-sync that are registered as defaults
 *    but are not exported from any assistant's skill array.
 *
 * The set below is checked against the real allDefaults list in src/index.ts by
 * the "default registry composition" test, so adding a group here that is not
 * actually registered fails instead of silently passing.
 */
const ALL_CANONICAL_ARRAYS: { name: string; skills: Tool[] }[] = [
  { name: 'cto-canonical', skills: ctoCanonicalSkills },
  { name: 'healthcare-canonical', skills: healthcareCanonicalSkills },
  { name: 'restaurant-canonical', skills: restaurantCanonicalSkills },
  { name: 'career-canonical', skills: careerCanonicalSkills },
  { name: 'career-canonical-extended', skills: careerCanonicalExtendedSkills },
  { name: 'hr-canonical', skills: hrCanonicalSkills },
];

const ALL_CORE_TOOL_ARRAYS: { name: string; skills: Tool[] }[] = [
  { name: 'native', skills: nativeTools },
  { name: 'general', skills: legacyGeneralTools },
  { name: 'career-canonical-internal', skills: careerCanonicalInternalTools },
  ...ALL_CANONICAL_ARRAYS,
];

/**
 * Every tool a skill may delegate to, mirroring the defaults registered at
 * boot by src/index.ts (allDefaults).
 */
const ALL_DELEGATABLE_ARRAYS: { name: string; skills: Tool[] }[] = [
  ...ALL_SKILL_ARRAYS,
  ...ALL_CORE_TOOL_ARRAYS,
];

function extractReferencedToolIds(sourceCode: string): string[] {
  const matches: string[] = [];
  const regex = /__execute_tool\(\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(sourceCode)) !== null) {
    matches.push(m[1]);
  }
  return matches;
}

describe('Tool Reference Integrity', () => {
  const allSkills = ALL_SKILL_ARRAYS.flatMap((g) => g.skills);

  it('every referenced __execute_tool ID resolves to a defined tool', () => {
    const allDelegatable = ALL_DELEGATABLE_ARRAYS.flatMap((g) => g.skills);
    const definedIds = new Set(allDelegatable.map((s) => s.id));
    const definedNames = new Set(allDelegatable.map((s) => s.name));
    const missing: string[] = [];

    for (const group of ALL_DELEGATABLE_ARRAYS) {
      for (const skill of group.skills) {
        const source = (skill.manifest?.sourceCode as string) || '';
        const refs = extractReferencedToolIds(source);
        for (const ref of refs) {
          if (!definedIds.has(ref) && !definedNames.has(ref)) {
            missing.push(`${group.name}:${skill.id} → ${ref}`);
          }
        }
      }
    }

    if (missing.length > 0) {
      const msg = [
        `${missing.length} referenced tool(s) are not defined anywhere in the registry:`,
        ...missing.map((m) => `  - ${m}`),
        '',
        'These wrappers will fail at runtime with "Tool not found" errors.',
        'Either define the missing tool or remove the reference from the wrapper.',
      ].join('\n');
      // eslint-disable-next-line no-console
      console.error(msg);
    }
    expect(missing).toEqual([]);
  });

  it('every skill has a non-empty source code manifest', () => {
    for (const group of ALL_SKILL_ARRAYS) {
      for (const skill of group.skills) {
        // Reasoning-type tools (e.g. career_interview_prep, career_advisory) have
        // no sourceCode — they delegate to the Brain service via reasoningConfig.
        if (skill.type === 'reasoning') continue;
        const source = (skill.manifest?.sourceCode as string) || '';
        expect(source.length).toBeGreaterThan(0);
      }
    }
  });

  it('every skill has a unique id across all assistants', () => {
    const ids = allSkills.map((s) => s.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('native and general tool ids and names are part of the delegation set', () => {
    // Guards against the resolution set regressing to skills-only, which is what
    // made a literal __execute_tool('search_web', ...) fail this test even
    // though search_web is a registered default.
    const ids = new Set(ALL_DELEGATABLE_ARRAYS.flatMap((g) => g.skills).map((t) => t.id));
    const names = new Set(ALL_DELEGATABLE_ARRAYS.flatMap((g) => g.skills).map((t) => t.name));

    for (const tool of [...nativeTools, ...legacyGeneralTools]) {
      expect(ids.has(tool.id)).toBe(true);
      expect(names.has(tool.name)).toBe(true);
    }

    // The concrete cases that motivated the change.
    for (const id of ['search_web', 'api_client', 'file_storage', 'get_weather', 'calculate']) {
      expect(ids.has(id)).toBe(true);
    }
  });

  it('every __execute_tool target is reachable at runtime in the default registry', () => {
    // Mirrors ToolExecutor.resolveNestedTool: an id match wins, and a miss falls
    // back to matching the tool NAME. Both are legitimate, so both are accepted.
    const defaults = ALL_DELEGATABLE_ARRAYS.flatMap((g) => g.skills);
    const byId = new Map(defaults.map((t) => [t.id, t] as const));
    const byName = new Map(defaults.map((t) => [t.name, t] as const));

    const unresolved: string[] = [];
    for (const group of ALL_DELEGATABLE_ARRAYS) {
      for (const skill of group.skills) {
        const source = (skill.manifest?.sourceCode as string) || '';
        for (const ref of extractReferencedToolIds(source)) {
          if (!byId.has(ref) && !byName.has(ref)) {
            unresolved.push(`${group.name}:${skill.id} → ${ref}`);
          }
        }
      }
    }

    if (unresolved.length > 0) {
      // eslint-disable-next-line no-console
      console.error(
        [
          `${unresolved.length} __execute_tool target(s) are not present in the default registry:`,
          ...unresolved.map((u) => `  - ${u}`),
          '',
          'The wrapper is defined, but ToolExecutor.resolveNestedTool cannot find it',
          'at runtime, so the nested call fails with "Tool not found".',
        ].join('\n'),
      );
    }
    expect(unresolved).toEqual([]);
  });

  it('the default registry composition stays in sync with src/index.ts allDefaults', () => {
    // A tool that exists in source but is never spread into allDefaults is
    // registered nowhere: skills delegating to it fail at runtime. The
    // resolution set above cannot detect that on its own, so the composition
    // is compared against the real list in src/index.ts. The file is read as
    // text rather than imported because importing src/index.ts boots the whole
    // service (registry hydration, plugin adoption, ~15s).
    const indexPath = path.join(__dirname, '..', 'index.ts');
    const source = fs.readFileSync(indexPath, 'utf8');
    const block = source.match(/const allDefaults = \[([\s\S]*?)\];/);
    expect(block).not.toBeNull();

    const spreads = (src: string): string[] =>
      Array.from(src.matchAll(/\.\.\.([A-Za-z0-9_]+)/g)).map((m) => m[1]);

    // canonicalTools is a local in src/index.ts that regroups the canonical
    // arrays; expand it so the comparison is against real source arrays.
    const canonicalBlock = source.match(/const canonicalTools = \[([\s\S]*?)\];/);
    expect(canonicalBlock).not.toBeNull();
    const canonicalNames = spreads(canonicalBlock?.[1] ?? '');

    // skillTools is a local derived from the domain arrays; coverage of those
    // arrays is asserted separately below.
    const referencedInIndex = spreads(block?.[1] ?? '')
      .filter((n) => n !== 'skillTools')
      .flatMap((n) => (n === 'canonicalTools' ? canonicalNames : [n]));

    const expected = [
      'nativeTools',
      'legacyGeneralTools',
      'careerCanonicalInternalTools',
      'ctoCanonicalSkills',
      'healthcareCanonicalSkills',
      'restaurantCanonicalSkills',
      'careerCanonicalSkills',
      'careerCanonicalExtendedSkills',
      'hrCanonicalSkills',
    ];

    for (const name of expected) {
      expect(referencedInIndex).toContain(name);
    }
    for (const name of referencedInIndex) {
      expect(expected).toContain(name);
    }

    // Every per-assistant skill array reachable from src/index.ts is covered by
    // ALL_SKILL_ARRAYS, otherwise a skill could be registered at boot but never
    // scanned by this test.
    const domainBlock = source.match(/const domainSkillArrays = \[([\s\S]*?)\];/);
    expect(domainBlock).not.toBeNull();
    const domainNames = Array.from((domainBlock?.[1] ?? '').matchAll(/([A-Za-z0-9_]+Skills)/g)).map((m) => m[1]);
    const scannedNames = new Set(
      ALL_SKILL_ARRAYS.map((g) => g.name.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase()) + 'Skills'),
    );
    for (const name of new Set(domainNames)) {
      expect(scannedNames.has(name)).toBe(true);
    }
  });

  it('every skill has required fields', () => {
    for (const skill of allSkills) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.inputSchema).toBeDefined();
      // Some skills have no user inputs (they are triggered by other skills
      // passing system-generated inputs). Those are valid — just require that
      // the schema object exists.
      expect(typeof skill.inputSchema).toBe('object');
      expect(skill.outputSchema).toBeDefined();
    }
  });
});