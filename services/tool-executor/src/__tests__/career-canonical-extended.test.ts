import { careerCanonicalExtendedSkills, careerCanonicalInternalTools, careerGmailSyncTool } from '../data/skills/career-canonical-extended';
import { Tool } from '../types';

function getSource(tool: Tool): string {
return (tool.manifest.sourceCode as string) || '';
}

describe('careerCanonicalExtendedSkills', () => {
  it('exports no canonical higher-order tools (all moved to standalone career/ files)', () => {
expect(careerCanonicalExtendedSkills).toHaveLength(0);
  });

  it('exports exactly 1 internal Gmail tool', () => {
expect(careerCanonicalInternalTools).toHaveLength(1);
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

  it('Gmail tool has not-connected and error handling markers', () => {
const source = getSource(careerGmailSyncTool);
expect(source).toContain('not-connected');
expect(source).toContain('error');
  });
});
