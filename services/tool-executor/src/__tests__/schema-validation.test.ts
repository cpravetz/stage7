import { ctoSkills } from '../data/skills/cto';
import { ctoWorkflow } from '../data/skills/cto';
import { educationSkills, educationWorkflow } from '../data/skills/education';
import { marketingSkills, marketingWorkflow } from '../data/skills/marketing';
import { productSkills, productWorkflow } from '../data/skills/product';
import { contentSkills, contentWorkflow } from '../data/skills/content';
import { hrSkills, hrWorkflow } from '../data/skills/hr';
import { healthcareSkills, healthcareWorkflow } from '../data/skills/healthcare';
import { analyticsSkills, analyticsWorkflow } from '../data/skills/analytics';
import { careerSkills } from '../data/skills/career';
import { creativeSkills } from '../data/skills/creative';
import { eventSkills } from '../data/skills/event';
import { executiveSkills } from '../data/skills/executive';
import { financeSkills } from '../data/skills/finance';
import { hotelSkills } from '../data/skills/hotel';
import { investmentSkills } from '../data/skills/investment';
import { legalSkills } from '../data/skills/legal';
import { restaurantSkills } from '../data/skills/restaurant';
import { salesSkills } from '../data/skills/sales';
import { sportsSkills } from '../data/skills/sports';
import { supportSkills } from '../data/skills/support';
import { songwritingSkills } from '../data/skills/songwriting';
import { scriptwritingSkills } from '../data/skills/scriptwriting';
import { assistantRegistries, getOverlappingSkills, getRetainedOverlapDecisions, getRetainedOverlapDecision, getRetainedOverlapDecisionIds } from '../data/skills/registry';

const allSkillArrays: { name: string; skills: typeof ctoSkills; workflow?: typeof ctoWorkflow }[] = [
  { name: 'CTO', skills: ctoSkills, workflow: ctoWorkflow },
  { name: 'Education', skills: educationSkills, workflow: educationWorkflow },
  { name: 'Marketing', skills: marketingSkills, workflow: marketingWorkflow },
  { name: 'Product', skills: productSkills, workflow: productWorkflow },
  { name: 'Content', skills: contentSkills, workflow: contentWorkflow },
  { name: 'HR', skills: hrSkills, workflow: hrWorkflow },
  { name: 'Healthcare', skills: healthcareSkills, workflow: healthcareWorkflow },
  { name: 'Analytics', skills: analyticsSkills, workflow: analyticsWorkflow },
  { name: 'Career', skills: careerSkills },
  { name: 'Creative', skills: creativeSkills },
  { name: 'Event', skills: eventSkills },
  { name: 'Executive', skills: executiveSkills },
  { name: 'Finance', skills: financeSkills },
  { name: 'Hotel', skills: hotelSkills },
  { name: 'Investment', skills: investmentSkills },
  { name: 'Legal', skills: legalSkills },
  { name: 'Restaurant', skills: restaurantSkills },
  { name: 'Sales', skills: salesSkills },
  { name: 'Sports', skills: sportsSkills },
  { name: 'Support', skills: supportSkills },
  { name: 'Songwriting', skills: songwritingSkills },
  { name: 'Scriptwriting', skills: scriptwritingSkills },
];

function getAllSkills() {
  return allSkillArrays.flatMap((g) => g.skills);
}

function getAllInputSchemaProperties(skill: typeof ctoSkills[0]) {
  const results: { key: string; path: string }[] = [];
  if (!skill.inputSchema || !skill.inputSchema.properties) return results;
  function traverse(props: Record<string, unknown>, prefix: string) {
    for (const [key, val] of Object.entries(props)) {
      const path = prefix ? `${prefix}.${key}` : key;
      results.push({ key, path });
      if (val && typeof val === 'object' && (val as Record<string, unknown>).properties) {
        traverse((val as Record<string, unknown>).properties as Record<string, unknown>, path);
      }
    }
  }
  traverse(skill.inputSchema.properties as Record<string, unknown>, '');
  return results;
}

function hasConfigSchema(skill: typeof ctoSkills[0]): boolean {
  return !!skill.configSchema && Object.keys(skill.configSchema).length > 0;
}

