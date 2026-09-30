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
// Read the listings array out of the stored file. Job discovery writes an OBJECT envelope
// carrying { listings, byBoard, failures, ... }, not a bare array. Assigning the parsed
// envelope straight to the listings variable made its .length undefined, so the
// "reuse the stored search" branch below never fired and this skill re-ran a full
// discovery on every call.
let listings = [];
try {
  if (fs.existsSync(listPath)) {
    const parsed = JSON.parse(fs.readFileSync(listPath, 'utf8'));
    if (Array.isArray(parsed)) listings = parsed;
    else if (parsed && Array.isArray(parsed.listings)) listings = parsed.listings;
  }
} catch { listings = []; }

let discovery = null;
let rank = null;
if (!listings.length) {
  // No prior search results yet: derive a starting query from the candidate's own profile.
  const inferredTitles = (profile && profile.targetTitles) || (profile && profile.personal && profile.personal.headline ? [profile.personal.headline] : []) || [];
  discovery = await __execute_tool('career-job-discovery', { queries: inferredTitles });
  rank = await __execute_tool('career-rank', { items: (discovery && discovery.data && discovery.data.listings) || (discovery && discovery.data) || [] });
}

// Upstream discovery run statuses this skill must carry rather than flatten into "ok":
//   ok       - every source answered. A clean pass, reported clean.
//   no-match - every source answered and genuinely had no matching roles. A legitimate
//              empty, not a failure and not a partial.
//   partial  - some sources answered, others could not be retrieved or parsed at all.
//   failed   - no source could be retrieved. A total failure.
//   blocked  - nothing to search.
// A market read built on a partial discovery is a partial read: the boards that could
// not be reached are missing from the market signals, not empty, so this skill reports
// status 'partial' with a non-null error and the failed sources listed, instead of a
// clean 'ok' that would read as a complete view of the market. A discovery that failed
// outright is not degraded, it produced no market data at all, and is reported as a
// failure of this run rather than as a successful positioning read.
const discoveryStatus = discovery && typeof discovery.status === 'string' ? discovery.status : null;
const discoveryError = discovery && discovery.error ? String(discovery.error) : null;
const discoveryData = discovery && discovery.data && typeof discovery.data === 'object' ? discovery.data : {};
const discoveryFailures = Array.isArray(discoveryData.failures) ? discoveryData.failures : [];
const discoveryPartial = !!discovery && discovery.success !== false && (discoveryStatus === 'partial' || discoveryFailures.length > 0);
const discoveryFailed = !!discovery && discovery.success === false;
const discoverySignal = discovery ? { status: discoveryStatus || (discovery.success === false ? 'failed' : 'ok'), failures: discoveryFailures, failureCount: discoveryFailures.length, byBoard: discoveryData.byBoard || [] } : null;

function failureLines(list) {
  return list.map((f) => '  [FAILED] ' + ((f && f.board) || 'unknown source') + ' \u2014 ' + ((f && f.note) || 'this source could not be retrieved or read')).join('\\n');
}
function discoveryBlock(status, error) {
  const lines = [status === 'blocked' ? 'MARKET POSITIONING HAD NO MARKET DATA' : 'MARKET POSITIONING FAILED', status === 'blocked' ? '=============================' : '=======================', '', error];
  if (discoveryFailures.length) lines.push('', 'Sources attempted:', failureLines(discoveryFailures));
  return { id: 'failure', title: status === 'blocked' ? 'No market data to position against' : 'Market positioning FAILED \u2014 no job source could be retrieved', kind: 'text', body: lines.join('\\n') };
}
function partialBlock(error) {
  return {
    id: 'partial',
    title: 'PARTIAL MARKET READ \u2014 ' + discoveryFailures.length + ' source' + (discoveryFailures.length === 1 ? '' : 's') + ' were never read',
    kind: 'text',
    body: [
      'PARTIAL MARKET READ. This positioning is not a complete answer about the job market.',
      '',
      error,
      '',
      'Sources that could not be retrieved or read:',
      failureLines(discoveryFailures),
    ].join('\\n'),
  };
}

