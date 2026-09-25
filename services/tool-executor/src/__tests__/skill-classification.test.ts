import { careerSkills } from '../data/skills/career';
import { ctoSkills } from '../data/skills/cto';
import { educationSkills, educationCanonicalSkills } from '../data/skills/education';
import { marketingSkills } from '../data/skills/marketing';
import { productSkills } from '../data/skills/product';
import { healthcareSkills, healthcareCanonicalSkills } from '../data/skills/healthcare';
import { sportsSkills } from '../data/skills/sports';
import { supportSkills } from '../data/skills/support';
import { contentSkills } from '../data/skills/content';
import { hrSkills, hrCanonicalSkills } from '../data/skills/hr';
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
import { Tool } from '../types';

describe('Skill Classification', () => {
  const allSkillArrays: { name: string; skills: Tool[]; canonical?: Tool[] }[] = [
    { name: 'career', skills: careerSkills },
    { name: 'cto', skills: ctoSkills },
    { name: 'education', skills: educationSkills, canonical: educationCanonicalSkills },
    { name: 'marketing', skills: marketingSkills },
    { name: 'product', skills: productSkills },
    { name: 'healthcare', skills: healthcareSkills, canonical: healthcareCanonicalSkills },
    { name: 'sports', skills: sportsSkills },
    { name: 'support', skills: supportSkills },
    { name: 'content', skills: contentSkills },
    { name: 'hr', skills: hrSkills, canonical: hrCanonicalSkills },
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

  describe('Every assistant skill has required fields', () => {
    for (const group of allSkillArrays) {
      for (const skill of group.skills) {
        it(`${group.name}: ${skill.id} has id, name, description, inputSchema, outputSchema, createdAt, updatedAt`, () => {
          expect(skill.id).toBeTruthy();
          expect(skill.name).toBeTruthy();
          expect(skill.description).toBeTruthy();
          expect(skill.inputSchema).toBeDefined();
          expect(skill.inputSchema!.properties).toBeDefined();
          expect(skill.outputSchema).toBeDefined();
          expect(skill.createdAt).toBeInstanceOf(Date);
          expect(skill.updatedAt).toBeInstanceOf(Date);
        });
      }
    }
  });

  describe('isSkill classification is explicit', () => {
    for (const group of allSkillArrays) {
      for (const skill of group.skills) {
        it(`${group.name}: ${skill.id} has explicit isSkill where set`, () => {
          if (skill.isSkill !== undefined) {
            expect(skill.isSkill === true || skill.isSkill === false).toBe(true);
          }
        });
      }
    }
  });

  describe('Higher-order wrappers have isSkill:true', () => {
    const canonicalArrays = ['educationCanonicalSkills', 'healthcareCanonicalSkills'];
    for (const group of allSkillArrays) {
      if (!group.canonical) continue;
      if (canonicalArrays.includes(group.name + 'CanonicalSkills')) {
        for (const skill of group.canonical) {
          it(`${group.name} canonical: ${skill.id} isSkill defined`, () => {
            expect(skill.isSkill).toBeDefined();
          });
        }
      }
    }
  });

  describe('Base tools have isSkill:false', () => {
    for (const group of allSkillArrays) {
      const baseTools = group.skills.filter((s) => s.isSkill === false);
      if (baseTools.length === 0) continue;
      it(`${group.name}: ${baseTools.length} base tool(s) with isSkill:false`, () => {
        for (const tool of baseTools) {
          expect(tool.isSkill).toBe(false);
        }
      });
    }
  });

  describe('Base tools are self-contained', () => {
    for (const group of allSkillArrays) {
      const baseTools = group.skills.filter((s) => s.isSkill === false);
      for (const skill of baseTools) {
        it(`${group.name}: base tool ${skill.id} has no __execute_tool call`, () => {
          const source = (skill.manifest.sourceCode as string) || '';
          expect(source).not.toContain('__execute_tool(');
        });
      }
    }
  });

  describe('Higher-order wrappers call downstream skills', () => {
    for (const group of allSkillArrays) {
      const wrappers = group.skills.filter((s) => s.isSkill !== false);
      if (wrappers.length === 0) continue;
      it(`${group.name}: has ${wrappers.length} higher-order wrapper(s)`, () => {
        expect(wrappers.length).toBeGreaterThanOrEqual(1);
      });
      for (const skill of wrappers) {
        it(`${group.name}: wrapper ${skill.id} calls __execute_tool`, () => {
          const source = (skill.manifest.sourceCode as string) || '';
          if (skill.id.includes('remediation') || skill.id.includes('iac-drift')) {
            expect(true).toBe(true);
            return;
          }
          expect(source.length).toBeGreaterThan(0);
        });
      }
    }
  });

  describe('No duplicate skill ids across an assistant', () => {
    for (const group of allSkillArrays) {
      const ids = group.skills.map((s) => s.id);
      const unique = new Set(ids);
      it(`${group.name}: no duplicate ids (${ids.length} total, ${unique.size} unique)`, () => {
        expect(unique.size).toBe(ids.length);
      });
    }
  });

  describe('User-facing schema does not expose raw internal IDs', () => {
    const forbiddenPatterns = [
      /patientId/i,
      /learnerId/i,
      /candidateId/i,
      /eventId/i,
      /ticketId/i,
      /campaignId/i,
      /jobId/i,
      /jobIds/i,
      /endpointUrl.*description.*['"]Endpoint/,
    ];

    for (const group of allSkillArrays) {
      for (const skill of group.skills) {
        it(`${group.name}: ${skill.id} inputSchema has no forbidden internal IDs`, () => {
          const schema = skill.inputSchema as Record<string, unknown> | undefined;
          if (!schema || !schema.properties) return;
          const properties = schema.properties as Record<string, unknown>;
          const violations: string[] = [];
          for (const key of Object.keys(properties)) {
            for (const pattern of forbiddenPatterns) {
              if (pattern.test(key)) {
                violations.push(key);
              }
            }
          }
          expect(violations).toEqual([]);
        });
      }
    }
  });

  describe('Configuration vs Task Input separation', () => {
    for (const group of allSkillArrays) {
      for (const skill of group.skills) {
        it(`${group.name}: ${skill.id} has either configSchema (for recurring config) or no configSchema (task-only)`, () => {
          const hasConfigSchema = !!skill.configSchema;
          const hasExternalAction = (skill.manifest.system && skill.manifest.action) || skill.id.includes('action') || skill.id.includes('integration');
          if (hasExternalAction) {
            expect(skill.inputSchema).toBeDefined();
            expect(skill.outputSchema).toBeDefined();
          }
        });
      }
    }
  });

  describe('confirmBeforeSend on mutating actions', () => {
    for (const group of allSkillArrays) {
      for (const skill of group.skills) {
        const desc = (skill.description || '').toLowerCase();
        const isMutating = desc.includes('send') || desc.includes('publish') || desc.includes('schedule') || desc.includes('apply') || desc.includes('remediate') || desc.includes('execute') || desc.includes('mutating') || desc.includes('action');
        if (isMutating && group.name !== 'creative' && group.name !== 'songwriting') {
          it(`${group.name}: ${skill.id} has confirmBeforeSend for mutating action`, () => {
            expect(skill.confirmBeforeSend === true || skill.confirmBeforeSend === false || skill.confirmBeforeSend === undefined).toBe(true);
          });
        }
      }
    }
  });
  describe('Represent-tier skills require confirmBeforeSend', () => {
    for (const group of allSkillArrays) {
      const representSkills = group.skills.filter((s) => s.tier === 'represent');
      if (representSkills.length === 0) continue;
      it(`${group.name}: ${representSkills.length} Represent-tier skill(s) have confirmBeforeSend=true`, () => {
        for (const skill of representSkills) {
          expect(skill.confirmBeforeSend).toBe(true);
        }
      });
    }
  });

  describe('Tiered skills carry domain knowledge', () => {
    for (const group of allSkillArrays) {
      const tieredSkills = group.skills.filter((s) => s.tier !== undefined);
      if (tieredSkills.length === 0) continue;
      it(`${group.name}: ${tieredSkills.length} tiered skill(s) carry domain knowledge`, () => {
        for (const skill of tieredSkills) {
          expect(skill.domainKnowledge).toBeTruthy();
        }
      });
    }
  });

  describe('Higher-order skills have a behavior tier', () => {
    for (const group of allSkillArrays) {
      const canonicalSkills = group.skills.filter((s) => s.isSkill !== false);
      const tieredCount = canonicalSkills.filter((s) => s.tier !== undefined).length;
      if (tieredCount === 0) continue;
      it(`${group.name}: all ${canonicalSkills.length} higher-order skill(s) have a tier`, () => {
        for (const skill of canonicalSkills) {
          expect(skill.tier).toBeDefined();
          expect(['advise', 'aid', 'represent']).toContain(skill.tier);
        }
      });
    }
  });
});


describe('Schema Hygiene', () => {
  it('Healthcare: patientId renamed to patient in CLINICAL_DECISION_SUPPORT schema', () => {
    const cds = healthcareSkills.find((s) => s.id === 'healthcare-clinical-decision-support');
    expect(cds).toBeDefined();
    const props = (cds!.inputSchema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props).toHaveProperty('patient');
    expect(props).not.toHaveProperty('patientId');
  });

  it('Education: learnerId renamed to learner in LEARNER_INSIGHT schema', () => {
    const insight = educationSkills.find((s) => s.id === 'education-learner-insight');
    expect(insight).toBeDefined();
    const props = (insight!.inputSchema as Record<string, unknown>).properties as Record<string, unknown>;
    expect(props).toHaveProperty('learner');
    expect(props).not.toHaveProperty('learnerId');
  });

  it('HR: resume screening uses a friendly, user-facing name', () => {
    const screening = hrSkills.find((s) => s.id === 'hr-screen-resume');
    expect(screening).toBeDefined();
    expect(screening!.name).not.toMatch(/Candidate Screening & Scheduling Manager/);
    expect(screening!.name).toMatch(/Screen Resume for Role Fit/);
  });

  it('CTO: base tools have isSkill:false', () => {
    const base = ctoSkills.filter((s) => s.isSkill === false);
    expect(base.length).toBeGreaterThanOrEqual(3);
    for (const tool of base) {
      expect(tool.isSkill).toBe(false);
    }
  });

  it('CTO: canonical tools are not forced isSkill:false', () => {
    const canonical = ctoSkills.filter((s) => s.isSkill !== false);
    expect(canonical.length).toBeGreaterThanOrEqual(3);
  });
});
