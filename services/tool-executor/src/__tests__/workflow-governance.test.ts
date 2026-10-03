import { ctoSkills, ctoWorkflow } from '../assistants/cto';
import { educationSkills, educationWorkflow } from '../assistants/education';
import { marketingSkills, marketingWorkflow } from '../assistants/marketing';
import { productSkills, productWorkflow } from '../assistants/product';
import { contentSkills, contentWorkflow } from '../assistants/content';
import { hrSkills, hrWorkflow } from '../assistants/hr';
import { healthcareSkills, healthcareWorkflow } from '../assistants/healthcare';
import { analyticsSkills, analyticsWorkflow } from '../assistants/analytics';
import { careerSkills, careerWorkflow } from '../assistants/career';
import { restaurantSkills, restaurantWorkflow } from '../assistants/restaurant';
import { salesSkills, salesWorkflow } from '../assistants/sales';
import { supportSkills, supportWorkflow } from '../assistants/support';
import { sportsSkills, sportsWorkflow } from '../assistants/sports';
import { eventSkills, eventWorkflow } from '../assistants/event';
import { executiveSkills, executiveWorkflow } from '../assistants/executive';
import { financeSkills, financeWorkflow } from '../assistants/finance';
import { hotelSkills, hotelWorkflow } from '../assistants/hotel';
import { investmentSkills, investmentWorkflow } from '../assistants/investment';
import { legalSkills, legalWorkflow } from '../assistants/legal';
import { songwritingSkills, songwritingWorkflow } from '../assistants/songwriting';
import { scriptwritingSkills, scriptwritingWorkflow } from '../assistants/scriptwriting';
import { assistantRegistries, getOverlappingSkills } from '../adk/registry';
import { Tool } from '../types';
import { isCorrectlyGated, isMutatingSkill } from './confirmation-gate';

const assistants: Array<{ workflow: typeof ctoWorkflow; skills: Tool[]; object: string }> = [
  { workflow: ctoWorkflow, skills: ctoSkills, object: 'system / incident' },
  { workflow: educationWorkflow, skills: educationSkills, object: 'learner' },
  { workflow: marketingWorkflow, skills: marketingSkills, object: 'campaign' },
  { workflow: productWorkflow, skills: productSkills, object: 'product / order' },
  { workflow: contentWorkflow, skills: contentSkills, object: 'content piece' },
  { workflow: hrWorkflow, skills: hrSkills, object: 'applicant' },
  { workflow: healthcareWorkflow, skills: healthcareSkills, object: 'patient' },
  { workflow: careerWorkflow, skills: careerSkills, object: 'candidate / job' },
  { workflow: restaurantWorkflow, skills: restaurantSkills, object: 'reservation / table' },
  { workflow: salesWorkflow, skills: salesSkills, object: 'lead / opportunity' },
  { workflow: supportWorkflow, skills: supportSkills, object: 'ticket / customer' },
  { workflow: sportsWorkflow, skills: sportsSkills, object: 'game / matchup' },
  { workflow: eventWorkflow, skills: eventSkills, object: 'event / vendor' },
  { workflow: executiveWorkflow, skills: executiveSkills, object: 'organization / strategy' },
  { workflow: financeWorkflow, skills: financeSkills, object: 'account / transaction' },
  { workflow: hotelWorkflow, skills: hotelSkills, object: 'stay / booking' },
  { workflow: investmentWorkflow, skills: investmentSkills, object: 'portfolio / security' },
  { workflow: legalWorkflow, skills: legalSkills, object: 'case / matter' },
  { workflow: songwritingWorkflow, skills: songwritingSkills, object: 'song' },
  { workflow: scriptwritingWorkflow, skills: scriptwritingSkills, object: 'script' },
  { workflow: analyticsWorkflow, skills: analyticsSkills, object: 'metric / insight' },
];

