import {
  careerCanonicalExtendedSkills,
  careerCanonicalInternalTools,
  careerGmailSyncTool,
} from '../data/skills/career-canonical-extended';
import { Tool } from '../types';

const CANONICAL_IDS = [
  'career-job-discovery-fit-ranking',
  'career-application-execution-orchestrator',
  'career-upskill-role-targeted-learning-planner',
  'career-interview-practice-mock-interviewer',
  'career-pipeline-outcome-tracker',
  'career-resume-template-manager',
  'career-portal-recruiter-workflow',
];

const DELEGATION_PAIRS: Array<[string, string | string[]]> = [
  ['career-job-discovery-fit-ranking', 'career_job_discovery'],
  ['career-application-execution-orchestrator', 'career_apply_execute'],
  ['career-upskill-role-targeted-learning-planner', ['career_job_discovery', 'career_advisory']],
  ['career-interview-practice-mock-interviewer', 'career_interview_prep'],
  ['career-pipeline-outcome-tracker', 'career_pipeline_report'],
  ['career-resume-template-manager', 'career_profile_intake'],
  ['career-portal-recruiter-workflow', ['career_apply_execute', 'career_networking_outreach']],
];

function getSource(tool: Tool): string {
  return (tool.manifest.sourceCode as string) || '';
}

describe('careerCanonicalExtendedSkills', () => {
  it('exports exactly 8 canonical higher-order tools', () => {
    expect(careerCanonicalExtendedSkills).toHaveLength(8);
  });

  it('exports exactly 1 internal Gmail tool', () => {
    expect(careerCanonicalInternalTools).toHaveLength(1);
  });

  it('all canonical tools have expected IDs', () => {
    const ids = careerCanonicalExtendedSkills.map((s: Tool) => s.id).sort();
    expect(ids).toEqual(CANONICAL_IDS.sort());
  });

  it('canonical tools are all isSkill !== false', () => {
    for (const s of careerCanonicalExtendedSkills) {
      expect(s.isSkill === false).toBe(false);
    }
  });

  it('internal Gmail tool has isSkill:false explicitly', () => {
    expect(careerGmailSyncTool.isSkill).toBe(false);
  });

  it('Gmail tool is not included in canonical extended array', () => {
    const ids = careerCanonicalExtendedSkills.map((s: Tool) => s.id);
    expect(ids).not.toContain('career_gmail_sync');
  });

  it('Gmail tool has required configSchema fields', () => {
    const cs = careerGmailSyncTool.configSchema as Record<string, unknown>;
    expect(cs).toBeDefined();
    const props = cs.properties as Record<string, unknown>;
    expect(props).toBeDefined();
    expect(props!.endpointUrl).toBeDefined();
    expect(props!.apiKey).toBeDefined();
    expect(props!.accountId).toBeDefined();
    const req = cs.required as string[];
    expect(req).toContain('endpointUrl');
    expect(req).toContain('apiKey');
    expect(req).toContain('accountId');
  });

  it('Gmail tool uses CAREER_GMAIL_ENDPOINT env var in source', () => {
    const source = getSource(careerGmailSyncTool);
    expect(source).toContain('CAREER_GMAIL_ENDPOINT');
  });

  it('each canonical tool delegates to expected lower-order IDs', () => {
    for (const [wrapperId, calleeIds] of DELEGATION_PAIRS) {
      const tool = careerCanonicalExtendedSkills.find((s: Tool) => s.id === wrapperId);
      expect(tool).toBeDefined();
      const source = getSource(tool!);
      const callees = Array.isArray(calleeIds) ? calleeIds : [calleeIds];
      for (const callee of callees) {
        expect(source).toContain("__execute_tool('" + callee + "'");
      }
    }
  });

  it('each canonical tool has lowerOrderTools in manifest', () => {
    for (const tool of careerCanonicalExtendedSkills) {
      const lower = tool.manifest.lowerOrderTools as string[] | undefined;
      expect(lower).toBeDefined();
      expect(Array.isArray(lower)).toBe(true);
      expect(lower!.length).toBeGreaterThan(0);
    }
  });

  it('each canonical tool has inputSchema and outputSchema', () => {
    for (const tool of careerCanonicalExtendedSkills) {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
      expect((tool.inputSchema as Record<string, unknown>).type).toBe('object');
      expect((tool.outputSchema as Record<string, unknown>).type).toBe('object');
    }
  });

  it('each canonical tool has triggers with user/schedule/event', () => {
    for (const tool of careerCanonicalExtendedSkills) {
      expect(tool.triggers).toBeDefined();
      expect(tool.triggers!.length).toBeGreaterThanOrEqual(1);
      const kinds = tool.triggers!.map((t: { kind: string }) => t.kind);
      expect(kinds).toContain('user');
      expect(kinds).toContain('schedule');
      expect(kinds).toContain('event');
    }
  });

  it('each canonical tool has createdAt and updatedAt', () => {
    for (const tool of careerCanonicalExtendedSkills) {
      expect(tool.createdAt).toBeInstanceOf(Date);
      expect(tool.updatedAt).toBeInstanceOf(Date);
    }
  });

  it('each canonical wrapper inspects nested result.success', () => {
    for (const tool of careerCanonicalExtendedSkills) {
      const source = getSource(tool);
      expect(source).toContain('result.success');
    }
  });

  it('each canonical wrapper has not-connected / error handling markers', () => {
    for (const tool of careerCanonicalExtendedSkills) {
      const source = getSource(tool);
      expect(source).toContain('not-connected');
      expect(source).toContain('error');
    }
  });

  it('Gmail tool source has not-connected and error markers', () => {
    const source = getSource(careerGmailSyncTool);
    expect(source).toContain('not-connected');
    expect(source).toContain('error');
  });

  it('Gmail tool has isSkill:false on the exported object', () => {
    expect(careerGmailSyncTool.isSkill).toBe(false);
  });

  it('each canonical tool has configSchema', () => {
    for (const tool of careerCanonicalExtendedSkills) {
      expect(tool.configSchema).toBeDefined();
    }
  });
});
