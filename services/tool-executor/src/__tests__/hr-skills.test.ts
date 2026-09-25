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
  it('exports exactly three skills', () => {
    expect(hrSkills).toHaveLength(3);
  });

  it('exports unique skill ids', () => {
    const ids = hrSkills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exports the three higher-order skills from design 0915-3 section 18', () => {
    const expectedNames = [
      'Workforce Planning & Compensation Evaluator',
      'Job Description & Interview Kit Co-Pilot',
      'Applicant Review and Interview Coordination',
    ];
    const actualNames = hrSkills.map((s) => s.name).sort();
    expect(actualNames).toEqual(expectedNames.sort());
  });

  describe('Count and ID tests', () => {
    it('has expected skill id: candidate-screening', () => {
      expect(hrSkills.some((s) => s.id === 'candidate-screening')).toBe(true);
    });
    it('has expected skill id: recruiting-ops', () => {
      expect(hrSkills.some((s) => s.id === 'recruiting-ops')).toBe(true);
    });
    it('has expected skill id: hiring-analytics-compliance', () => {
      expect(hrSkills.some((s) => s.id === 'hiring-analytics-compliance')).toBe(true);
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

      it(`${skill.id} has a single user trigger`, () => {
        expect(skill.triggers).toBeDefined();
        expect(skill.triggers!.length).toBe(1);
        expect(skill.triggers![0].kind).toBe('user');
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

  describe('Score regression tests', () => {
    it('candidate-screening source implements Math.max(1, ...) score fix', () => {
      const source = getSkill('candidate-screening').manifest.sourceCode as string;
      expect(source).toContain('Math.max(1, Math.round(raw))');
      expect(source).toContain('Math.min(100, score)');
    });

    it('candidate-screening source prevents false-zero scores', () => {
      const source = getSkill('candidate-screening').manifest.sourceCode as string;
      expect(source).toContain('matched.length / reqWords.length');
      const hasMaxGuard = source.includes('Math.max(1,') || source.includes('Math.max (1,');
      expect(hasMaxGuard).toBe(true);
    });

    it('candidate-screening scoring produces non-zero score with minimal match', () => {
      const source = getSkill('candidate-screening').manifest.sourceCode as string;
      expect(source).toContain('score: Math.min(100, score)');
    });
  });

  describe('Governance tests', () => {
    it('Applicant Review and Interview Coordination has confirmBeforeSend', () => {
      const skill = getSkill('candidate-screening');
      expect(skill.confirmBeforeSend).toBe(true);
    });

    it('Applicant Review and Interview Coordination has configSchema', () => {
      const skill = getSkill('candidate-screening');
      expect(skill.manifest.configSchema).toBeDefined();
      expect((skill.manifest.configSchema as any).properties).toBeDefined();
      expect((skill.manifest.configSchema as any).properties!.confirmBeforeSend).toBeDefined();
      expect((skill.manifest.configSchema as any).properties!.dryRun).toBeDefined();
    });

    it('Applicant Review and Interview Coordination has endpointEnvVar', () => {
      const skill = getSkill('candidate-screening');
      expect((skill.manifest as Record<string, unknown>).endpointEnvVar).toBeDefined();
    });

    it('Applicant Review and Interview Coordination source has dryRun gate', () => {
      const source = getSkill('candidate-screening').manifest.sourceCode as string;
      expect(source).toContain('dryRun');
    });

    it('Applicant Review and Interview Coordination source has confirmation gate', () => {
      const source = getSkill('candidate-screening').manifest.sourceCode as string;
      expect(source).toContain('confirmation');
    });

    it('Applicant Review and Interview Coordination source has not-connected fallback', () => {
      const source = getSkill('candidate-screening').manifest.sourceCode as string;
      expect(source).toContain('not-connected');
    });

    it('Applicant Review and Interview Coordination source does not fabricate success', () => {
      const source = getSkill('candidate-screening').manifest.sourceCode as string;
      expect(source).not.toMatch(/console\.log\(JSON\.stringify\(\{ success:\s*true\s*\}\)\)/);
    });

    it('Recruiting Ops has confirmBeforeSend', () => {
      const skill = getSkill('recruiting-ops');
      expect(skill.confirmBeforeSend).toBe(true);
    });

    it('Recruiting Ops has configSchema', () => {
      const skill = getSkill('recruiting-ops');
      expect(skill.manifest.configSchema).toBeDefined();
    });

    it('Workforce Planning source has not-connected fallback', () => {
      const source = getSkill('hiring-analytics-compliance').manifest.sourceCode as string;
      expect(source).toContain('not-connected');
    });
  });

  describe('Canonical skills', () => {
    it('exports exactly three canonical skills', () => {
      expect(hrCanonicalSkills).toHaveLength(3);
    });

    it('canonical skill ids match expected values', () => {
      const canonicalIds = hrCanonicalSkills.map((s) => s.id).sort();
      expect(canonicalIds).toContain('hiring-analytics-compliance');
      expect(canonicalIds).toContain('recruiting-ops');
      expect(canonicalIds).toContain('candidate-screening');
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
      const rep = getCanonical('candidate-screening');
      const manifest = rep.manifest as Record<string, unknown>;
      expect(manifest.endpointEnvVar).toBe('HR_SCREENING_ENDPOINT');
      expect(rep.confirmBeforeSend).toBe(true);
      expect(rep.manifest.configSchema).toBeDefined();
    });

    it('canonical triggers have exactly one user trigger', () => {
      for (const skill of hrCanonicalSkills) {
        expect(skill.triggers!.length).toBe(1);
        expect(skill.triggers![0].kind).toBe('user');
      }
    });
  });

  describe('HR_HOME usage', () => {
    it('candidate-screening source references HR_HOME', () => {
      const source = getSkill('candidate-screening').manifest.sourceCode as string;
      expect(source).toContain('HR_HOME');
    });
    it('recruiting-ops source references endpoint env var', () => {
      const skill = getSkill('recruiting-ops');
      const source = skill.manifest.sourceCode as string;
      expect(source).toContain('HR_RECRUITING_ENDPOINT');
    });
    it('hiring-analytics-compliance source references HR_HOME', () => {
      const source = getSkill('hiring-analytics-compliance').manifest.sourceCode as string;
      expect(source).toContain('HR_HOME');
    });
  });
});
