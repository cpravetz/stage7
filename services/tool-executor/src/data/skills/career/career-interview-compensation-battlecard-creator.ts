import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';
import { careerResultSchema } from './career-contract';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const INTERVIEW_COMPENSATION_BATTLECARD_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const role = input.targetRole || '';
const company = input.company || '';
const NL = '\\n';

function emit(success, status, data, error, present) {
  console.log(JSON.stringify({ success: success, status: status, data: data || null, error: error || null, present: present || [] }));
  return { success: success, status: status, data: data || null, error: error || null, present: present || [] };
}

async function callBrain(prompt) {
  const brainUrl = process.env.BRAIN_URL || 'http://localhost:3000';
  const res = await fetch(brainUrl + '/api/brain/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemPrompt: 'You are a career coach. Provide concise, practical guidance.',
      prompt: prompt,
      options: { temperature: 0.4, maxTokens: 2048 },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.content || data.summary || null;
}

let prep = null, advisory = null, prepError = null, advisoryError = null;
const delegatedTo = [];
const coverage = [];
const missing = [];

if (role || company) {
  try {
    prep = await __execute_tool('career-interview-prep', { targetRole: role, company: company });
    if (prep && prep.success) { delegatedTo.push('career-interview-prep'); coverage.push('interview-prep'); }
    else { missing.push('interview-prep'); prepError = (prep && prep.error) || 'Tool returned failure'; }
  } catch (e) { missing.push('interview-prep'); prepError = e instanceof Error ? e.message : String(e); }

  try {
    advisory = await __execute_tool('career-advisory', { question: 'Generate compensation negotiation points for a ' + (role || 'role') + ' position at ' + (company || 'the company'), targetRole: role, company: company });
    if (advisory && advisory.success) { delegatedTo.push('career-advisory'); coverage.push('negotiation-advice'); }
    else { missing.push('negotiation-advice'); advisoryError = (advisory && advisory.error) || 'Tool returned failure'; }
  } catch (e) { missing.push('negotiation-advice'); advisoryError = e instanceof Error ? e.message : String(e); }
}

const prepOk = prep && prep.success;
const advisoryOk = advisory && advisory.success;
const prepData = prepOk ? (prep.data && typeof prep.data === 'object' ? prep.data : { summary: prep.data }) : null;
const advisoryData = advisoryOk ? (advisory.data && typeof advisory.data === 'object' ? advisory.data : { summary: advisory.data }) : null;

let questions = [];
let negotiation = null;
let sourceNote = null;

if (prepData) {
  questions = prepData.questions || prepData.q_and_a || (prepData.summary ? [prepData.summary] : []);
}

if (advisoryData) {
  negotiation = advisoryData.summary || String(advisoryData);
}

// If delegated tools failed, attempt a direct brain call for company-specific content
if (!prepOk && (role || company)) {
  const brainPrompt = 'Generate 5-7 interview questions for a ' + (role || 'role') + ' position' + (company ? ' at ' + company : '') + '. Focus on the specific challenges, culture, and role expectations. Format as a plain list.';
  const brainResult = await callBrain(brainPrompt).catch(() => null);
  if (brainResult) {
    questions = brainResult.split('\\n').filter(function (l) { return l.trim().length > 0; });
    sourceNote = 'Generated via direct brain call (delegated tools unavailable).';
  }
}

if (!advisoryOk && (role || company)) {
  const negoPrompt = 'Generate compensation negotiation advice for a ' + (role || 'role') + ' position' + (company ? ' at ' + company : '') + '. Include market rate context, what to negotiate beyond base salary, and key tactics.';
  const negoResult = await callBrain(negoPrompt).catch(() => null);
  if (negoResult) {
    negotiation = negoResult;
    if (!sourceNote) sourceNote = 'Generated via direct brain call (delegated tools unavailable).';
  }
}

if (!questions.length && !negotiation && !sourceNote) {
  emit(false, 'not-connected', null, 'Interview prep and negotiation guidance are unavailable; ensure the assistant model (brain) is configured and reachable at BRAIN_URL', [{ id: 'error', title: 'Not Connected', kind: 'text', body: 'Interview preparation requires a configured assistant model. Contact your administrator to verify BRAIN_URL and model availability.' }]);
  return;
}

const briefing = {
  company: company,
  targetRole: role,
  questions: typeof questions === 'string' ? [questions] : questions,
  negotiation: negotiation ? String(negotiation) : null,
  generatedAt: new Date().toISOString(),
  delegatedTo,
  coverage,
  missing,
  sourceNote,
};

const present = [];
present.push({ id: 'interview-questions', title: 'Interview Questions', kind: 'text', body: (typeof questions === 'string' ? questions : questions.map(function (q) { return '- ' + q; }).join(NL)) || '(No questions available.)' });
if (negotiation) {
  present.push({ id: 'negotiation-script', title: 'Compensation Negotiation', kind: 'text', body: String(negotiation) });
}
if (sourceNote) {
  present.push({ id: 'source', title: 'Source', kind: 'text', body: sourceNote });
}

emit(true, 'ok', briefing, null, present);
})();`;

const INTERVIEW_COMPENSATION_BATTLECARD_INPUT = {
  type: 'object',
  properties: {
    company: { type: 'string', description: 'Company you are interviewing with', title: 'Company', order: 1, hint: 'The company you are interviewing with' },
    targetRole: { type: 'string', description: 'Target role title', title: 'Target Role', order: 2, hint: 'The role you are interviewing for' },
  },
  required: [],
};

const INTERVIEW_COMPENSATION_BATTLECARD = createCodeSkill({
  id: 'career-interview-compensation-battlecard-creator',
  name: 'Interview & Negotiation Prep',
  description: 'Generates a tailored interview Q&A briefing and a compensation negotiation script for a specific company. Delegates to career-interview-prep and career-advisory where available.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: INTERVIEW_COMPENSATION_BATTLECARD_SOURCE,
    lowerOrderTools: ['career-interview-prep', 'career-advisory'],
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Create interview briefing',
    timeoutMs: 60000,
  },
  inputSchema: INTERVIEW_COMPENSATION_BATTLECARD_INPUT,
  outputSchema: careerResultSchema('Interview briefing with questions and negotiation guide, derived from inputs'),
  triggers: [
    { kind: 'user', phrase_examples: ['Prepare me for this interview', 'Interview prep checklist', 'Compensation negotiation script'] },
  ],
  tier: 'aid',
  domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
  isSkill: true,
});
export { INTERVIEW_COMPENSATION_BATTLECARD };
