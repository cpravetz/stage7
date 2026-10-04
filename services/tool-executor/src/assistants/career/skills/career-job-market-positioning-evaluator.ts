// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

/**
 * The design names two inputs, `resume` and `market`. Both are declared here as
 * optional overrides: the scheduled run supplies neither and reads the stored
 * profile and the stored listings instead, which is why they are not required.
 * Supplying them is how a person who has not run intake or discovery yet still
 * gets an answer rather than a bare Run button with nothing to act on.
 */
const JOB_MARKET_POSITIONING_EVALUATOR_INPUT = {
  type: 'object',
  properties: {
    resume: {
      type: 'string',
      description: 'Resume text to position, when there is no stored profile yet',
      multiline: true,
    },
    market: {
      type: 'object',
      description: 'Job listings to position against, when discovery has not been run yet',
    },
    profileId: { type: 'string', default: 'default', description: 'Profile ID to use for positioning' },
  },
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

const JOB_MARKET_POSITIONING_EVALUATOR = createDeclarativeCodeSkill({
  id: 'career-job-market-positioning-evaluator',
  name: 'Resume & Market Positioning Advisor',
  description: 'Reviews your resume and profile against the roles already found by Job Discovery & Fit Ranking to suggest resume edits and a realistic target salary range. Run Job Discovery first for the best results. Propagates upstream job-source failures: a market read built on a partial discovery is reported as status "partial" with a non-null error, and a discovery that failed outright is reported as a failure rather than as a clean positioning read.',
  persistenceEnvVar: 'CAREER_HOME',
  inputSchema: JOB_MARKET_POSITIONING_EVALUATOR_INPUT,
  outputSchema: JOB_MARKET_POSITIONING_EVALUATOR_OUTPUT,
  triggers: [
    { kind: 'schedule', cadence: 'After job discovery completes' },
  ],
  tier: 'advise',
  domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
  isSkill: true,
  manifest: {
    lowerOrderTools: ['career-profile-intake', 'career-job-discovery', 'career-rank'],
    configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
    actionLabel: 'Evaluate positioning'
  },
  handler: async function handler(input, ctx) {
      const suppliedResume = String((input && input.resume) || '').trim();

      const profileRes = suppliedResume ? { success: true, data: { resumeText: suppliedResume } } : await ctx.delegate('career-profile-intake', { profileId: input.profileId || 'default' });
      if (!profileRes || !profileRes.success) {
        return {
          success: false,
          status: 'blocked',
          delegatedTo: ['career-profile-intake'],
          data: { failures: [{ board: 'career-profile-intake', note: profileRes?.error || 'the stored profile could not be read' }], failureCount: 1, complete: false },
          error: 'Positioning needs a stored profile, and career-profile-intake did not return one: ' + String(profileRes?.error || 'no profile available'),
          present: [
            ctx.render.text('notice', 'No profile to position', 'Save a profile first (Resume & Profile Intake), then this Skill can compare it against discovered roles.'),
          ],
          generatedAt: new Date().toISOString(),
        };
      }
      const profile = profileRes.data && profileRes.data.profile ? profileRes.data.profile : profileRes.data || profileRes;

      let listings = [];
      const suppliedMarket = input && input.market;
      if (Array.isArray(suppliedMarket)) {
        listings = suppliedMarket;
      } else if (suppliedMarket && Array.isArray((suppliedMarket as Record<string, unknown>).listings)) {
        listings = (suppliedMarket as Record<string, unknown>).listings as unknown[];
      }
      try {
        if (listings.length) throw new Error('supplied');
        const parsed = ctx.store.load('listPath', null);
        if (Array.isArray(parsed)) listings = parsed;
        else if (parsed && Array.isArray(parsed.listings)) listings = parsed.listings;
      } catch { listings = []; }

      let discovery = null;
      let rank = null;
      if (!listings.length) {
      const inferredTitles = (profile && profile.targetTitles) || (profile && profile.personal && profile.personal.headline ? [profile.personal.headline] : []) || [];
      discovery = await ctx.delegate('career-job-discovery', { queries: inferredTitles });
      rank = await ctx.delegate('career-rank', { items: (discovery && discovery.data && discovery.data.listings) || (discovery && discovery.data) || [] });
      } else if (listings.length) {
      // Rank the stored listings against the profile's target titles
      rank = await ctx.delegate('career-rank', { items: listings, jobTitles: profile && profile.targetTitles ? profile.targetTitles : [] });
      }

      const discoveryStatus = discovery && typeof discovery.status === 'string' ? discovery.status : null;
      const discoveryError = discovery && discovery.error ? String(discovery.error) : null;
      const discoveryData = discovery && discovery.data && typeof discovery.data === 'object' ? discovery.data : {};
      const discoveryFailures = Array.isArray(discoveryData.failures) ? discoveryData.failures : [];
      const discoveryPartial = !!discovery && discovery.success !== false && (discoveryStatus === 'partial' || discoveryFailures.length > 0);
      const discoveryFailed = !!discovery && discovery.success === false;
      const discoverySignal = discovery ? { status: discoveryStatus || (discovery.success === false ? 'failed' : 'ok'), failures: discoveryFailures, failureCount: discoveryFailures.length, byBoard: discoveryData.byBoard || [] } : null;

      function failureLines(list) {
      return list.map((f) => '  [FAILED] ' + ((f && f.board) || 'unknown source') + ' \u2014 ' + ((f && f.note) || 'this source could not be retrieved or read')).join('\n');
      }
      function discoveryBlock(status, error) {
      const lines = [status === 'blocked' ? 'MARKET POSITIONING HAD NO MARKET DATA' : 'MARKET POSITIONING FAILED', status === 'blocked' ? '=============================' : '=======================', '', error];
      if (discoveryFailures.length) lines.push('', 'Sources attempted:', failureLines(discoveryFailures));
      return { id: 'failure', title: status === 'blocked' ? 'No market data to position against' : 'Market positioning FAILED \u2014 no job source could be retrieved', kind: 'text', body: lines.join('\n') };
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
        ].join('\n'),
      };
      }

      if (!listings.length && (!discovery || !discovery.success) && (!rank || !rank.success)) {
      const resumeText = profile && (profile.resume && (profile.resume.rawText || profile.resume.parsedText)) ? (profile.resume.rawText || profile.resume.parsedText) : undefined;
      const positioning = {
        summary: resumeText ? 'Profile parsed; limited market signals until you run Job Discovery & Fit Ranking.' : 'Profile found but no market data available; run Job Discovery & Fit Ranking first for richer positioning',
        strengths: profile && profile.personal ? Object.keys(profile.personal).filter(k=>!!profile.personal[k]) : [],
      };
      const status = discoveryStatus === 'blocked' ? 'blocked' : 'failed';
      const error = discoveryError || (status === 'blocked'
        ? 'MARKET POSITIONING BLOCKED. There was nothing to search: no job titles could be derived from the profile, so no job source was consulted and this run produced no market positioning.'
        : 'MARKET POSITIONING FAILED. Job discovery did not answer, so no job source could be read and this run produced no market positioning at all. It did not determine that the market is empty.');

      return {
        success: false,
        status: status,
        delegatedTo: ['career-profile-intake', 'career-job-discovery', 'career-rank'],
        data: {
          marketSignals: { listingsUsed: 'none', discovery: discoverySignal, discoveryStatus: discoveryStatus || (discovery ? 'ok' : null), rank: null },
          recommendation: positioning,
          failures: discoveryFailures,
          failureCount: discoveryFailures.length,
          complete: false,
          note: error,
          generatedAt: new Date().toISOString(),
        },
        error: error,
        present: [
          discoveryBlock(status, error),
        ],
        generatedAt: new Date().toISOString(),
      };
      }

      // Prefer ranked results from the rank delegate; fall back to raw listings
      const ranked = (rank && rank.success && rank.data && Array.isArray(rank.data.ranked) && rank.data.ranked.length)
        ? rank.data.ranked
        : (listings.length ? listings : ((discovery && discovery.success && discovery.data && discovery.data.listings) || []));
      const carriedDiscovery = discovery && discovery.success ? Object.assign({}, discoveryData, { status: discoveryStatus || 'ok', failures: discoveryFailures, failureCount: discoveryFailures.length }) : null;
      const marketSignals = { listingsUsed: listings.length ? 'stored-from-job-discovery' : 'live-lookup', discovery: carriedDiscovery, discoveryStatus: discoveryStatus || (discovery ? 'ok' : null), rank: rank && rank.success ? rank.data : null };

      // Extract profile skills for gap analysis
      const profileSkills = (profile && Array.isArray(profile.skills)) ? profile.skills.map(function (s) { return String(s).toLowerCase(); }) : [];

      // Broad keyword set covering tech, marketing, product, and general business
      const SKILL_KEYWORDS = [
        // Technical
        'sql', 'python', 'aws', 'gcp', 'azure', 'kubernetes', 'docker', 'react', 'typescript', 'java', 'go', 'rust',
        // Marketing & Growth
        'seo', 'sem', 'ppc', 'google ads', 'meta ads', 'facebook ads', 'email marketing', 'klaviyo', 'mailchimp', 'hubspot', 'marketo', 'braze',
        'content marketing', 'content strategy', 'copywriting', 'social media', 'influencer marketing', 'affiliate marketing',
        'growth marketing', 'demand generation', 'lead generation', 'conversion rate optimization', 'cro', 'a/b testing',
        'analytics', 'google analytics', 'ga4', 'mixpanel', 'amplitude', 'tableau', 'looker', 'data analysis',
        'marketing automation', 'crm', 'salesforce', 'customer journey', 'segmentation', 'personalization',
        // Product Marketing
        'product marketing', 'go-to-market', 'gtm', 'positioning', 'messaging', 'competitive intelligence', 'sales enablement',
        'product launch', 'product adoption', 'user research', 'market research', 'pricing', 'packaging',
        // General Business
        'project management', 'agile', 'scrum', 'jira', 'asana', 'budget management', 'strategic planning',
        'cross-functional', 'stakeholder management', 'presentation', 'communication', 'leadership'
      ];

      const topRoleSkills = new Set();
      ranked.slice(0, 5).forEach(function (r) {
        if (r && Array.isArray(r.skills)) r.skills.forEach(function (s) { topRoleSkills.add(String(s).toLowerCase()); });
        const tokens = new Set(String((r && r.description) || '').toLowerCase().split(/[^a-z0-9+#]+/));
        SKILL_KEYWORDS.forEach(function (kw) { if (tokens.has(kw)) topRoleSkills.add(kw); });
      });
      const missingSkills = Array.from(topRoleSkills).filter(function (s) { return !!s && !profileSkills.includes(s); });
      const suggestedProfileEdits = missingSkills.slice(0, 10).map(function (s) { return 'Add "' + s + '" to your skills section'; });

      const recommendation = {
      topRoles: ranked.slice(0, 5),
      targetComp: (ranked[0] && (ranked[0].estimatedCompensation || ranked[0].compensation || ranked[0].salary)) || null,
      suggestedProfileEdits: suggestedProfileEdits
      };

      // Fallback: estimate compensation from role seniority if no salary data
      if (!recommendation.targetComp && ranked.length > 0) {
        const title = String(ranked[0].title || '').toLowerCase();
        let estimate = null;
        if (title.includes('director') || title.includes('vp') || title.includes('head of')) {
          estimate = { min: 150000, max: 250000, currency: 'USD', raw: 'Estimated for Director+' };
        } else if (title.includes('senior') || title.includes('lead') || title.includes('principal')) {
          estimate = { min: 120000, max: 180000, currency: 'USD', raw: 'Estimated for Senior/Lead' };
        } else if (title.includes('manager')) {
          estimate = { min: 90000, max: 140000, currency: 'USD', raw: 'Estimated for Manager' };
        } else {
          estimate = { min: 70000, max: 110000, currency: 'USD', raw: 'Estimated for Individual Contributor' };
        }
        recommendation.targetComp = estimate;
      }

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
      if (recommendation.suggestedProfileEdits.length) {
      positioningLines.push('');
      positioningLines.push('Profile gaps against these roles (' + recommendation.suggestedProfileEdits.length + '):');
      recommendation.suggestedProfileEdits.forEach(function (edit) { positioningLines.push('  - ' + edit); });
      }
      const presentBlocks = [];
      if (runStatus === 'failed') presentBlocks.push(discoveryBlock('failed', runError));
      presentBlocks.push({ id: 'positioning', title: 'Market Positioning', kind: 'text', body: positioningLines.join('\n') });
      if (runStatus === 'partial') presentBlocks.push(partialBlock(runError));

      return {
        success: true,
        status: runStatus,
        data: {
          marketSignals,
          recommendation,
          failures: discoveryFailures,
          failureCount: discoveryFailures.length,
          complete: runStatus !== 'partial' && runStatus !== 'failed',
          delegatedTo: ['career-profile-intake', 'career-job-discovery', 'career-rank'],
          note: runError,
          generatedAt: new Date().toISOString(),
        },
        error: runError,
        present: presentBlocks,
      };
    }
  });
JOB_MARKET_POSITIONING_EVALUATOR.configSchema = CAREER_WRAPPER_CONFIG_SCHEMA;
export { JOB_MARKET_POSITIONING_EVALUATOR };
