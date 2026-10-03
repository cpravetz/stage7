import { ctoSkills } from '../assistants/cto';
import { ctoCanonicalSkills } from '../assistants/cto';
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
  it('exports exactly eleven CTO domain tools', () => {
    expect(ctoSkills).toHaveLength(11);
  });

  it('exports unique skill ids', () => {
    const ids = ctoSkills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has five base tools with isSkill:false', () => {
    const base = ctoSkills.filter((s) => s.isSkill === false);
    expect(base).toHaveLength(5);
    const baseIds = base.map((s) => s.id).sort();
    expect(baseIds).toEqual([
      'cto-infrastructure-query',
      'cto-engineering-actions',
      'cto-incident-disaster-readiness',
      'cto-architecture-advisory',
      'calculate-dora-metrics',
    ].sort());
  });

  it('base tools are self-contained (no __execute_tool)', () => {
    const base = ctoSkills.filter((s) => s.isSkill === false);
    for (const s of base) {
      expect((s.manifest.sourceCode as string)).not.toContain('ctx.delegate(');
    }
  });

  it('six canonical higher-order tools are exported (isSkill not forced false)', () => {
    const ho = ctoSkills.filter((s) => s.isSkill !== false);
    expect(ho).toHaveLength(6);
    const hoIds = ho.map((s) => s.id).sort();
    expect(hoIds).toEqual([
      'cto-architecture-tech-debt-evaluator',
      'cto-cloud-spend-infrastructure-optimizer',
      'cto-disaster-recovery-planner',
      'cto-engineering-action-iac-drift-remediation',
      'cto-incident-war-room-synthesizer',
      'cto-team-delivery-health-evaluator',
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
      expect(source).toContain("ctx.delegate('" + calleeId + "'");
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
      expect(source).toContain('ctx.delegate(');
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
    it('exports exactly six canonical skills', () => {
      expect(ctoCanonicalSkills).toHaveLength(6);
    });

    it('canonical skill ids match expected values', () => {
      const canonicalIds = ctoCanonicalSkills.map((s) => s.id).sort();
      expect(canonicalIds).toContain('cto-architecture-tech-debt-evaluator');
      expect(canonicalIds).toContain('cto-cloud-spend-infrastructure-optimizer');
      expect(canonicalIds).toContain('cto-disaster-recovery-planner');
      expect(canonicalIds).toContain('cto-engineering-action-iac-drift-remediation');
      expect(canonicalIds).toContain('cto-incident-war-room-synthesizer');
      expect(canonicalIds).toContain('cto-team-delivery-health-evaluator');
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

    it('canonical triggers have exactly one trigger of the correct kind', () => {
      const expected: Record<string, string> = {
        // These three take the thing they analyse as an input and return
        // "Not connected: no <X> supplied" without it, so User is their only
        // reachable trigger. The two remaining Schedulers and the Event-
        // triggered remediation keep their triggers.
        'cto-architecture-tech-debt-evaluator': 'user',
        'cto-cloud-spend-infrastructure-optimizer': 'user',
        'cto-incident-war-room-synthesizer': 'user',
        'cto-disaster-recovery-planner': 'schedule',
        'cto-engineering-action-iac-drift-remediation': 'event',
        'cto-team-delivery-health-evaluator': 'schedule',
      };
      for (const skill of ctoCanonicalSkills) {
        expect(skill.triggers!.length).toBe(1);
        expect(skill.triggers![0].kind).toBe(expected[skill.id]);
      }
    });
  });

  describe('CTO_HOME persistence env', () => {
    it('base tools have CTO_HOME in manifest', () => {
      const base = ctoSkills.filter((s) => s.isSkill === false);
      for (const skill of base) {
        expect(skill.manifest.persistenceEnvVar).toBe('CTO_HOME');
      }
    });

    it('canonical tools have CTO_HOME in manifest', () => {
      for (const skill of ctoCanonicalSkills) {
        expect(skill.manifest.persistenceEnvVar).toBe('CTO_HOME');
      }
    });
  });

  describe('Governance tests', () => {
    // Applying infrastructure is an external act, so the gate is mandatory. It
    // comes from `tier`, which is why the manifest carries no gate field of its
    // own for anyone to edit.
    it('Engineering Action & IaC Drift Remediation is gated because it is represent', () => {
      const skill = getSkill('cto-engineering-action-iac-drift-remediation');
      expect(skill.tier).toBe('represent');
      expect(skill.confirmBeforeSend).toBe(true);
      expect(skill.manifest).not.toHaveProperty('confirmBeforeSend');
    });

    it('Engineering Action & IaC Drift Remediation has configSchema', () => {
      const skill = getSkill('cto-engineering-action-iac-drift-remediation');
      expect(skill.manifest.configSchema).toBeDefined();
      expect((skill.manifest.configSchema as any).properties).toBeDefined();
      expect((skill.manifest.configSchema as any).properties!.endpointUrl).toBeDefined();
      // The token is a secret, so it is a declared credential rather than a plain
      // config field the Run form would ask the user to type.
      const credentialSource = (skill.manifest as any).credentialSource as Record<string, unknown>;
      expect(credentialSource?.token).toBeDefined();
      expect((skill.manifest.configSchema as any).properties!.token).toBeUndefined();
    });

    it('remediation source has dryRun gate', () => {
      const source = getSkill('cto-engineering-action-iac-drift-remediation').manifest.sourceCode as string;
      expect(source).toContain('dryRun');
    });

    it('remediation source has an approval gate', () => {
      const source = getSkill('cto-engineering-action-iac-drift-remediation').manifest.sourceCode as string;
      // `approved` rather than `confirmation`: the two were previously near-synonyms
      // on the same form, which told the user nothing about which one was required.
      expect(source).toContain('approved');
      expect(source).toContain('dryRun');
    });

    it('remediation reads its endpoint from config, not from run input', () => {
      const skill = getSkill('cto-engineering-action-iac-drift-remediation');
      const source = skill.manifest.sourceCode as string;
      // It used to read input.endpointUrl, which is never where the endpoint lives,
      // so the Skill could only ever report not-connected.
      expect(source).toContain('ctx.config');
      expect(source).toContain('getCredential');
      const inputs = Object.keys((skill.inputSchema as any).properties ?? {});
      expect(inputs).not.toContain('endpointUrl');
      expect(inputs).not.toContain('token');
      expect(inputs).not.toContain('payload');
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