if (!listings.length && (!discovery || !discovery.success) && (!rank || !rank.success)) {
  const resumeText = profile && (profile.resume && (profile.resume.rawText || profile.resume.parsedText)) ? (profile.resume.rawText || profile.resume.parsedText) : undefined;
  const positioning = {
    summary: resumeText ? 'Profile parsed; limited market signals until you run Job Discovery & Fit Ranking.' : 'Profile found but no market data available; run Job Discovery & Fit Ranking first for richer positioning',
    strengths: profile && profile.personal ? Object.keys(profile.personal).filter(k=>!!profile.personal[k]) : [],
  };
  // Discovery did not answer, so there is no market to position against. That is a
  // failure of the run, not a clean pass that happened to return nothing: the
  // profile-only blurb is still returned, but the status and error say why it is thin.
  const status = discoveryStatus === 'blocked' ? 'blocked' : 'failed';
  const error = discoveryError || (status === 'blocked'
    ? 'MARKET POSITIONING BLOCKED. There was nothing to search: no job titles could be derived from the profile, so no job source was consulted and this run produced no market positioning.'
    : 'MARKET POSITIONING FAILED. Job discovery did not answer, so no job source could be read and this run produced no market positioning at all. It did not determine that the market is empty.');
  console.log(JSON.stringify({ success: false, status: status, error: error, data: { positioning, marketSignals: { listingsUsed: 'none', discovery: discoverySignal, rank: null }, delegatedTo: ['career-job-discovery'], failures: discoveryFailures, failureCount: discoveryFailures.length, complete: false, note: 'Profile-only positioning, no market data: ' + error, generatedAt: new Date().toISOString() }, present: [discoveryBlock(status, error)] }));
  return;
}

const ranked = listings.length ? listings : ((rank && rank.success && rank.data && rank.data.ranked) || (discovery && discovery.success && discovery.data && discovery.data.listings) || []);
// The discovery payload is carried through, but not opaquely: its run status and its
// per-source retrieval failures ride with it, so the signal block itself records that
// the market read is missing sources rather than looking like a complete one.
const carriedDiscovery = discovery && discovery.success ? Object.assign({}, discoveryData, { status: discoveryStatus || 'ok', failures: discoveryFailures, failureCount: discoveryFailures.length }) : null;
const marketSignals = { listingsUsed: listings.length ? 'stored-from-job-discovery' : 'live-lookup', discovery: carriedDiscovery, discoveryStatus: discoveryStatus || (discovery ? 'ok' : null), rank: rank && rank.success ? rank.data : null };
const recommendation = {
  topRoles: ranked.slice(0, 5),
  targetComp: (ranked[0] && (ranked[0].estimatedCompensation || ranked[0].compensation)) || null,
  suggestedProfileEdits: []
};

// A partial discovery produced a real but incomplete market read, so the run is
// partial. A discovery that failed outright produced no read at all: the rank step is
// fed from that same empty answer, so the empty ranking below is a consequence of the
// failure and is not a legitimate empty market. That run fails, rather than passing a
// market read off as complete when no source was ever read.
const runStatus = discoveryFailed ? 'failed' : (discoveryPartial ? 'partial' : 'ok');
const runError = runStatus === 'ok'
  ? null
  : (discoveryError || (runStatus === 'failed'
    ? 'MARKET POSITIONING FAILED. Job discovery did not answer, so no job source could be read and this run produced no market positioning at all. It did not determine that the market is empty.'
    : discoveryFailures.length + ' of the job sources this market read consulted could not be retrieved, so the positioning below is not a complete answer about the job market: ' + discoveryFailures.map((f) => (f && f.board) || 'unknown source').join(', ') + '.'));
