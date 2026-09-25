import { hrSkills } from '../data/skills/hr';
import { hrCanonicalSkills } from '../data/skills/hr';
import { Tool } from '../types';

function getSkill(id: string): Tool {
  const s = hrSkills.find((t) => t.id === id);
  if (!s) throw new Error('missing skill: ' + id);
  return s;
}

function getCanonical(id: string): Tool {
  const s = hrCanonicalSkills.find((t) => t.id === id);
  if (!s) throw new Error('missing canonical skill: ' + id);
  return s;
}

describe('hrSkills', () => {
  it('exports exactly seven skills', () => {
    expect(hrSkills).toHaveLength(7);
  });

  it('exports unique skill ids', () => {
    const ids = hrSkills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exports the seven skills from HR implementation', () => {
    const expectedNames = [
      'Screen Resume for Role Fit',
      'Assess Candidate Skills and Experience',
      'Schedule Interview for Candidate',
      'Draft Job Description & Interview Kit',
      'Trigger Interview Scheduling',
      'Hiring Pipeline Analytics',
      'Compliance Audit Check',
    ];
    const actualNames = hrSkills.map((s) => s.name).sort();
    expect(actualNames).toEqual(expectedNames.sort());
  });

  describe('Count and ID tests', () => {
    it('has expected skill id: hr-screen-resume', () => {
      expect(hrSkills.some((s) => s.id === 'hr-screen-resume')).toBe(true);
    });
    it('has expected skill id: hr-assess-candidate', () => {
      expect(hrSkills.some((s) => s.id === 'hr-assess-candidate')).toBe(true);
    });
    it('has expected skill id: hr-schedule-interview', () => {
      expect(hrSkills.some((s) => s.id === 'hr-schedule-interview')).toBe(true);
    });
    it('has expected skill id: hr-draft-jd-interview-kit', () => {
      expect(hrSkills.some((s) => s.id === 'hr-draft-jd-interview-kit')).toBe(true);
    });
    it('has expected skill id: hr-trigger-interview-scheduling', () => {
      expect(hrSkills.some((s) => s.id === 'hr-trigger-interview-scheduling')).toBe(true);
    });
    it('has expected skill id: hr-hiring-analytics', () => {
      expect(hrSkills.some((s) => s.id === 'hr-hiring-analytics')).toBe(true);
    });
    it('has expected skill id: hr-compliance-check', () => {
      expect(hrSkills.some((s) => s.id === 'hr-compliance-check')).toBe(true);
    });
  });

  describe('Schema and trigger tests', () => {
    for (const skill of hrSkills) {
      it(`${skill.id} has inputSchema with properties`, () => {
        expect(skill.inputSchema).toBeDefined();
        expect(skill.inputSchema!.properties).toBeDefined();
        expect((Object.keys(skill.inputSchema!.properties as Record<string, unknown>)).length).toBeGreaterThan(0);
      });

      it(`${skill.id} has outputSchema`, () => {
        expect(skill.outputSchema).toBeDefined();
        expect(skill.outputSchema!.properties).toBeDefined();
      });

      it(`${skill.id} has a valid trigger`, () => {
        expect(skill.triggers).toBeDefined();
        expect(skill.triggers!.length).toBe(1);
        expect(['user', 'event', 'schedule']).toContain(skill.triggers![0].kind);
      });

      it(`${skill.id} has property descriptions (full SchemaProps descriptions)`, () => {
        const props = skill.inputSchema!.properties as Record<string, any>;
        for (const [key, prop] of Object.entries(props)) {
          if (prop && typeof prop === 'object') {
            expect(prop.description).toBeTruthy();
          }
        }
      });
    }
  });

  describe('Trigger kind tests', () => {
    it('hr-screen-resume has user trigger', () => {
      const skill = getSkill('hr-screen-resume');
      expect(skill.triggers![0].kind).toBe('user');
    });

    it('hr-assess-candidate has event trigger', () => {
      const skill = getSkill('hr-assess-candidate');
      expect(skill.triggers![0].kind).toBe('event');
    });

    it('hr-schedule-interview has event trigger', () => {
      const skill = getSkill('hr-schedule-interview');
      expect(skill.triggers![0].kind).toBe('event');
    });

    it('hr-draft-jd-interview-kit has user trigger', () => {
      const skill = getSkill('hr-draft-jd-interview-kit');
      expect(skill.triggers![0].kind).toBe('user');
    });

    it('hr-trigger-interview-scheduling has event trigger', () => {
      const skill = getSkill('hr-trigger-interview-scheduling');
      expect(skill.triggers![0].kind).toBe('event');
    });

    it('hr-hiring-analytics has schedule trigger', () => {
      const skill = getSkill('hr-hiring-analytics');
      expect(skill.triggers![0].kind).toBe('schedule');
    });

    it('hr-compliance-check has schedule trigger', () => {
      const skill = getSkill('hr-compliance-check');
      expect(skill.triggers![0].kind).toBe('schedule');
    });
  });

  describe('Score regression tests', () => {
    it('hr-screen-resume source implements Math.max(1, ...) score fix', () => {
      const source = getSkill('hr-screen-resume').manifest.sourceCode as string;
      expect(source).toContain('Math.max(1, Math.round(raw))');
      expect(source).toContain('Math.min(100, score)');
    });

    it('hr-screen-resume source prevents false-zero scores', () => {
      const source = getSkill('hr-screen-resume').manifest.sourceCode as string;
      expect(source).toContain('matched.length / reqWords.length');
      const hasMaxGuard = source.includes('Math.max(1,') || source.includes('Math.max (1,');
      expect(hasMaxGuard).toBe(true);
    });

    it('hr-screen-resume scoring produces non-zero score with minimal match', () => {
      const source = getSkill('hr-screen-resume').manifest.sourceCode as string;
      expect(source).toContain('score: Math.min(100, score)');
    });
  });

  describe('Governance tests', () => {
    it('hr-screen-resume has confirmBeforeSend', () => {
      const skill = getSkill('hr-screen-resume');
      expect(skill.confirmBeforeSend).toBe(true);
    });

    it('hr-screen-resume has configSchema', () => {
      const skill = getSkill('hr-screen-resume');
      expect(skill.manifest.configSchema).toBeDefined();
      expect((skill.manifest.configSchema as any).properties).toBeDefined();
      expect((skill.manifest.configSchema as any).properties!.confirmBeforeSend).toBeDefined();
      expect((skill.manifest.configSchema as any).properties!.dryRun).toBeDefined();
    });

    it('hr-screen-resume has endpointEnvVar', () => {
      const skill = getSkill('hr-screen-resume');
      expect((skill.manifest as Record<string, unknown>).endpointEnvVar).toBeDefined();
    });

    it('hr-screen-resume source has dryRun gate', () => {
      const source = getSkill('hr-screen-resume').manifest.sourceCode as string;
      expect(source).toContain('dryRun');
    });

    it('hr-screen-resume source has confirmation gate', () => {
      const source = getSkill('hr-screen-resume').manifest.sourceCode as string;
      expect(source).toContain('confirmation');
    });


    it('hr-screen-resume source does not fabricate success', () => {
      const source = getSkill('hr-screen-resume').manifest.sourceCode as string;
      expect(source).not.toMatch(/console\.log\(JSON\.stringify\(\{ success:\s*true\s*\}\)\)/);
    });

    it('hr-schedule-interview has confirmBeforeSend', () => {
      const skill = getSkill('hr-schedule-interview');
      expect(skill.confirmBeforeSend).toBe(true);
    });

    it('hr-schedule-interview has configSchema', () => {
      const skill = getSkill('hr-schedule-interview');
      expect(skill.manifest.configSchema).toBeDefined();
    });

    it('hr-hiring-analytics source has not-connected fallback', () => {
      const source = getSkill('hr-hiring-analytics').manifest.sourceCode as string;
      expect(source).toContain('Not connected');
    });

    it('hr-compliance-check source has not-connected fallback', () => {
      const source = getSkill('hr-compliance-check').manifest.sourceCode as string;
      expect(source).toContain('Not connected');
    });
  });

  describe('Canonical skills', () => {
    it('exports exactly seven canonical skills', () => {
      expect(hrCanonicalSkills).toHaveLength(7);
    });

    it('canonical skill ids match expected values', () => {
      const canonicalIds = hrCanonicalSkills.map((s) => s.id).sort();
      expect(canonicalIds).toContain('hr-screen-resume');
      expect(canonicalIds).toContain('hr-assess-candidate');
      expect(canonicalIds).toContain('hr-schedule-interview');
      expect(canonicalIds).toContain('hr-draft-jd-interview-kit');
      expect(canonicalIds).toContain('hr-trigger-interview-scheduling');
      expect(canonicalIds).toContain('hr-hiring-analytics');
      expect(canonicalIds).toContain('hr-compliance-check');
    });

    it('all canonical skills have triggers, schemas, createdAt, updatedAt', () => {
      for (const skill of hrCanonicalSkills) {
        expect(skill.triggers).toBeDefined();
        expect(skill.triggers!.length).toBe(1);
        expect(skill.inputSchema).toBeDefined();
        expect(skill.outputSchema).toBeDefined();
        expect(skill.id).toBeTruthy();
        expect(skill.name).toBeTruthy();
        expect(skill.description).toBeTruthy();
        expect(skill.createdAt).toBeInstanceOf(Date);
        expect(skill.updatedAt).toBeInstanceOf(Date);
      }
    });

    it('Represent canonical skill has endpointEnvVar and confirmBeforeSend', () => {
      const rep = getCanonical('hr-screen-resume');
      const manifest = rep.manifest as Record<string, unknown>;
      expect(manifest.endpointEnvVar).toBe('HR_SCREENING_ENDPOINT');
      expect(rep.confirmBeforeSend).toBe(true);
      expect(rep.manifest.configSchema).toBeDefined();
    });

    it('canonical triggers have valid kinds', () => {
      for (const skill of hrCanonicalSkills) {
        expect(skill.triggers!.length).toBe(1);
        expect(['user', 'event', 'schedule']).toContain(skill.triggers![0].kind);
      }
    });
  });

  describe('HR_HOME usage', () => {
    it('hr-screen-resume source references HR_HOME', () => {
      const source = getSkill('hr-screen-resume').manifest.sourceCode as string;
      expect(source).toContain('HR_HOME');
    });
    it('hr-assess-candidate source references HR_HOME', () => {
      const source = getSkill('hr-assess-candidate').manifest.sourceCode as string;
      expect(source).toContain('HR_HOME');
    });
    it('hr-schedule-interview source references HR_HOME', () => {
      const source = getSkill('hr-schedule-interview').manifest.sourceCode as string;
      expect(source).toContain('HR_HOME');
    });
    it('hr-hiring-analytics source references HR_HOME', () => {
      const source = getSkill('hr-hiring-analytics').manifest.sourceCode as string;
      expect(source).toContain('HR_HOME');
    });
    it('hr-compliance-check source references HR_HOME', () => {
      const source = getSkill('hr-compliance-check').manifest.sourceCode as string;
      expect(source).toContain('HR_HOME');
    });
    it('hr-draft-jd-interview-kit source references endpoint env var', () => {
      const skill = getSkill('hr-draft-jd-interview-kit');
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('HR_RECRUITING_ENDPOINT');
    });
    it('hr-trigger-interview-scheduling source references endpoint env var', () => {
      const skill = getSkill('hr-trigger-interview-scheduling');
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('HR_RECRUITING_ENDPOINT');
    });
  });

  describe('Workflow stages', () => {
    it('screening stage has correct skills', () => {
      const screeningSkills = hrSkills.filter((s) => s.manifest.workflowStage === 'screening');
      expect(screeningSkills.map((s) => s.id).sort()).toEqual(['hr-assess-candidate', 'hr-screen-resume'].sort());
    });

    it('interview stage has correct skills', () => {
      const interviewSkills = hrSkills.filter((s) => s.manifest.workflowStage === 'interview');
      expect(interviewSkills.map((s) => s.id).sort()).toEqual(['hr-draft-jd-interview-kit', 'hr-schedule-interview', 'hr-trigger-interview-scheduling'].sort());
    });

    it('decision stage has correct skills', () => {
      const decisionSkills = hrSkills.filter((s) => s.manifest.workflowStage === 'decision');
      expect(decisionSkills.map((s) => s.id).sort()).toEqual(['hr-compliance-check', 'hr-hiring-analytics'].sort());
    });
  });

  describe('Tier distribution', () => {
    it('has two represent skills', () => {
      const represent = hrSkills.filter((s) => s.tier === 'represent');
      expect(represent.length).toBe(3);
    });

    it('has two aid skills', () => {
      const aid = hrSkills.filter((s) => s.tier === 'aid');
      expect(aid.length).toBe(2);
    });

    it('has two advise skills', () => {
      const advise = hrSkills.filter((s) => s.tier === 'advise');
      expect(advise.length).toBe(2);
    });
  });
});
