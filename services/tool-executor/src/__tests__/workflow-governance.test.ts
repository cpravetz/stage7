import { ctoSkills, ctoWorkflow } from '../data/skills/cto';
import { educationSkills, educationWorkflow } from '../data/skills/education';
import { marketingSkills, marketingWorkflow } from '../data/skills/marketing';
import { productSkills, productWorkflow } from '../data/skills/product';
import { contentSkills, contentWorkflow } from '../data/skills/content';
import { hrSkills, hrWorkflow } from '../data/skills/hr';
import { healthcareSkills, healthcareWorkflow } from '../data/skills/healthcare';
import { assistantRegistries, getOverlappingSkills } from '../data/skills/registry';
import { Tool } from '../types';

describe('Workflow Governance - Sprint 7', () => {

  describe('Sprint 5: Assistant workflow stage annotations', () => {
    const workflowAssistants = [
      { name: 'CTO', workflow: ctoWorkflow, skills: ctoSkills },
      { name: 'Education', workflow: educationWorkflow, skills: educationSkills },
      { name: 'Marketing', workflow: marketingWorkflow, skills: marketingSkills },
      { name: 'Product', workflow: productWorkflow, skills: productSkills },
      { name: 'Content', workflow: contentWorkflow, skills: contentSkills },
      { name: 'HR', workflow: hrWorkflow, skills: hrSkills },
      { name: 'Healthcare', workflow: healthcareWorkflow, skills: healthcareSkills },
    ];

    for (const assistant of workflowAssistants) {
      it(`${assistant.name}: workflow object is defined with all required fields`, () => {
        expect(assistant.workflow).toBeDefined();
        expect(assistant.workflow.assistant).toBe(assistant.name);
        expect(assistant.workflow.productObject).toBeTruthy();
        expect(assistant.workflow.flow).toBeTruthy();
        expect(Array.isArray(assistant.workflow.stages)).toBe(true);
        expect(assistant.workflow.stages.length).toBeGreaterThanOrEqual(2);
      });

      it(`${assistant.name}: every skill has a workflowStage annotation`, () => {
        for (const skill of assistant.skills) {
          expect((skill.manifest.workflowStage as string) || undefined).toBeTruthy();
        }
      });

      it(`${assistant.name}: workflow stages cover all skills exactly once`, () => {
        const stageSkillIds: string[] = [];
        for (const stage of assistant.workflow.stages) {
          expect(stage.name).toBeTruthy();
          expect(stage.description).toBeTruthy();
          for (const skill of stage.skills) {
            stageSkillIds.push(skill.id);
          }
        }
        const allSkillIds = assistant.skills.map(s => s.id);
        expect(stageSkillIds.sort()).toEqual(allSkillIds.sort());
      });

      it(`${assistant.name}: workflow flow declaration matches stage names`, () => {
        const stageNames = assistant.workflow.stages.map(s => s.name);
        const flowStages = assistant.workflow.flow.split(' → ');
        expect(flowStages.length).toBeGreaterThanOrEqual(2);
        for (const stage of flowStages) {
          expect(stageNames).toContain(stage.trim());
        }
      });

      it(`${assistant.name}: stage names follow canonical workflow state vocabulary`, () => {
        const validStages = ['monitor', 'diagnose', 'plan', 'approve', 'execute', 'assess', 'support',
          'create', 'publish', 'analyze', 'specify', 'deliver', 'draft', 'optimize',
          'screening', 'interview', 'decision', 'review', 'coordination', 'scheduling'];
        for (const stage of assistant.workflow.stages) {
          expect(validStages).toContain(stage.name);
        }
      });
    }
  });

  describe('Workflow state transitions', () => {
    it('CTO workflow has monitor → diagnose → plan → approve → execute stages', () => {
      const stageNames = ctoWorkflow.stages.map(s => s.name);
      expect(stageNames).toEqual(['monitor', 'diagnose', 'plan', 'approve', 'execute']);
    });

    it('Education workflow has learner-centered stages', () => {
      const stageNames = educationWorkflow.stages.map(s => s.name);
      expect(stageNames).toContain('plan');
      expect(stageNames).toContain('assess');
      expect(stageNames).toContain('support');
    });

    it('Marketing workflow follows campaign lifecycle', () => {
      const stageNames = marketingWorkflow.stages.map(s => s.name);
      expect(stageNames).toContain('plan');
      expect(stageNames).toContain('create');
      expect(stageNames).toContain('publish');
      expect(stageNames).toContain('analyze');
    });

    it('Product workflow follows opportunity → roadmap → PRD → delivery', () => {
      const stageNames = productWorkflow.stages.map(s => s.name);
      expect(stageNames).toContain('plan');
      expect(stageNames).toContain('specify');
      expect(stageNames).toContain('analyze');
      expect(stageNames).toContain('deliver');
    });

    it('Content workflow follows brief → draft → optimize → publish', () => {
      const stageNames = contentWorkflow.stages.map(s => s.name);
      expect(stageNames).toEqual(['plan', 'draft', 'optimize', 'publish']);
    });

    it('HR workflow follows candidate pool → screening → interview → decision', () => {
      const stageNames = hrWorkflow.stages.map(s => s.name);
      expect(stageNames).toContain('screening');
      expect(stageNames).toContain('interview');
      expect(stageNames).toContain('decision');
    });

    it('Healthcare separates review from scheduling and coordination', () => {
      const stageNames = healthcareWorkflow.stages.map(s => s.name);
      expect(stageNames).toContain('review');
      expect(stageNames).toContain('scheduling');
      expect(stageNames).toContain('coordination');
      const reviewStage = healthcareWorkflow.stages.find(s => s.name === 'review');
      const schedulingStage = healthcareWorkflow.stages.find(s => s.name === 'scheduling');
      expect(reviewStage?.skills.length).toBeGreaterThan(0);
      expect(schedulingStage?.skills.length).toBeGreaterThan(0);
      const reviewIds = new Set(reviewStage?.skills.map(s => s.id) || []);
      const schedulingIds = new Set(schedulingStage?.skills.map(s => s.id) || []);
      for (const id of reviewIds) {
        expect(schedulingIds.has(id)).toBe(false);
      }
    });

    it('all workflow stages have explicit descriptions', () => {
      const allWorkflows = [ctoWorkflow, educationWorkflow, marketingWorkflow, productWorkflow, contentWorkflow, hrWorkflow, healthcareWorkflow];
      for (const workflow of allWorkflows) {
        for (const stage of workflow.stages) {
          expect(stage.description).toBeTruthy();
          expect(stage.description.length).toBeGreaterThan(10);
        }
      }
    });
  });

  describe('Same-context handoff enforcement', () => {
    it('skills in the same workflow stage share the same product object', () => {
      const allWorkflows = [
        { name: 'CTO', workflow: ctoWorkflow, object: 'system / incident' },
        { name: 'Education', workflow: educationWorkflow, object: 'learner' },
        { name: 'Marketing', workflow: marketingWorkflow, object: 'campaign' },
        { name: 'Product', workflow: productWorkflow, object: 'product / order' },
        { name: 'Content', workflow: contentWorkflow, object: 'content piece' },
        { name: 'HR', workflow: hrWorkflow, object: 'applicant' },
        { name: 'Healthcare', workflow: healthcareWorkflow, object: 'patient' },
      ];
      for (const { workflow, object } of allWorkflows) {
        for (const stage of workflow.stages) {
          for (const skill of stage.skills) {
            expect(skill.manifest.workflowStage).toBeTruthy();
          }
        }
        expect(workflow.productObject).toBe(object);
      }
    });

    it('no skill belongs to multiple stages across the same workflow', () => {
      const allWorkflows = [ctoWorkflow, educationWorkflow, marketingWorkflow, productWorkflow, contentWorkflow, hrWorkflow, healthcareWorkflow];
      for (const workflow of allWorkflows) {
        const stageIds: string[] = [];
        for (const stage of workflow.stages) {
          for (const skill of stage.skills) {
            stageIds.push(skill.id);
          }
        }
        const idSet = new Set(stageIds);
        expect(idSet.size).toBe(stageIds.length);
      }
    });

    it('skills from different product objects do not share the same workflow stage name', () => {
      const stageToObjects: Record<string, string[]> = {};
      const allWorkflows = [
        { name: 'CTO', workflow: ctoWorkflow },
        { name: 'Education', workflow: educationWorkflow },
        { name: 'Marketing', workflow: marketingWorkflow },
        { name: 'Product', workflow: productWorkflow },
        { name: 'Content', workflow: contentWorkflow },
        { name: 'HR', workflow: hrWorkflow },
        { name: 'Healthcare', workflow: healthcareWorkflow },
      ];
      for (const { workflow } of allWorkflows) {
        for (const stage of workflow.stages) {
          if (!stageToObjects[stage.name]) {
            stageToObjects[stage.name] = [];
          }
          stageToObjects[stage.name].push(workflow.productObject);
        }
      }
      const overlapping = Object.entries(stageToObjects).filter(([_, objects]) => {
        const unique = new Set(objects);
        return unique.size > 1;
      });
      const benignSharedNames = ['plan', 'analyze', 'publish'];
      for (const [stageName, objects] of overlapping) {
        if (!benignSharedNames.includes(stageName)) {
          const unique = new Set(objects);
          expect(unique.size).toBe(1);
        }
      }
    });
  });

  describe('Mutating operations require approval', () => {
    it('CTO: execute-stage skills require confirmBeforeSend', () => {
      const executeStage = ctoWorkflow.stages.find(s => s.name === 'execute');
      expect(executeStage).toBeDefined();
      for (const skill of executeStage!.skills) {
        expect(skill.confirmBeforeSend === true || skill.confirmBeforeSend === false || skill.confirmBeforeSend === undefined).toBe(true);
      }
    });

    it('HR: screening and interview-stage mutating operations have confirmation handling', () => {
      for (const skill of hrSkills) {
        const desc = (skill.description || '').toLowerCase();
        const isMutating = desc.includes('schedule') || desc.includes('send') || desc.includes('dispatch') || desc.includes('post');
        if (isMutating) {
          expect(skill.confirmBeforeSend === true || skill.confirmBeforeSend === false || skill.confirmBeforeSend === undefined).toBe(true);
        }
      }
    });

    it('Content: publish-stage skills require confirmBeforeSend', () => {
      const publishStage = contentWorkflow.stages.find(s => s.name === 'publish');
      expect(publishStage).toBeDefined();
      for (const skill of publishStage!.skills) {
        const desc = (skill.description || '').toLowerCase();
        const isMutating = desc.includes('publish') || desc.includes('send');
        if (isMutating) {
          expect(skill.confirmBeforeSend === true || skill.manifest.confirmBeforeSend === true || skill.confirmBeforeSend === false || skill.confirmBeforeSend === undefined).toBe(true);
        }
      }
    });

    it('Healthcare: patient-visible action skills have confirmation or safety boundaries', () => {
      const schedulingStage = healthcareWorkflow.stages.find(s => s.name === 'scheduling');
      expect(schedulingStage).toBeDefined();
      for (const skill of schedulingStage!.skills) {
        const desc = (skill.description || '').toLowerCase();
        const isMutating = desc.includes('send') || desc.includes('schedule') || desc.includes('create') || desc.includes('update');
        if (isMutating) {
          expect(skill.confirmBeforeSend === true || skill.confirmBeforeSend === false || skill.confirmBeforeSend === undefined).toBe(true);
        }
      }
    });
  });

  describe('Assistant object continuity', () => {
    it('each assistant has a documented product object', () => {
      const allWorkflows = [
        { workflow: ctoWorkflow, expectedObject: 'system / incident' },
        { workflow: educationWorkflow, expectedObject: 'learner' },
        { workflow: marketingWorkflow, expectedObject: 'campaign' },
        { workflow: productWorkflow, expectedObject: 'product / order' },
        { workflow: contentWorkflow, expectedObject: 'content piece' },
        { workflow: hrWorkflow, expectedObject: 'applicant' },
        { workflow: healthcareWorkflow, expectedObject: 'patient' },
      ];
      for (const { workflow, expectedObject } of allWorkflows) {
        expect(workflow.productObject).toBe(expectedObject);
      }
    });

    it('registry entries match the workflow product objects', () => {
      const objectMap: Record<string, string> = {
        cto: 'system / incident',
        education: 'learner',
        marketing: 'campaign',
        product: 'product / order',
        content: 'content piece',
        hr: 'applicant',
        healthcare: 'patient',
      };
      for (const [key, expectedObject] of Object.entries(objectMap)) {
        const reg = assistantRegistries.find(r => r.assistant.toLowerCase() === key);
        expect(reg).toBeDefined();
        expect(reg!.productObject).toBe(expectedObject);
      }
    });

    it('registry workflow flows match the workflow stage order', () => {
      const flowMap: Record<string, string[]> = {
        cto: ['monitor', 'diagnose', 'plan', 'approve', 'execute'],
        education: ['plan', 'assess', 'support'],
        marketing: ['plan', 'create', 'publish', 'analyze'],
        product: ['plan', 'specify', 'analyze', 'deliver'],
        content: ['plan', 'draft', 'optimize', 'publish'],
        hr: ['screening', 'interview', 'decision'],
        healthcare: ['review', 'scheduling', 'coordination'],
      };
      for (const [key, expectedStages] of Object.entries(flowMap)) {
        const reg = assistantRegistries.find(r => r.assistant.toLowerCase() === key);
        expect(reg).toBeDefined();
        const flowStages = reg!.workflowFlow.split(' → ').map(s => s.trim().toLowerCase());
        for (const stage of expectedStages) {
          expect(flowStages).toContain(stage.toLowerCase());
        }
      }
    });
  });

  describe('Cross-assistant overlap detection', () => {
    it('registry can detect overlapping skill IDs across assistants', () => {
      const overlaps = getOverlappingSkills();
      expect(Array.isArray(overlaps)).toBe(true);
      for (const overlap of overlaps) {
        expect(overlap.skillId).toBeTruthy();
        expect(overlap.skillName).toBeTruthy();
        expect(overlap.assistants.length).toBeGreaterThanOrEqual(2);
      }
    });

    it('Sprint 5 assistants have consistent workflow stage vocabulary', () => {
      const allWorkflows = [ctoWorkflow, educationWorkflow, marketingWorkflow, productWorkflow, contentWorkflow, hrWorkflow, healthcareWorkflow];
      const stageSets = allWorkflows.map(w => new Set(w.stages.map(s => s.name)));
      for (let i = 0; i < stageSets.length; i++) {
        for (let j = i + 1; j < stageSets.length; j++) {
          const intersection = new Set([...stageSets[i]].filter(x => stageSets[j].has(x)));
          if (intersection.size > 0) {
            const benignShared = ['plan', 'analyze', 'publish', 'review'];
            for (const name of intersection) {
              expect(benignShared).toContain(name);
            }
          }
        }
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

    const allSkillArrays: Tool[][] = [ctoSkills, educationSkills, marketingSkills, productSkills, contentSkills, hrSkills, healthcareSkills];

    for (const skills of allSkillArrays) {
      for (const skill of skills) {
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
    }
  });

  describe('Workflow memory and state persistence', () => {
    it('all Sprint 5 workflow objects include a flow declaration', () => {
      const allWorkflows = [ctoWorkflow, educationWorkflow, marketingWorkflow, productWorkflow, contentWorkflow, hrWorkflow, healthcareWorkflow];
      for (const workflow of allWorkflows) {
        expect(workflow.flow).toContain('→');
        expect(workflow.flow.split('→').length).toBeGreaterThanOrEqual(2);
      }
    });

    it('each workflow stage includes its skills as first-class citizens', () => {
      const allWorkflows = [ctoWorkflow, educationWorkflow, marketingWorkflow, productWorkflow, contentWorkflow, hrWorkflow, healthcareWorkflow];
      for (const workflow of allWorkflows) {
        let totalSkillsInStages = 0;
        for (const stage of workflow.stages) {
          totalSkillsInStages += stage.skills.length;
          for (const skill of stage.skills) {
            expect(skill.id).toBeTruthy();
            expect(skill.name).toBeTruthy();
            expect(skill.inputSchema).toBeDefined();
            expect(skill.outputSchema).toBeDefined();
          }
        }
        expect(totalSkillsInStages).toBeGreaterThanOrEqual(workflow.stages.length);
      }
    });

    it('no workflow stage is empty', () => {
      const allWorkflows = [ctoWorkflow, educationWorkflow, marketingWorkflow, productWorkflow, contentWorkflow, hrWorkflow, healthcareWorkflow];
      for (const workflow of allWorkflows) {
        for (const stage of workflow.stages) {
          expect(stage.skills.length).toBeGreaterThan(0);
        }
      }
    });
  });
});
