import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const JOB_MARKET_POSITIONING_EVALUATOR_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const profileRes = await __execute_tool('career_profile_intake', {});
if (!profileRes || !profileRes.success) {
  console.log(JSON.stringify({ success: false, mode: 'not-connected', error: profileRes && profileRes.error ? profileRes.error : 'Not connected: no profile available; run career_profile_intake first' }));
  return;
}
const profile = profileRes.data && profileRes.data.profile ? profileRes.data.profile : profileRes.data || profileRes;

// Attempt discovery and ranking where available
const discovery = await __execute_tool('career_job_discovery', { queries: input.queries || [] });
const rank = await __execute_tool('career_rank', { items: (discovery && discovery.data && discovery.data.listings) || discovery && discovery.data || [] });

if ((!discovery || !discovery.success) && (!rank || !rank.success)) {
  // Still produce a positioning summary based on profile if possible
  const resumeText = profile && (profile.resume && (profile.resume.rawText || profile.resume.parsedText)) ? (profile.resume.rawText || profile.resume.parsedText) : undefined;
  const positioning = {
    summary: resumeText ? 'Profile parsed; limited market signals without connected job boards.' : 'Profile found but no market data available; connect job boards for richer positioning',
    strengths: profile && profile.personal ? Object.keys(profile.personal).filter(k=>!!profile.personal[k]) : [],
  };
  console.log(JSON.stringify({ success: true, data: { positioning, delegatedTo: [], note: 'Partial: profile-only positioning', generatedAt: new Date().toISOString() } }));
  return;
}

const marketSignals = { discovery: discovery && discovery.success ? discovery.data : null, rank: rank && rank.success ? rank.data : null };
const recommendation = {
  topRoles: (rank && rank.success && rank.data && rank.data.top) || (discovery && discovery.success && discovery.data && discovery.data.ranked && discovery.data.ranked.slice(0,5)) || [],
  targetComp: input.targetComp || (discovery && discovery.data && discovery.data.estimatedCompensation) || null,
  suggestedProfileEdits: []
};

console.log(JSON.stringify({ success: true, data: { marketSignals, recommendation, delegatedTo: ['career_profile_intake', discovery && discovery.success ? 'career_job_discovery' : null, rank && rank.success ? 'career_rank' : null].filter(Boolean), generatedAt: new Date().toISOString() } }));
})();`;

const JOB_MARKET_POSITIONING_EVALUATOR_INPUT = {
  type: 'object',
  properties: {
    queries: { type: 'array', items: { type: 'string' } },
    targetComp: { type: 'number' },
  },
};

const JOB_MARKET_POSITIONING_EVALUATOR_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
  },
  required: ['success', 'data'],
};

const JOB_MARKET_POSITIONING_EVALUATOR = createCodeSkill({
  id: 'career-job-market-positioning-evaluator',
  name: 'Job Market Positioning Evaluator',
  description: 'Evaluates candidate credentials against market trends, salary bands, and role criteria. Delegates to career_profile_intake and career_job_discovery/career_rank where available.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: JOB_MARKET_POSITIONING_EVALUATOR_SOURCE,
    lowerOrderTools: ['career_profile_intake', 'career_job_discovery', 'career_rank'],
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Evaluate positioning',
  },
  inputSchema: JOB_MARKET_POSITIONING_EVALUATOR_INPUT,
  outputSchema: JOB_MARKET_POSITIONING_EVALUATOR_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Evaluate my market positioning', 'How should I position my resume', 'Job market fit analysis'] },
  ],
});
export { JOB_MARKET_POSITIONING_EVALUATOR };
