import { ctoSkills } from '../data/skills/cto';
import { ctoCanonicalSkills } from '../data/skills/cto';
import { Tool } from '../types';

function getSkill(id: string): Tool {
  const s = ctoSkills.find((t) => t.id === id);
  if (!s) throw new Error('missing skill: ' + id);
  return s;
}

function getCanonical(id: string): Tool {
  const s = ctoCanonicalSkills.find((t) => t.id === id);
  if (!s) throw new Error('missing canonical skill: ' + id);
  return s;
}

describe('ctoSkills', () => {
  it('exports exactly eight CTO domain tools', () => {
    expect(ctoSkills).toHaveLength(8);
  });

  it('exports unique skill ids', () => {
    const ids = ctoSkills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has four base tools with isSkill:false', () => {
    const base = ctoSkills.filter((s) => s.isSkill === false);
    expect(base).toHaveLength(4);
    const baseIds = base.map((s) => s.id).sort();
    expect(baseIds).toEqual([
      'cto-infrastructure-query',
      'cto-engineering-actions',
      'cto-incident-disaster-readiness',
      'cto-architecture-advisory',
    ].sort());
  });

  it('base tools are self-contained (no __execute_tool)', () => {
    const base = ctoSkills.filter((s) => s.isSkill === false);
    for (const s of base) {
      expect((s.manifest.sourceCode as string)).not.toContain('__execute_tool(');
    }
  });

  it('four canonical higher-order tools are exported (isSkill not forced false)', () => {
    const ho = ctoSkills.filter((s) => s.isSkill !== false);
    expect(ho).toHaveLength(4);
    const hoIds = ho.map((s) => s.id).sort();
    expect(hoIds).toEqual([
      'cto-architecture-tech-debt-evaluator',
      'cto-cloud-spend-infrastructure-optimizer',
      'cto-incident-war-room-synthesizer',
      'cto-engineering-action-iac-drift-remediation',
    ].sort());
  });

  it('higher-order wrappers call existing operations via __execute_tool', () => {
    const pairs: Array<[string, string]> = [
      ['cto-architecture-tech-debt-evaluator', 'cto-architecture-advisory'],
      ['cto-cloud-spend-infrastructure-optimizer', 'cto-infrastructure-query'],
      ['cto-incident-war-room-synthesizer', 'cto-incident-disaster-readiness'],
    ];
    for (const [wrapperId, calleeId] of pairs) {
      const source = getSkill(wrapperId).manifest.sourceCode as string;
      expect(source).toContain("__execute_tool('" + calleeId + "'");
    }
  });

  it('wrappers inspect nested result.success and record failures', () => {
    const hoIds = [
      'cto-architecture-tech-debt-evaluator',
      'cto-cloud-spend-infrastructure-optimizer',
      'cto-incident-war-room-synthesizer',
    ];
    for (const id of hoIds) {
      const source = getSkill(id).manifest.sourceCode as string;
      expect(source).toContain('result.success === false');
      expect(source).toContain('errors.push');
      expect(source).toContain('try {');
      expect(source).toContain('__execute_tool(');
    }
  });

  it('remediation wrapper does not call __execute_tool (direct fetch)', () => {
    const source = getSkill('cto-engineering-action-iac-drift-remediation').manifest.sourceCode as string;
    expect(source).not.toContain('__execute_tool(');
    expect(source).toContain('fetch(');
    expect(source).toContain('response.ok');
  });

  it('all skills have inputSchema, outputSchema, createdAt, updatedAt', () => {
    for (const skill of ctoSkills) {
      expect(skill.id).toBeTruthy();
      expect(skill.name).toBeTruthy();
      expect(skill.description).toBeTruthy();
      expect(skill.inputSchema).toBeDefined();
      expect(typeof skill.inputSchema!.properties).toBe('object');
      expect(skill.outputSchema).toBeDefined();
      expect(skill.createdAt).toBeInstanceOf(Date);
      expect(skill.updatedAt).toBeInstanceOf(Date);
    }
  });

  describe('Canonical skills', () => {
    it('exports exactly four canonical skills', () => {
      expect(ctoCanonicalSkills).toHaveLength(4);
    });

    it('canonical skill ids match expected values', () => {
      const canonicalIds = ctoCanonicalSkills.map((s) => s.id).sort();
      expect(canonicalIds).toContain('cto-architecture-tech-debt-evaluator');
      expect(canonicalIds).toContain('cto-cloud-spend-infrastructure-optimizer');
      expect(canonicalIds).toContain('cto-incident-war-room-synthesizer');
      expect(canonicalIds).toContain('cto-engineering-action-iac-drift-remediation');
    });

    it('all canonical skills have triggers, schemas, createdAt, updatedAt', () => {
      for (const skill of ctoCanonicalSkills) {
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

    it('canonical triggers have exactly one user trigger', () => {
      for (const skill of ctoCanonicalSkills) {
        expect(skill.triggers!.length).toBe(1);
        expect(skill.triggers![0].kind).toBe('user');
      }
    });
  });

  describe('CTO_HOME persistence env', () => {
    it('base tools have CTO_HOME in manifest', () => {
      const base = ctoSkills.filter((s) => s.isSkill === false);
      for (const skill of base) {
        expect(skill.manifest.persistenceEnv).toBe('CTO_HOME');
      }
    });

    it('canonical tools have CTO_HOME in manifest', () => {
      for (const skill of ctoCanonicalSkills) {
        expect(skill.manifest.persistenceEnv).toBe('CTO_HOME');
      }
    });
  });

  describe('Governance tests', () => {
    it('Engineering Action & IaC Drift Remediation has confirmBeforeSend in manifest', () => {
      const skill = getSkill('cto-engineering-action-iac-drift-remediation');
      expect(skill.manifest.confirmBeforeSend).toBe(true);
    });

    it('Engineering Action & IaC Drift Remediation has configSchema', () => {
      const skill = getSkill('cto-engineering-action-iac-drift-remediation');
      expect(skill.manifest.configSchema).toBeDefined();
      expect((skill.manifest.configSchema as any).properties).toBeDefined();
      expect((skill.manifest.configSchema as any).properties!.endpointUrl).toBeDefined();
      expect((skill.manifest.configSchema as any).properties!.token).toBeDefined();
    });

    it('remediation source has dryRun gate', () => {
      const source = getSkill('cto-engineering-action-iac-drift-remediation').manifest.sourceCode as string;
      expect(source).toContain('dryRun');
    });

    it('remediation source has confirmation gate', () => {
      const source = getSkill('cto-engineering-action-iac-drift-remediation').manifest.sourceCode as string;
      expect(source).toContain('confirmation');
    });

    it('remediation source has not-connected fallback', () => {
      const source = getSkill('cto-engineering-action-iac-drift-remediation').manifest.sourceCode as string;
      expect(source).toContain('not-connected');
    });

    it('base infrastructure and disaster skills have not-connected in source', () => {
      const infraSource = getSkill('cto-infrastructure-query').manifest.sourceCode as string;
      expect(infraSource).toContain('Not connected');

      const disasterSource = getSkill('cto-incident-disaster-readiness').manifest.sourceCode as string;
      expect(disasterSource).toContain('Not connected');
    });
  });
});
