import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';
import { careerResultSchema } from './career-contract';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const role = input.targetRole || '';
  const company = input.company || '';
const NL = '\\n';

// Deadline budget. nginx proxies /api with the default proxy_read_timeout of
// 60s, so this skill must always answer inside that window. The manifest
// timeoutMs below is 40000, and the bridge close, fs cleanup and JSON
// serialisation that follow the deadline consume the remaining 20s.
//
// The budget is what actually guarantees the emit. CodeExecutor only returns the
// child's captured stdout when the child exits cleanly (proc 'close' with code 0);
// its SIGKILL path discards stdout entirely. So a script still awaiting at 40s
// yields a bare timeout error, not a result. On expiry this flushes the same
// not-connected result and exits 0.
const SKILL_BUDGET_MS = Number(process.env.CAREER_MOCK_INTERVIEW_BUDGET_MS) > 0
  ? Number(process.env.CAREER_MOCK_INTERVIEW_BUDGET_MS)
  : 30000;

let settled = false;

function payload(success, status, data, error, present) {
  return { success: success, status: status, data: data || null, error: error || null, present: present || [] };
}

function emit(success, status, data, error, present) {
  if (settled) return null;
  settled = true;
  const out = payload(success, status, data, error, present);
  console.log(JSON.stringify(out));
  return out;
}

// Emits exactly one result and exits immediately, dropping any handle left open
// by the delegation still in flight. process.exit inside the write callback
// guarantees stdout is flushed first, which a bare process.exit(0) would not.
function emitAndExit(success, status, data, error, present) {
  if (settled) return;
  settled = true;
  const out = JSON.stringify(payload(success, status, data, error, present));
  process.stdout.write(out + '\\n', function () { process.exit(0); });
}

const work = (async function () {
let pipelineJobId = '';
let pipelineJobTitle = '';
if (!role) {
  // Not parallelisable: effectiveRole below depends on this result, so this call
  // must settle before career-interview-prep can be issued.
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
  return emit(false, 'not-connected', null, result && result.error ? (result.error + ' — interview preparation assistant is not configured') : 'Interview preparation assistant is not configured', [{ id: 'session', title: 'Mock Interview Session', kind: 'text', body: lines.join(NL) }]);
}
const practiceData = result.data && typeof result.data === 'object' ? result.data : result;
if (!practiceData || (!practiceData.summary && !practiceData.questions && !practiceData.answers && !practiceData.script && !practiceData.rationale)) {
  return emit(false, 'not-connected', null, 'Interview preparation returned no usable practice data', [{ id: 'error', title: 'No Practice Data', kind: 'text', body: 'The interview prep tool returned no practice material for ' + (role || 'the requested role') + '.' }]);
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
return emit(true, 'ok', { interviewPrep: practiceData, delegatedTo: 'career-interview-prep', mockSessionId: 'mock_' + Date.now(), targetRole: role, company: company, stage: input.stage, generatedAt: new Date().toISOString() }, null, [{ id: 'session', title: 'Mock Interview Session', kind: 'text', body: body.join(NL) }]);
})();

let budgetTimer = null;
const budget = new Promise(function (resolve) {
  budgetTimer = setTimeout(function () { resolve('budget-exhausted'); }, SKILL_BUDGET_MS);
});

const outcome = await Promise.race([work, budget]);
// Released on both paths so a settled run does not hold the child open until the
// budget would have fired.
clearTimeout(budgetTimer);

if (outcome === 'budget-exhausted') {
  const lines = ['Mock Interview Preparation (limited guidance)'];
  lines.push('===================================');
  lines.push('');
  lines.push('Role: ' + (role || '(not specified)'));
  lines.push('Company: ' + (company || '(not specified)'));
  lines.push('Stage: ' + (input.stage || 'general'));
  lines.push('');
  lines.push('The AI interview prep assistant did not respond in time. Below is a list of topics to review:');
  lines.push('- Company research: mission, values, recent news');
  lines.push('- Role responsibilities: match your experience to key requirements');
  lines.push('- Behavioral questions: use the STAR format (Situation, Task, Action, Result)');
  lines.push('- Technical questions: review core concepts for the role');
  lines.push('- Questions to ask: prepare 2-3 thoughtful questions about the team and role');
  emitAndExit(false, 'not-connected', null, 'Interview preparation assistant did not respond within ' + Math.round(SKILL_BUDGET_MS / 1000) + 's (verify BRAIN_URL reachability and model quota)', [{ id: 'session', title: 'Mock Interview Session', kind: 'text', body: lines.join(NL) }]);
}
return outcome;
})();`;

const INTERVIEW_PRACTICE_MOCK_INTERVIEWER_INPUT = {
type: 'object',
properties: {
stage: { type: 'string', enum: ['phone_screen', 'technical', 'onsite', 'final'], description: 'Interview stage' },
  targetRole: { type: 'string', description: 'Target role title', 'x-referenceSource': 'career-job-discovery-fit-ranking', 'x-referenceValueField': 'title', 'x-referenceLabel': 'your job search results' },
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
    // Must stay strictly inside nginx's 60s default proxy_read_timeout on
    // /api, with headroom for the teardown that follows the deadline. At 60000
    // it equalled the proxy budget exactly, so the 504 always won the tie.
    timeoutMs: 40000,
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
