// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { careerResultSchema } from '../career-contract';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_INPUT = {
  type: 'object',
  properties: {
    stage: { type: 'string', enum: ['phone_screen', 'technical', 'onsite', 'final'], description: 'Interview stage' },
    targetRole: { type: 'string', description: 'Target role title', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceValueField': 'title', 'x-referenceLabel': 'your job search results' },
    company: { type: 'string', description: 'Target company name', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceValueField': 'company', 'x-referenceLabel': 'your job search results' },
  },
};

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER = createDeclarativeCodeSkill({
  id: 'career-interview-practice-mock-interviewer',
  name: 'Interview Practice & Mock Interviewer',
  description: 'Runs interactive mock interviews using role/company battlecards, records performance, and produces actionable coaching notes. Delegates to career-interview-prep. Reports not-connected when no interview context is available.',
  persistenceEnvVar: 'CAREER_HOME',
  inputSchema: INTERVIEW_PRACTICE_MOCK_INTERVIEWER_INPUT,
  outputSchema: careerResultSchema('Mock interview session data with practice material and session ID'),
  manifest: {
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Start mock interview',
    timeoutMs: 40000,
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Mock interview me', 'Practice for this interview', 'Run a mock session'] },
  ],
  tier: 'aid',
  domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
  isSkill: true,
  handler: async function (input, ctx) {
    const role = input.targetRole || '';
    const company = input.company || '';
    const NL = '\n';
    const SKILL_BUDGET_MS = 30000;
    const notConnectedLines = [
      'Mock Interview Preparation (limited guidance)',
      '===================================',
      '',
      'Role: ' + (role || '(not specified)'),
      'Company: ' + (company || '(not specified)'),
      'Stage: ' + (input.stage || 'general'),
      '',
      'The AI interview prep assistant is not available. Below is a list of topics to review:',
      '- Company research: mission, values, recent news',
      '- Role responsibilities: match your experience to key requirements',
      '- Behavioral questions: use the STAR format (Situation, Task, Action, Result)',
      '- Technical questions: review core concepts for the role',
      '- Questions to ask: prepare 2-3 thoughtful questions about the team and role',
    ];
    let pipelineJobTitle = '';
    if (!role) {
      try {
        let pipelineTimer: any = null;
        const timeout = new Promise((r) => { pipelineTimer = setTimeout(() => r(null), SKILL_BUDGET_MS / 2); });
        try {
          const pipeline: any = await Promise.race([ctx.delegate('career-pipeline-report', {}), timeout]);
          if (pipeline && typeof pipeline === 'object' && pipeline.success && pipeline.data) {
            const pipelineData = pipeline.data;
            if (Array.isArray(pipelineData.tracking) && pipelineData.tracking.length) {
              const entry = pipelineData.tracking[0];
              pipelineJobTitle = entry.title || entry.role || '';
            }
          }
        } finally {
          if (pipelineTimer) clearTimeout(pipelineTimer);
        }
      } catch (e) {
        // Pipeline not available — continue with empty role
      }
    }
    const effectiveRole = role || pipelineJobTitle || '';
    let result: any;
    let prepTimer: any = null;
    try {
      const timeout = new Promise((r) => { prepTimer = setTimeout(() => r(null), SKILL_BUDGET_MS); });
      result = await Promise.race([
        ctx.delegate('career-interview-prep', { targetRole: effectiveRole, company: company, stage: input.stage }),
        timeout,
      ]);
    } catch (e) {
      result = null;
    } finally {
      if (prepTimer) clearTimeout(prepTimer);
    }
    if (!result || result.success === false || result.error) {
      return {
        success: false,
        status: 'not-connected',
        data: null,
        error: result && result.error ? (result.error + ' — interview preparation assistant is not configured') : 'Interview preparation assistant is not configured',
        present: [ctx.render.text('session', 'Mock Interview Session', notConnectedLines)],
      };
    }
    const practiceData = result.data && typeof result.data === 'object' ? result.data : result;
    if (!practiceData || (!practiceData.summary && !practiceData.questions && !practiceData.answers && !practiceData.script && !practiceData.rationale)) {
      return {
        success: false,
        status: 'not-connected',
        data: null,
        error: 'Interview preparation returned no usable practice data',
        present: [ctx.render.text('error', 'No Practice Data', 'The interview prep tool returned no practice material for ' + (role || 'the requested role') + '.')],
      };
    }
    const summary = practiceData.summary || (Array.isArray(practiceData.questions) ? practiceData.questions.join(NL) : '');
    const body: string[] = [
      'Mock Interview Prep',
      '================',
      '',
      'Role: ' + (role || '(not specified)'),
      'Company: ' + (company || '(not specified)'),
      'Stage: ' + (input.stage || 'general'),
      '',
    ];
    if (summary) body.push(summary);
    if (practiceData.questions) {
      body.push('');
      body.push('Key Questions to Practice:');
      if (Array.isArray(practiceData.questions)) {
        practiceData.questions.forEach(function (q: any) { body.push('- ' + q); });
      } else {
        body.push(String(practiceData.questions));
      }
    }
    return {
      success: true,
      status: 'ok',
      data: {
        interviewPrep: practiceData,
        delegatedTo: 'career-interview-prep',
        mockSessionId: 'mock_' + Date.now(),
        targetRole: role,
        company: company,
        stage: input.stage,
        generatedAt: new Date().toISOString(),
      },
      present: [ctx.render.text('session', 'Mock Interview Session', body)],
    };
  },
});
INTERVIEW_PRACTICE_MOCK_INTERVIEWER.configSchema = INTERVIEW_PRACTICE_MOCK_INTERVIEWER.manifest.configSchema as SchemaRecord;

export { INTERVIEW_PRACTICE_MOCK_INTERVIEWER };
