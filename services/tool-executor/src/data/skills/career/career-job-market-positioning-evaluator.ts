import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

const JOB_MARKET_POSITIONING_EVALUATOR_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const profileRes = await __execute_tool('career-profile-intake', {});
if (!profileRes || !profileRes.success) {
  console.log(JSON.stringify({ success: false, status: 'not-connected', error: profileRes && profileRes.error ? profileRes.error : 'Not connected: no profile available; run career-profile-intake first' }));
  return;
}
const profile = profileRes.data && profileRes.data.profile ? profileRes.data.profile : profileRes.data || profileRes;

// Reuse listings already found by the "Job Discovery & Fit Ranking" skill instead of
// asking the user to re-enter the same job titles and target compensation here.
const fs = require('fs');
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const listPath = baseDir + '/listings/default.json';
let listings = [];
try { listings = fs.existsSync(listPath) ? JSON.parse(fs.readFileSync(listPath, 'utf8')) : []; } catch { listings = []; }

let discovery = null;
let rank = null;
if (!listings.length) {
  // No prior search results yet: derive a starting query from the candidate's own profile.
  const inferredTitles = (profile && profile.targetTitles) || (profile && profile.personal && profile.personal.headline ? [profile.personal.headline] : []) || [];
  discovery = await __execute_tool('career-job-discovery', { queries: inferredTitles });
  rank = await __execute_tool('career-rank', { items: (discovery && discovery.data && discovery.data.listings) || (discovery && discovery.data) || [] });
}

if (!listings.length && (!discovery || !discovery.success) && (!rank || !rank.success)) {
  const resumeText = profile && (profile.resume && (profile.resume.rawText || profile.resume.parsedText)) ? (profile.resume.rawText || profile.resume.parsedText) : undefined;
  const positioning = {
    summary: resumeText ? 'Profile parsed; limited market signals until you run Job Discovery & Fit Ranking.' : 'Profile found but no market data available; run Job Discovery & Fit Ranking first for richer positioning',
    strengths: profile && profile.personal ? Object.keys(profile.personal).filter(k=>!!profile.personal[k]) : [],
  };
  console.log(JSON.stringify({ success: true, data: { positioning, delegatedTo: [], note: 'Partial: profile-only positioning', generatedAt: new Date().toISOString() } }));
  return;
}

const ranked = listings.length ? listings : ((rank && rank.success && rank.data && rank.data.top) || (discovery && discovery.success && discovery.data && discovery.data.ranked) || []);
const marketSignals = { listingsUsed: listings.length ? 'stored-from-job-discovery' : 'live-lookup', discovery: discovery && discovery.success ? discovery.data : null, rank: rank && rank.success ? rank.data : null };
const recommendation = {
  topRoles: ranked.slice(0, 5),
  targetComp: (ranked[0] && (ranked[0].estimatedCompensation || ranked[0].compensation)) || null,
  suggestedProfileEdits: []
};

console.log(JSON.stringify({ success: true, data: { marketSignals, recommendation, delegatedTo: ['career-profile-intake', listings.length ? 'stored-listings' : 'career-job-discovery'].filter(Boolean), generatedAt: new Date().toISOString() } }));
})();`;

const JOB_MARKET_POSITIONING_EVALUATOR_INPUT = {
  type: 'object',
  properties: {},
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
  name: 'Resume & Market Positioning Advisor',
  description: 'Reviews your resume and profile against the roles already found by Job Discovery & Fit Ranking to suggest resume edits and a realistic target salary range. Run Job Discovery first for the best results.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: JOB_MARKET_POSITIONING_EVALUATOR_SOURCE,
    lowerOrderTools: ['career-profile-intake', 'career-job-discovery', 'career-rank'],
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Evaluate positioning',
  },
  inputSchema: JOB_MARKET_POSITIONING_EVALUATOR_INPUT,
  outputSchema: JOB_MARKET_POSITIONING_EVALUATOR_OUTPUT,
  triggers: [
    { kind: 'schedule', cadence: 'After job discovery completes' },
  ],
isSkill: true,
});
export { JOB_MARKET_POSITIONING_EVALUATOR };