describe('Assistant governance', () => {
  describe('Workflow declarations', () => {
    it('covers all 21 assistant workflows', () => {
      expect(assistants.length).toBe(21);
    });

    for (const { workflow } of assistants) {
      it(`${workflow.assistant}: declares assistant, product object, and a flow summary`, () => {
        expect(workflow.assistant).toBeTruthy();
        expect(workflow.productObject).toBeTruthy();
        expect(workflow.flow).toBeTruthy();
      });

      it(`${workflow.assistant}: exposes a flat skill list and no stages`, () => {
        expect(Array.isArray(workflow.skills)).toBe(true);
        expect(workflow.skills.length).toBeGreaterThan(0);
        expect(workflow).not.toHaveProperty('stages');
      });

      it(`${workflow.assistant}: has no skill annotated with a workflow stage`, () => {
        for (const skill of workflow.skills) {
          expect(skill.manifest).not.toHaveProperty('workflowStage');
        }
      });

      it(`${workflow.assistant}: has unique skill ids`, () => {
        const ids = workflow.skills.map((s) => s.id);
        expect(ids.length).toBe(new Set(ids).size);
      });
    }
  });

  describe('Assistant object continuity', () => {
    it('each assistant has a documented product object', () => {
      for (const { workflow, object } of assistants) {
        expect(workflow.productObject).toBe(object);
      }
    });

    it('registry entries match the workflow product objects', () => {
      const byAssistant = new Map(assistants.map((a) => [a.workflow.assistant, a.workflow.productObject]));
      const mismatches = assistantRegistries
        .filter((reg) => byAssistant.has(reg.assistant))
        .filter((reg) => reg.productObject !== byAssistant.get(reg.assistant))
        .map((reg) => reg.assistant);
      expect(mismatches).toEqual([]);
    });

    it('registry workflow flows match the workflow flow summaries', () => {
      const byAssistant = new Map(assistants.map((a) => [a.workflow.assistant, a.workflow.flow]));
      const mismatches = assistantRegistries
        .filter((reg) => byAssistant.has(reg.assistant))
        .filter((reg) => reg.workflowFlow !== byAssistant.get(reg.assistant))
        .map((reg) => reg.assistant);
      expect(mismatches).toEqual([]);
    });
  });

  describe('Mutating operations require approval', () => {
    it('CTO: mutating skills enforce the gate', () => {
      const mutating = ctoSkills.filter((skill) => isMutatingSkill(skill));
      expect(mutating.length).toBeGreaterThan(0);
      for (const skill of mutating) {
        expect({ id: skill.id, gated: isCorrectlyGated(skill, ctoSkills) }).toEqual({ id: skill.id, gated: true });
      }
    });

    it('HR: mutating skills enforce the gate', () => {
      const mutating = hrSkills.filter((skill) => isMutatingSkill(skill));
      expect(mutating.length).toBeGreaterThan(0);
      for (const skill of mutating) {
        expect(isCorrectlyGated(skill, hrSkills)).toBe(true);
      }
    });

    it('Content: mutating skills enforce the gate', () => {
      const mutating = contentSkills.filter((skill) => isMutatingSkill(skill));
      expect(mutating.length).toBeGreaterThan(0);
      for (const skill of mutating) {
        expect(isCorrectlyGated(skill, contentSkills)).toBe(true);
      }
    });

    it('Healthcare: mutating skills enforce the gate', () => {
      const mutating = healthcareSkills.filter((skill) => isMutatingSkill(skill));
      expect(mutating.length).toBeGreaterThan(0);
      for (const skill of mutating) {
        expect(isCorrectlyGated(skill, healthcareSkills)).toBe(true);
      }
    });

    it('no assistant can dispatch a live write without an approval prompt', () => {
      const violations: string[] = [];
      for (const { workflow, skills } of assistants) {
        for (const skill of skills) {
          if (!isCorrectlyGated(skill, skills)) {
            violations.push(`${workflow.assistant}/${skill.id}`);
          }
        }
      }
      expect(violations).toEqual([]);
    });
  });

  describe('Cross-assistant overlap detection', () => {
    it('registry can detect overlapping skill IDs across assistants', () => {
      const overlaps = getOverlappingSkills();
      expect(Array.isArray(overlaps)).toBe(true);
      for (const overlap of overlaps) {
        expect(overlap.skillId).toBeTruthy();
        expect(overlap.assistants.length).toBeGreaterThan(1);
      }
    });
  });

  describe('Schema hygiene - raw ID exposure', () => {
    const forbiddenPatterns = [
      /patientId/i,
      /learnerId/i,
      /candidateId/i,
      /eventId/i,
      /ticketId/i,
      /campaignId/i,
      /jobId/i,
      /jobIds/i,
    ];

    const allSkills: Tool[] = assistants.flatMap((a) => a.skills);

    it('covers all 21 assistant skill arrays', () => {
      expect(assistants.length).toBe(21);
      expect(allSkills.length).toBeGreaterThan(0);
    });

    for (const skill of allSkills) {
      it(`${skill.id}: no forbidden internal IDs in inputSchema`, () => {
        const schema = skill.inputSchema as Record<string, unknown> | undefined;
        if (!schema || !schema.properties) return;
        const properties = schema.properties as Record<string, unknown>;
        for (const key of Object.keys(properties)) {
          for (const pattern of forbiddenPatterns) {
            expect(pattern.test(key)).toBe(false);
          }
        }
      });
    }
  });

  describe('Analytics workflow', () => {
    it('declares its assistant, product object, and flow', () => {
      expect(analyticsWorkflow.assistant).toBe('Analytics');
      expect(analyticsWorkflow.productObject).toBe('metric / insight');
      expect(analyticsWorkflow.flow).toBeTruthy();
    });

    it('registers its product object and flow', () => {
      const reg = assistantRegistries.find((r) => r.assistant === 'Analytics');
      expect(reg?.productObject).toBe('metric / insight');
      expect(reg?.workflowFlow).toBe(analyticsWorkflow.flow);
    });
  });
});
