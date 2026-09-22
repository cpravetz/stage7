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
    const definedIds = new Set(allSkills.map((s) => s.id));
    const definedNames = new Set(allSkills.map((s) => s.name));
    const missing: string[] = [];

    for (const group of ALL_SKILL_ARRAYS) {
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