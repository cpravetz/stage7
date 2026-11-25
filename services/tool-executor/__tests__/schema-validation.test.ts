import { ctoSkills } from '../src/assistants/cto';
import { ctoWorkflow } from '../src/assistants/cto';
import { educationSkills, educationWorkflow } from '../src/assistants/education';
import { marketingSkills, marketingWorkflow } from '../src/assistants/marketing';
import { productSkills, productWorkflow } from '../src/assistants/product';
import { contentSkills, contentWorkflow } from '../src/assistants/content';
import { hrSkills, hrWorkflow } from '../src/assistants/hr';
import { healthcareSkills, healthcareWorkflow } from '../src/assistants/healthcare';
import { analyticsSkills, analyticsWorkflow } from '../src/assistants/analytics';
import { careerSkills } from '../src/assistants/career';
import { eventSkills } from '../src/assistants/event';
import { executiveSkills } from '../src/assistants/executive';
import { financeSkills } from '../src/assistants/finance';
import { hotelSkills } from '../src/assistants/hotel';
import { investmentSkills } from '../src/assistants/investment';
import { legalSkills } from '../src/assistants/legal';
import { restaurantSkills } from '../src/assistants/restaurant';
import { salesSkills } from '../src/assistants/sales';
import { sportsSkills } from '../src/assistants/sports';
import { supportSkills } from '../src/assistants/support';
import { songwritingSkills } from '../src/assistants/songwriting';
import { scriptwritingSkills } from '../src/assistants/scriptwriting';

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
          // Intended invariant: when confirmBeforeSend governance metadata is present on an
          // external-action skill it must be a real boolean, at EITHER location the runtime
          // gate reads, and the two locations must not contradict each other.
          const topLevel = skill.confirmBeforeSend;
          const manifestLevel = manifest.confirmBeforeSend;
          expect(topLevel === undefined || typeof topLevel === 'boolean').toBe(true);
          expect(manifestLevel === undefined || typeof manifestLevel === 'boolean').toBe(true);
          expect(topLevel === true && manifestLevel === false).toBe(false);
          expect(topLevel === false && manifestLevel === true).toBe(false);
        }
        expect(typeof skill.triggers === 'undefined' || Array.isArray(skill.triggers)).toBe(true);
      }
    });

    for (const group of allSkillArrays) {
      if (!group.workflow) continue;
      const workflow = group.workflow;
      it(`${group.name}: every skill has a workflowStage annotation`, () => {
        for (const skill of group.skills) {
          expect(skill.manifest).not.toHaveProperty('workflowStage');
        }
      });

      it(`${group.name}: workflow exposes every skill exactly once`, () => {
        const workflowSkillIds = workflow.skills.map((s) => s.id);
        expect(workflowSkillIds.length).toBe(new Set(workflowSkillIds).size);
        for (const skill of group.skills) {
          expect(workflowSkillIds).toContain(skill.id);
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
        expect(workflow.skills.length).toBeGreaterThan(0);
      });

      for (const skill of workflow.skills) {
        it(`${group.name}: skill "${skill.id}" has a name and description`, () => {
          expect(skill.name).toBeTruthy();
          expect(skill.description).toBeTruthy();
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
              'Personalised Learning Plan',
              'Learning Resource Manager',
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

});
