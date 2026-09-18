import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const INTERVIEW_COMPENSATION_BATTLECARD_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const profileRes = await __execute_tool('career_profile_intake', {});
if (!profileRes || !profileRes.success) {
  console.log(JSON.stringify({ success: false, mode: 'not-connected', error: profileRes && profileRes.error ? profileRes.error : 'Not connected: no profile available; run career_profile_intake first' }));
  return;
}
const profile = profileRes.data && profileRes.data.profile ? profileRes.data.profile : profileRes.data || profileRes;

// Ask interview-prep generator for company-specific Q&A and negotiation guidance
const prep = await __execute_tool('career_interview_prep', { jobId: input.jobId, company: input.company });
const advisory = await __execute_tool('career_advisory', { question: input.advisoryQuestion || 'Generate compensation negotiation points for this role' });

if ((!prep || !prep.success) && (!advisory || !advisory.success)) {
  console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: interview prep and advisory are unavailable; ensure connectors or dependencies are configured' }));
  return;
}

const battlecard = {
  company: input.company || (prep && prep.data && prep.data.company) || null,
  questions: prep && prep.success ? (prep.data.questions || prep.data.q_and_a || prep.data) : [],
  negotiation: advisory && advisory.success ? advisory.data : null,
  generatedAt: new Date().toISOString(),
  delegatedTo: ['career_interview_prep', advisory && advisory.success ? 'career_advisory' : null].filter(Boolean),
};

console.log(JSON.stringify({ success: true, data: { battlecard, pdfPreview: null, delegatedTo: battlecard.delegatedTo, generatedAt: new Date().toISOString() } }));
})();`;

const INTERVIEW_COMPENSATION_BATTLECARD_INPUT = {
  type: 'object',
  properties: {
    jobId: { type: 'string' },
    company: { type: 'string' },
    advisoryQuestion: { type: 'string' },
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
  name: 'Interview & Compensation Battlecard Creator',
  description: 'Generates tailored interview Q&A frameworks, company-specific briefing decks, and negotiation scripts. Delegates to career_interview_prep and career_advisory where available.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: INTERVIEW_COMPENSATION_BATTLECARD_SOURCE,
    lowerOrderTools: ['career_interview_prep', 'career_advisory'],
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Create interview battlecard',
  },
  inputSchema: INTERVIEW_COMPENSATION_BATTLECARD_INPUT,
  outputSchema: INTERVIEW_COMPENSATION_BATTLECARD_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Create battlecard', 'Interview prep checklist', 'Compensation negotiation script'] },
  ],
});
export { INTERVIEW_COMPENSATION_BATTLECARD };