const positioningLines = [];
positioningLines.push('Market Positioning');
positioningLines.push('==================');
positioningLines.push('');
positioningLines.push('Roles used for this read: ' + ranked.length + ' (' + marketSignals.listingsUsed + ')');
if (recommendation.targetComp) positioningLines.push('Target compensation: ' + JSON.stringify(recommendation.targetComp));
recommendation.topRoles.forEach(function (r, i) {
  positioningLines.push((i + 1) + '. ' + (r && (r.title || r.text)) + (r && r.company ? ' at ' + r.company : '') + (r && r.score != null ? ' (fit ' + r.score + ')' : ''));
});
const presentBlocks = [];
if (runStatus === 'failed') presentBlocks.push(discoveryBlock('failed', runError));
presentBlocks.push({ id: 'positioning', title: 'Market Positioning', kind: 'text', body: positioningLines.join('\\n') });
if (runStatus === 'partial') presentBlocks.push(partialBlock(runError));

console.log(JSON.stringify({ success: runStatus !== 'failed', status: runStatus, error: runError, data: { marketSignals, recommendation, failures: discoveryFailures, failureCount: discoveryFailures.length, complete: runStatus === 'ok', delegatedTo: ['career-profile-intake', listings.length ? 'stored-listings' : 'career-job-discovery'].filter(Boolean), note: runError || (ranked.length ? undefined : 'No job market data was available to position against; add target companies or titles to your profile.'), generatedAt: new Date().toISOString() }, present: presentBlocks }));
})();`;

const JOB_MARKET_POSITIONING_EVALUATOR_INPUT = {
  type: 'object',
  properties: {},
};

const JOB_MARKET_POSITIONING_EVALUATOR_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: 'string', description: 'ok, partial, failed or blocked. "partial" means the market read is missing job sources that could not be retrieved, so it is not a complete view of the market.' },
    data: {
      type: 'object',
      properties: {
        marketSignals: { type: 'object' },
        recommendation: { type: 'object' },
        failures: { type: 'array', description: 'The job sources that could not be retrieved or read, carried through from discovery. Non-empty on a partial run.' },
        failureCount: { type: 'number' },
        complete: { type: 'boolean', description: 'False when at least one job source could not be retrieved' },
        delegatedTo: { type: 'array', items: { type: 'string' } },
        note: { type: 'string' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
    error: { type: 'string', description: 'Null on a clean run. Non-null on partial, failed and blocked runs, naming what could not be retrieved' },
    present: {
      type: 'array',
      description: 'User-formatted blocks; a partial run always carries a block headed PARTIAL MARKET READ',
      items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, kind: { type: 'string' }, body: { type: 'string' } }, required: ['id', 'body'] },
    },
  },
  required: ['success', 'data'],
};

const JOB_MARKET_POSITIONING_EVALUATOR = createCodeSkill({
  id: 'career-job-market-positioning-evaluator',
  name: 'Resume & Market Positioning Advisor',
  description: 'Reviews your resume and profile against the roles already found by Job Discovery & Fit Ranking to suggest resume edits and a realistic target salary range. Run Job Discovery first for the best results. Propagates upstream job-source failures: a market read built on a partial discovery is reported as status "partial" with a non-null error, and a discovery that failed outright is reported as a failure rather than as a clean positioning read.',
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
    // user: this is a panel the user opens deliberately, and the "user" trigger
    // is what marks a tool as user-invocable. Without it the tool was visible
    // only because of its explicit isSkill:true, which contradicted its own
    // trigger data and would have broken silently the moment that flag was
    // reconciled with the trigger-derived value in index.ts.
    { kind: 'user', phrase_examples: ['How does my resume compare to these roles', 'What salary should I target', 'Review my positioning'] },
    // schedule: retained so the automatic post-discovery read still happens.
    { kind: 'schedule', cadence: 'After job discovery completes' },
  ],
tier: 'advise',
domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
isSkill: true,
});
export { JOB_MARKET_POSITIONING_EVALUATOR };
