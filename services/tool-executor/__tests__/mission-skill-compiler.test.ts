import { MissionToSkillCompiler } from '../src/adk/compilers/mission-skill-compiler';
import type { SkillCompilationRequest } from '@stage7-nextgen/shared';

const request: SkillCompilationRequest = {
  trajectory: {
    missionId: 'mission-123',
    assistantId: 'career',
    goalDescription: 'Summarize job listings',
    steps: [{
      stepId: 'phase-1:task-1',
      agentRole: 'Researcher',
      toolName: 'web_search',
      inputParameters: { query: 'product jobs' },
      outputResult: { results: ['listing'] },
      executionDurationMs: 120,
      status: 'SUCCESS',
    }],
    finalDeliverableSummary: 'A list of relevant jobs.',
    totalTokensUsed: 200,
  },
  targetSkillName: 'job-summary',
  targetCategory: 'career',
  description: 'Summarize matching jobs.',
  authorAssistantId: 'career',
  enforceStrictSchemas: true,
};

function completion(content: unknown): Response {
  return new Response(JSON.stringify({ content: JSON.stringify(content) }), { status: 200 });
}

describe('MissionToSkillCompiler', () => {
  afterEach(() => jest.restoreAllMocks());

  it('creates a registered code skill module from successful trajectory steps', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(completion({
      skillName: 'job-summary',
      description: 'Summarize matching jobs.',
      inputSchemaFields: { query: 'string' },
      outputSchemaFields: { summary: 'string' },
      implementation: 'console.log(JSON.stringify({ summary: __tool_input.query }));',
      requiredEnvVars: [],
    }));

    const result = await new MissionToSkillCompiler('http://brain:3100')
      .compileTrajectoryToADKSkill(request);

    expect(result.module.skillId).toMatch(/^generated-career-[a-f0-9]{12}$/);
    expect(result.tool.isSkill).toBe(true);
    expect(result.tool.inputSchema).toMatchObject({
      required: ['query'],
      properties: { query: { type: 'string' } },
    });
    expect(result.module.typescriptSourceCode).toContain('createCodeSkill');
  });

  it('refuses missions without successful steps before calling Brain', async () => {
    const fetch = jest.spyOn(global, 'fetch');
    await expect(new MissionToSkillCompiler().compileTrajectoryToADKSkill({
      ...request,
      trajectory: { ...request.trajectory, steps: [] },
    })).rejects.toThrow('no successful trajectory steps');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid generated JavaScript before creating a tool', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(completion({
      skillName: 'job-summary',
      description: 'Summarize matching jobs.',
      inputSchemaFields: { query: 'string' },
      outputSchemaFields: { summary: 'string' },
      implementation: 'if (',
      requiredEnvVars: [],
    }));

    await expect(new MissionToSkillCompiler().compileTrajectoryToADKSkill(request))
      .rejects.toThrow('generated invalid JavaScript');
  });
});
