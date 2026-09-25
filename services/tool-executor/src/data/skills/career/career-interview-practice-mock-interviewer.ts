import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
let jobId = input.targetRole || '';
if (!jobId) {
  const pipeline = await __execute_tool('career-pipeline-report', {});
  if (pipeline && pipeline.success && pipeline.data) {
    const pipelineData = pipeline.data;
    if (Array.isArray(pipelineData.tracking) && pipelineData.tracking.length) {
      jobId = pipelineData.tracking[0].jobId || pipelineData.tracking[0].id || '';
    }
  }
}
const result = await __execute_tool('career-interview-prep', { jobId, stage: input.stage, targetRole: input.targetRole, company: input.company });
if (!result || result.success === false || result.error) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: result && result.error ? result.error : 'Not connected: interview preparation could not be generated; ensure a profile and ranked job exist' }));
return;
}
const practiceData = result.data && typeof result.data === 'object' ? result.data : result;
if (!practiceData || (!practiceData.summary && !practiceData.questions && !practiceData.answers && !practiceData.script && !practiceData.rationale)) {
console.log(JSON.stringify({ success: false, status: 'not-connected', error: 'Not connected: interview preparation returned no usable practice data' }));
return;
}
console.log(JSON.stringify({ success: true, data: { interviewPrep: practiceData, delegatedTo: 'career-interview-prep', mockSessionId: 'mock_' + Date.now(), generatedAt: new Date().toISOString() } }));
})();`;

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_INPUT = {
type: 'object',
properties: {
stage: { type: 'string', enum: ['phone_screen', 'technical', 'onsite', 'final'], description: 'Interview stage' },
targetRole: { type: 'string', description: 'Target role title' },
company: { type: 'string', description: 'Target company name' },
},
};

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
status: { type: 'string', description: 'Execution status' },
data: {
type: 'object',
properties: {
interviewPrep: { type: 'object' },
mockSessionId: { type: 'string' },
delegatedTo: { type: 'string' },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string' },
},
required: ['success', 'data'],
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
},
inputSchema: INTERVIEW_PRACTICE_MOCK_INTERVIEWER_INPUT,
outputSchema: INTERVIEW_PRACTICE_MOCK_INTERVIEWER_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Mock interview me', 'Practice for this interview', 'Run a mock session'] },
],
});
INTERVIEW_PRACTICE_MOCK_INTERVIEWER.configSchema = INTERVIEW_PRACTICE_MOCK_INTERVIEWER.manifest.configSchema as SchemaRecord;

export { INTERVIEW_PRACTICE_MOCK_INTERVIEWER };