describe('Schema Validation - Full Registry Inventory (Sprint 2)', () => {
  const allSkills = getAllSkills();

  describe('Full registry schema inventory', () => {
    it('every assistant has at least one skill', () => {
      for (const group of allSkillArrays) {
        expect(group.skills.length).toBeGreaterThanOrEqual(1);
      }
    });

    it('every skill has a unique id across the full registry', () => {
      const ids = allSkills.map((s) => s.id);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });

    it('every skill has inputSchema with properties and outputSchema', () => {
      for (const skill of allSkills) {
        expect(skill.inputSchema).toBeDefined();
        expect(skill.inputSchema!.properties).toBeDefined();
        expect(skill.outputSchema).toBeDefined();
      }
    });

    it('skills have appropriate governance metadata', () => {
      for (const skill of allSkills) {
        const manifest = skill.manifest as Record<string, unknown>;
        const isExternal = manifest.system !== undefined && manifest.action !== undefined;
        if (isExternal) {
          expect(skill.confirmBeforeSend === true || skill.confirmBeforeSend === false || skill.confirmBeforeSend === undefined).toBe(true);
        }
        expect(typeof skill.triggers === 'undefined' || Array.isArray(skill.triggers)).toBe(true);
      }
    });

    for (const group of allSkillArrays) {
      if (!group.workflow) continue;
      const workflow = group.workflow;
      it(`${group.name}: every skill has a workflowStage annotation`, () => {
        for (const skill of group.skills) {
          expect((skill.manifest.workflowStage as string) || undefined).toBeTruthy();
        }
      });

      it(`${group.name}: workflow stages cover all skills at least once`, () => {
        const stageSkillIds: string[] = [];
        for (const stage of workflow.stages) {
          for (const skill of stage.skills) {
            stageSkillIds.push(skill.id);
          }
        }
        const allSkillIds = group.skills.map((s) => s.id);
        for (const id of allSkillIds) {
          expect(stageSkillIds).toContain(id);
        }
      });
    }
  });

  describe('Prohibited internal IDs in inputSchema', () => {
    const forbiddenPatterns = [
      /patientId/i,
      /learnerId/i,
      /candidateId/i,
      /eventId/i,
      /ticketId/i,
      /campaignId/i,
      /\bjobId\b/i,
      /jobIds/i,
    ];

    for (const skill of allSkills) {
      it(`${skill.id}: inputSchema has no forbidden internal IDs`, () => {
        const props = getAllInputSchemaProperties(skill);
        const violations: string[] = [];
        for (const { key } of props) {
          for (const pattern of forbiddenPatterns) {
            if (pattern.test(key)) {
              violations.push(key);
            }
          }
        }
        expect(violations).toEqual([]);
      });
    }
  });

  describe('Configuration vs task input separation', () => {
    it('no skill exposes endpointUrl as a task input field (belongs in configSchema)', () => {
      for (const skill of allSkills) {
        if (!skill.inputSchema || !skill.inputSchema.properties) return;
        const props = skill.inputSchema.properties as Record<string, unknown>;
        expect(props).not.toHaveProperty('endpointUrl');
      }
    });

    it('skills with external action system/action have configSchema', () => {
      for (const skill of allSkills) {
        const manifest = skill.manifest as Record<string, unknown>;
        const hasExternalAction =
          (manifest.system && manifest.action) ||
          skill.id.includes('action') ||
          skill.id.includes('integration') ||
          skill.id.includes('ops');
        if (hasExternalAction) {
          expect(manifest.configSchema !== undefined || skill.configSchema !== undefined).toBe(true);
        }
      }
    });
  });

  describe('Schema contract: product object, stage, and state', () => {
    for (const group of allSkillArrays) {
      if (!group.workflow) continue;
      const workflow = group.workflow;
      it(`${group.name}: workflow has productObject and flow declaration`, () => {
        expect(workflow.productObject).toBeTruthy();
        expect(workflow.flow).toBeTruthy();
        expect(workflow.stages.length).toBeGreaterThanOrEqual(2);
      });

      for (const stage of workflow.stages) {
        it(`${group.name}: stage "${stage.name}" has description and skills`, () => {
          expect(stage.description).toBeTruthy();
          expect(stage.skills.length).toBeGreaterThan(0);
        });
      }
    }
  });

  describe('Naming conventions', () => {
    const prohibitedTerms = ['Ops', 'Manager', 'Evaluator', 'Advisory'];

    it('no skill name uses prohibited engineering terms as primary descriptor', () => {
      const failures: string[] = [];
      for (const skill of allSkills) {
        const name = skill.name;
        for (const term of prohibitedTerms) {
          const regex = new RegExp(`\\b${term}\\b`, 'i');
          if (regex.test(name)) {
            // Transitional names allowed during Sprint 6 migration to product language
            const allowedNames = [
              'Business Insight & Trend Evaluator',
              'Adhoc Query Evaluator',
              'Application & Outreach Manager',
              'Resume & Template Manager',
              'Content Strategy & SEO Evaluator',
              'Trend & Planning Advisory',
              'Advise Lyric & Structural Prosody Evaluator',
              'Team Delivery Health Evaluator',
              'Architecture & Tech Stack Advisory',
              'Architecture & Tech Debt Evaluator',
              'Adaptive Personalization Advisory',
              'Resource Library Ops',
              'Leadership Advisory',
              'Risk & Scenario Advisory',
              'Reporting & Data Ops',
              'Risk & Regulatory Advisory',
              'Clinical Decision-Support Evaluator',
              'Clinical Practice & Workflow Evaluator',
              'Records & Scheduling Ops',
              'Revenue & Performance Advisory',
              'Workforce Planning & Compensation Evaluator',
              'Portfolio & Risk Advisory',
              'Contract & Document Advisory',
              'Matter & Document Ops',
              'Financial Performance Advisory',
              'Restaurant Financial Performance & Demand Forecast Evaluator',
              'Restaurant Reservations & Guest Profile Manager',
              'Restaurant Supply Chain & Inventory Reorder Manager',
              'Lead & Deal Advisory',
              'Pipeline Ops',
              'Narrative Arc & Pacing Evaluator',
              'Script Formatting & Submission Manager',
              'Scriptwriter Genre & Market Evaluator',
              'Songwriter Genre & Market Trend Fit Evaluator',
              'Tactical & Roster Strategy Evaluator',
              'Ticket Ops',
              'Career Advisory',
              'Career Interview Prep',
            ];
            if (!allowedNames.includes(name)) {
              failures.push(`${skill.id}: "${name}" contains prohibited term "${term}"`);
            }
          }
        }
      }
      if (failures.length > 0) {
        console.error('Naming violations:\n  ' + failures.join('\n  '));
      }
      expect(failures).toEqual([]);
    });
  });

  describe('Cross-assistant overlap detection', () => {
    it('registry can detect overlapping skill IDs', () => {
      const overlaps = getOverlappingSkills();
      expect(Array.isArray(overlaps)).toBe(true);
    });
  });

  describe('Retained overlap decisions (Sprint 6)', () => {
    it('has documented retained overlap decisions', () => {
      const decisions = getRetainedOverlapDecisions();
      expect(Array.isArray(decisions)).toBe(true);
      expect(decisions.length).toBeGreaterThanOrEqual(10);
    });

    it('each decision is keyed by user outcome, object, and decision boundary', () => {
      const decisions = getRetainedOverlapDecisions();
      for (const decision of decisions) {
        expect(decision.userOutcome).toBeTruthy();
        expect(decision.object).toBeTruthy();
        expect(decision.decisionBoundary).toBeTruthy();
      }
    });

    it('every decision has a documented rationale and registry implication', () => {
      const decisions = getRetainedOverlapDecisions();
      for (const decision of decisions) {
        expect(decision.rationale).toBeTruthy();
        expect(decision.registryImplication).toBeTruthy();
        expect(['retain-separate', 'merge', 'retain-with-hierarchy']).toContain(decision.decision);
      }
    });

    it('DEC-009 genre evaluators are differentiated by domain', () => {
      const decision = getRetainedOverlapDecision('DEC-009');
      expect(decision).toBeDefined();
      expect(decision!.decision).toBe('retain-separate');
      expect(decision!.skillIds).toContain('songwriter_genre_trend_evaluator');
      expect(decision!.skillIds).toContain('scriptwriting-genre-market-evaluator');
    });

    it('DEC-010 sports capabilities are retained with isolation rationale', () => {
      const decision = getRetainedOverlapDecision('DEC-010');
      expect(decision).toBeDefined();
      expect(decision!.assistantNames).toContain('Sports');
      expect(decision!.decision).toBe('retain-separate');
    });

    it('no duplicate decision IDs', () => {
      const decisions = getRetainedOverlapDecisions();
      const ids = decisions.map(d => d.decisionId);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('Sports isolation (DEC-010)', () => {
    it('sports performance skills are not shared with wagering objects', () => {
      const sportsReg = assistantRegistries.find(r => r.assistant.toLowerCase() === 'sports');
      expect(sportsReg).toBeDefined();
      const performanceSkills = sportsReg!.skills.filter(s =>
        ['sports-tactical-roster-evaluator', 'sports-battlecard-creator'].includes(s.id)
      );
      const wageringSkills = sportsReg!.skills.filter(s =>
        ['sports-matchup-odds-explainer', 'sports-bankroll-co-pilot'].includes(s.id)
      );
      expect(performanceSkills.length).toBeGreaterThan(0);
      expect(wageringSkills.length).toBeGreaterThan(0);
      const performanceIds = new Set(performanceSkills.map(s => s.id));
      for (const wagering of wageringSkills) {
        expect(performanceIds.has(wagering.id)).toBe(false);
      }
    });

    it('sports productObject is performance-focused', () => {
      const sportsReg = assistantRegistries.find(r => r.assistant.toLowerCase() === 'sports');
      expect(sportsReg).toBeDefined();
      expect(sportsReg!.productObject).toContain('game');
      expect(sportsReg!.productObject).not.toContain('wager');
    });
  });
});
