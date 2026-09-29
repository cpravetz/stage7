import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';
import { careerResultSchema } from './career-contract';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const role = input.targetRole || '';
  const company = input.company || '';
const NL = '\\n';

function emit(success, status, data, error, present) {
  console.log(JSON.stringify({ success: success, status: status, data: data || null, error: error || null, present: present || [] }));
  return { success: success, status: status, data: data || null, error: error || null, present: present || [] };
}

let pipelineJobId = '';
let pipelineJobTitle = '';
if (!role) {
  const pipeline = await __execute_tool('career-pipeline-report', {});
  if (pipeline && pipeline.success && pipeline.data) {
    const pipelineData = pipeline.data;
    if (Array.isArray(pipelineData.tracking) && pipelineData.tracking.length) {
      const entry = pipelineData.tracking[0];
      pipelineJobTitle = entry.title || entry.role || '';
      pipelineJobId = entry.jobId || entry.id || '';
    }
  }
}
const effectiveRole = role || pipelineJobTitle || '';
const result = await __execute_tool('career-interview-prep', { targetRole: effectiveRole, company: company, stage: input.stage });
if (!result || result.success === false || result.error) {
  const lines = ['Mock Interview Preparation (limited guidance)'];
  lines.push('===================================');
  lines.push('');
  lines.push('Role: ' + (role || '(not specified)'));
  lines.push('Company: ' + (company || '(not specified)'));
  lines.push('Stage: ' + (input.stage || 'general'));
  lines.push('');
  lines.push('The AI interview prep assistant is not available. Below is a list of topics to review:');
  lines.push('- Company research: mission, values, recent news');
  lines.push('- Role responsibilities: match your experience to key requirements');
  lines.push('- Behavioral questions: use the STAR format (Situation, Task, Action, Result)');
  lines.push('- Technical questions: review core concepts for the role');
  lines.push('- Questions to ask: prepare 2-3 thoughtful questions about the team and role');
  emit(false, 'not-connected', null, result && result.error ? (result.error + ' — interview preparation assistant is not configured') : 'Interview preparation assistant is not configured', [{ id: 'session', title: 'Mock Interview Session', kind: 'text', body: lines.join(NL) }]);
  return;
}
const practiceData = result.data && typeof result.data === 'object' ? result.data : result;
if (!practiceData || (!practiceData.summary && !practiceData.questions && !practiceData.answers && !practiceData.script && !practiceData.rationale)) {
  emit(false, 'not-connected', null, 'Interview preparation returned no usable practice data', [{ id: 'error', title: 'No Practice Data', kind: 'text', body: 'The interview prep tool returned no practice material for ' + (role || 'the requested role') + '.' }]);
  return;
}
const summary = practiceData.summary || (Array.isArray(practiceData.questions) ? practiceData.questions.join(NL) : '');
const body = ['Mock Interview Prep'];
body.push('================');
body.push('');
body.push('Role: ' + (role || '(not specified)'));
body.push('Company: ' + (company || '(not specified)'));
body.push('Stage: ' + (input.stage || 'general'));
body.push('');
if (summary) body.push(summary);
if (practiceData.questions) {
  body.push('');
  body.push('Key Questions to Practice:');
  if (Array.isArray(practiceData.questions)) {
    practiceData.questions.forEach(function (q) { body.push('- ' + q); });
  } else {
    body.push(String(practiceData.questions));
  }
}
emit(true, 'ok', { interviewPrep: practiceData, delegatedTo: 'career-interview-prep', mockSessionId: 'mock_' + Date.now(), targetRole: role, company: company, stage: input.stage, generatedAt: new Date().toISOString() }, null, [{ id: 'session', title: 'Mock Interview Session', kind: 'text', body: body.join(NL) }]);
})();`;

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_INPUT = {
type: 'object',
properties: {
stage: { type: 'string', enum: ['phone_screen', 'technical', 'onsite', 'final'], description: 'Interview stage' },
  targetRole: { type: 'string', description: 'Target role title' },
  company: { type: 'string', description: 'Target company name' },
},
};

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER = createCodeSkill({
id: 'career-interview-practice-mock-interviewer',
name: 'Interview Practice & Mock Interviewer',
description: 'Runs interactive mock interviews using role/company battlecards, records performance, and produces actionable coaching notes. Delegates to career-interview-prep. Reports not-connected when no interview context is available.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: INTERVIEW_PRACTICE_MOCK_INTERVIEWER_SOURCE,
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    lowerOrderTools: ['career-interview-prep'],
    actionLabel: 'Start mock interview',
    timeoutMs: 60000,
  },
inputSchema: INTERVIEW_PRACTICE_MOCK_INTERVIEWER_INPUT,
outputSchema: careerResultSchema('Mock interview session data with practice material and session ID'),
triggers: [
{ kind: 'user', phrase_examples: ['Mock interview me', 'Practice for this interview', 'Run a mock session'] },
],
tier: 'aid',
domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
isSkill: true,
});
INTERVIEW_PRACTICE_MOCK_INTERVIEWER.configSchema = INTERVIEW_PRACTICE_MOCK_INTERVIEWER.manifest.configSchema as SchemaRecord;

export { INTERVIEW_PRACTICE_MOCK_INTERVIEWER };
