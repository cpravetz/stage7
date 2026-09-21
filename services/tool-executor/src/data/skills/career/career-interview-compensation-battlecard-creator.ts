import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const INTERVIEW_COMPENSATION_BATTLECARD_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
let jobId = input.targetRole || '';

// Ask interview-prep generator for company-specific Q&A and negotiation guidance
const prep = await __execute_tool('career_interview_prep', { jobId, targetRole: input.targetRole, company: input.company });
const advisory = await __execute_tool('career_advisory', { question: 'Generate compensation negotiation points for this role', targetRole: input.targetRole, company: input.company });

if ((!prep || !prep.success) && (!advisory || !advisory.success)) {
  console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: interview prep and negotiation guidance are unavailable; ensure connectors or dependencies are configured' }));
  return;
}

const briefing = {
  company: input.company || (prep && prep.data && prep.data.company) || null,
  questions: prep && prep.success ? (prep.data.questions || prep.data.q_and_a || prep.data) : [],
  negotiation: advisory && advisory.success ? advisory.data : null,
  generatedAt: new Date().toISOString(),
  delegatedTo: ['career_interview_prep', advisory && advisory.success ? 'career_advisory' : null].filter(Boolean),
};

console.log(JSON.stringify({ success: true, data: { briefing, pdfPreview: null, delegatedTo: briefing.delegatedTo, generatedAt: new Date().toISOString() } }));
})();`;

const INTERVIEW_COMPENSATION_BATTLECARD_INPUT = {
  type: 'object',
  properties: {
    company: { type: 'string', description: 'Company you are interviewing with' },
  },
  required: [],
};

const INTERVIEW_COMPENSATION_BATTLECARD_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
  },
  required: ['success', 'data'],
};

const INTERVIEW_COMPENSATION_BATTLECARD = createCodeSkill({
  id: 'career-interview-compensation-battlecard-creator',
  name: 'Interview & Negotiation Prep',
  description: 'Generates a tailored interview Q&A briefing and a compensation negotiation script for a specific company. Delegates to career_interview_prep and career_advisory where available.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: INTERVIEW_COMPENSATION_BATTLECARD_SOURCE,
    lowerOrderTools: ['career_interview_prep', 'career_advisory'],
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Create interview briefing',
  },
  inputSchema: INTERVIEW_COMPENSATION_BATTLECARD_INPUT,
  outputSchema: INTERVIEW_COMPENSATION_BATTLECARD_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Prepare me for this interview', 'Interview prep checklist', 'Compensation negotiation script'] },
  ],
});
export { INTERVIEW_COMPENSATION_BATTLECARD };
