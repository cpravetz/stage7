// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_WRAPPER_CONFIG_SCHEMA: SchemaRecord = {
  type: 'object',
  properties: {
    boardTokens: {
      type: 'object',
      description: 'Pin exact ATS board names, e.g. { "greenhouse": ["stripe"], "ashby": ["ashby"], "lever": ["leverdemo"] }. Optional - company names are probed automatically.',
      properties: {
        greenhouse: { type: 'array', items: { type: 'string' } },
        ashby: { type: 'array', items: { type: 'string' } },
        lever: { type: 'array', items: { type: 'string' } },
      },
    },
    maxPerBoard: { type: 'number', default: 50, description: 'Maximum listings to take from each board' },
  },
};

const JOB_DISCOVERY_FIT_RANKING_INPUT = {
type: 'object',
properties: {
jobTitles: { type: 'array', items: { type: 'string' }, description: 'Job titles to search for. Defaults to your saved target titles/roles from your profile.' },
companies: { type: 'array', items: { type: 'string' }, description: 'Company names to search. Checked against the public Greenhouse, Ashby and Lever job board APIs - no key needed. Defaults to your saved target companies.' },
locations: { type: 'array', items: { type: 'string' }, description: 'Target locations. Defaults to your saved preferences.' },
minSalary: { type: 'number', description: 'Minimum target compensation. Defaults to your saved preference.' },
maxSalary: { type: 'number', description: 'Maximum target compensation. Defaults to your saved preference.' },
autoApplyThreshold: { type: 'number', description: 'If set, automatically submit an application (via Apply to Jobs) to every ranked job scoring at or above this fit score' },
  minRoleScore: { type: 'number', description: 'Hide roles whose title matches none of the searched roles. Defaults to 0.01 when job titles were given, which keeps only roles that matched the search; set to 0 to see everything discovered, including off-target listings.' },
  dryRun: { type: 'boolean', description: 'Preview auto-applications without submitting; defaults to true', default: true },
},
};

const JOB_DISCOVERY_FIT_RANKING_OUTPUT = {
type: 'object',
properties: {
success: { type: 'boolean' },
status: { type: 'string', description: 'ok, no-match, partial, failed or blocked. "partial" means some job sources could not be retrieved at all, so the ranking covers only the sources that answered; "no-match" means every source answered and genuinely had no matching roles.' },
data: {
type: 'object',
properties: {
ranked: { type: 'array' },
  total: { type: 'number' },
  rawDiscovered: { type: 'number', description: 'Listings found before profile ranking' },
  offTarget: { type: 'number', description: 'Discovered listings held back because their title matched none of the searched roles, listed in data.droppedOffTarget' },
  droppedOffTarget: { type: 'array', description: 'The listings held back by the relevance floor, with the role match that excluded them' },
  roleQueries: { type: 'array', description: 'The role terms every score was measured against' },
queriesUsed: { type: 'array' },
companiesSearched: { type: 'array' },
byBoard: { type: 'array', description: 'Per-source status, so a real empty result is distinguishable from a source that never ran' },
  boards: { type: 'array' },
  failures: { type: 'array', description: 'The job sources that could not be retrieved or read, carried through from discovery. Non-empty on a partial run.' },
  failureCount: { type: 'number' },
  discoveryStatus: { type: 'string', description: 'The upstream discovery run status this result came from' },
  complete: { type: 'boolean', description: 'False when at least one job source could not be retrieved, so the ranking is incomplete' },
  storagePath: { type: 'string' },
note: { type: 'string' },
autoApplied: { type: 'object' },
delegatedTo: { type: 'array', items: { type: 'string' } },
generatedAt: { type: 'string', format: 'date-time' },
},
},
error: { type: 'string', description: 'Null on a clean run. Non-null on partial, failed and blocked runs, naming what could not be retrieved' },
present: {
type: 'array',
description: 'User-formatted blocks; a partial run always carries a block headed PARTIAL RESULT, and every non-empty run carries the ranked roles as links',
items: {
  type: 'object',
  properties: {
    id: { type: 'string' },
    title: { type: 'string' },
    kind: { type: 'string' },
    body: { type: 'string' },
    links: {
      type: 'array',
      description: 'The ranked roles, each linked to its posting',
      items: { type: 'object', properties: { label: { type: 'string' }, url: { type: 'string' }, detail: { type: 'string' } }, required: ['label', 'url'] },
    },
  },
  required: ['id', 'body'],
},
},
},
required: ['success', 'data'],
};

const JOB_DISCOVERY_FIT_RANKING = createDeclarativeCodeSkill({
id: 'career-job-discovery-fit-ranking',
name: 'Job Search & Fit Ranking',
description: 'Searches job boards for roles matching your profile, scores fit and ATS compatibility, and ranks opportunities by match quality. Reads the public Greenhouse, Ashby and Lever board APIs with no key required. Reports per-source status so empty results are never silent, and propagates upstream retrieval failures: a search where some job boards could not be reached is reported as status "partial" with a non-null error rather than as a clean ranking. Optionally auto-submits applications to roles meeting an auto-apply threshold via Apply to Jobs.',
persistenceEnvVar: 'CAREER_HOME',
inputSchema: JOB_DISCOVERY_FIT_RANKING_INPUT,
outputSchema: JOB_DISCOVERY_FIT_RANKING_OUTPUT,
triggers: [
{ kind: 'user', phrase_examples: ['Discover jobs', 'Find matching roles', 'Rank my job options'] },
],
tier: 'advise',
domainKnowledge: 'Career coaching, job search strategy, resume and cover letter optimization, interview preparation, compensation negotiation',
isSkill: true,
manifest: {
  configSchema: CAREER_WRAPPER_CONFIG_SCHEMA,
  actionLabel: 'Search & Rank',
  lowerOrderTools: ['career-job-discovery', 'career-application-execution']
},
handler: async function handler(input, ctx) {
    const configuredBoards = input.config && typeof input.config === 'object' ? input.config : {};

    // Fall back to the stored profile so a plain "run discovery" still searches with the
    // targets, filters and company list the user already saved in Profile Intake.
    let profile = {};
    profile = ctx.store.load('profilePath', {});
    const prefs = profile.preferences || {};
    const companies = (input.companies && input.companies.length) ? input.companies : ((input.targetCompanies && input.targetCompanies.length) ? input.targetCompanies : (prefs.targetCompanies || []));
    const jobTitles = (input.jobTitles && input.jobTitles.length) ? input.jobTitles : ((profile.targetTitles && profile.targetTitles.length) ? profile.targetTitles : (prefs.targetRoles || []));
    const locations = (input.locations && input.locations.length) ? input.locations : (prefs.locations || []);

    const discovery = await ctx.delegate('career-job-discovery', {
    queries: jobTitles,
    companies,
    boardTokens: configuredBoards.boardTokens || {},
    locations,
    minSalary: input.minSalary != null ? input.minSalary : prefs.minSalary,
    maxSalary: input.maxSalary != null ? input.maxSalary : prefs.maxSalary,
    maxPerBoard: configuredBoards.maxPerBoard,
    });

    // Upstream run statuses this skill must carry rather than flatten into "ok":
    //   ok       - every source answered. A clean pass, reported clean.
    //   no-match - every source answered and genuinely had nothing to show. A legitimate
    //              empty: not a failure, and not a partial either.
    //   partial  - some sources answered, others could not be retrieved or parsed at all.
    //   failed   - no source could be retrieved. A total failure.
    //   blocked  - there was nothing to search.
    // A 'failed' or 'blocked' discovery fails here too, and keeps its upstream status. A
    // 'partial' discovery is a real answer from the sources that did answer, so the
    // ranking it produced is kept rather than thrown away, but it is reported as status
    // 'partial' with a non-null error naming the unreachable sources and those sources
    // listed in data.failures, so a ranking built on missing boards can never be mistaken
    // for a clean pass over the whole market.
    const discoveryStatus = discovery && typeof discovery.status === 'string' ? discovery.status : null;
    const discoveryError = discovery && discovery.error ? String(discovery.error) : null;
    const discoveryData = discovery && discovery.data && typeof discovery.data === 'object' ? discovery.data : {};
    const discoveryFailures = Array.isArray(discoveryData.failures) ? discoveryData.failures : [];
    const listings = Array.isArray(discoveryData.listings) ? discoveryData.listings : [];

    function failureLines(list) {
    return list.map((f) => '  [FAILED] ' + ((f && f.board) || 'unknown source') + ' \u2014 ' + ((f && f.note) || 'this source could not be retrieved or read')).join('\n');
    }

    if (!discovery || discovery.success === false) {
    const status = discoveryStatus === 'blocked' ? 'blocked' : 'failed';
    const error = discoveryError || (status === 'blocked'
      ? 'Job discovery had nothing to search. Provide company names or job titles to search.'
      : 'Job discovery failed. No job board could be searched, so this run produced no ranking at all \u2014 it did not determine that no jobs exist.');
    const body = [
      status === 'blocked' ? 'JOB SEARCH HAD NOTHING TO SEARCH' : 'JOB SEARCH FAILED',
      status === 'blocked' ? '==========================' : '=============',
      '',
      error,
    ];
    if (discoveryFailures.length) body.push('', 'Sources attempted:', failureLines(discoveryFailures));

    return;
    }

    // Rank discovered listings against the terms this run actually searched for
    // before storing or returning. The role terms are passed through so the scorer
    // grades each listing against "Engineering Manager" rather than against whatever
    // happened to be saved on the profile, which is what made every result carry the
    // same rating.
    //
    // A listing whose title matches none of the searched roles is not a result for
    // this search, so it is held back rather than shown with a low score. career-rank
    // applies that floor by default whenever role terms were supplied; minRoleScore is
    // passed straight through, so callers can set it to 0 to see the raw discovery
    // output including off-target listings.
    const roleFloor = typeof input.minRoleScore === 'number' ? input.minRoleScore : (jobTitles.length ? 0.01 : 0);
    let rankResult = null;
    if (listings.length) {
    rankResult = await ctx.delegate('career-rank', { items: listings, jobTitles: jobTitles, minRoleScore: roleFloor });
    }
    const ranked = rankResult && rankResult.success && rankResult.data ? (Array.isArray(rankResult.data.ranked) ? rankResult.data.ranked : []) : [];
    const droppedOffTarget = rankResult && rankResult.data && Array.isArray(rankResult.data.droppedOffTarget) ? rankResult.data.droppedOffTarget : [];
    const roleQueries = rankResult && rankResult.data && Array.isArray(rankResult.data.roleQueries) ? rankResult.data.roleQueries : jobTitles;

    // Persist the ranked rows back into the shared listings file.
    //
    // career-job-discovery writes this file as an OBJECT carrying { listings,
    // byBoard, failures, ... }, not as a bare array. This block used to read it as
    // an array, so Array.isArray(existing) was false, merged started as [], and the
    // write replaced the whole file with only the ranked rows — destroying the
    // byBoard and failures ledger that the run-level outcome depends on. Read the
    // listings array out of whichever shape is on disk and write the object back.
    const existingListings = (function () {
    const parsed = ctx.store.load('listPath', null);
    if (!parsed) return [];
    // Tolerate both shapes: a bare array from an older write, and the current
    // object envelope.
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.listings)) return parsed.listings;
    return [];
    })();
    const merged = existingListings.slice();
    for (const r of ranked) {
    const idx = merged.findIndex((m) => m.id === r.id);
    if (idx >= 0) merged[idx] = Object.assign({}, merged[idx], r); else merged.push(r);
    }
    // Rewrite the same envelope discovery uses, carrying the discovery ledger
    // forward rather than dropping it.
    ctx.store.save('listPath', {
    listings: merged,
    total: merged.length,
    byBoard: discoveryData.byBoard || [],
    failures: discoveryFailures,
    failureCount: discoveryFailures.length,
    ranked: ranked.length,
    generatedAt: new Date().toISOString(),
    });

    let autoApplied = null;
    if (typeof input.autoApplyThreshold === 'number') {
    const qualifying = ranked.filter((job) => (job.score || 0) >= input.autoApplyThreshold);
    if (qualifying.length) {
    const applyRes = await ctx.delegate('career-application-execution', { listings: qualifying.map((job) => job.id || job.jobId), dryRun: input.dryRun !== false });
    autoApplied = applyRes && applyRes.success ? applyRes.data : { error: applyRes && applyRes.error ? applyRes.error : 'Auto-apply did not run' };
    } else {
    autoApplied = { note: 'No ranked jobs met the auto-apply threshold' };
    }
    }

    // The discovery run is only complete if no source it consulted was unreachable. A run
    // that retrieved every source it asked for is reported clean, whatever it found: a
    // genuine zero is an answer, not a degradation.
    const partialDiscovery = discoveryStatus === 'partial' || discoveryFailures.length > 0;
    // Discovery answered fine but every listing it returned was off-target for the
    // roles searched. That is a genuine "nothing matched", not a clean pass that
    // happened to rank nothing, and it must not be reported as a successful search.
    const allOffTarget = ranked.length === 0 && droppedOffTarget.length > 0;
    const runStatus = partialDiscovery ? 'partial' : (allOffTarget || discoveryStatus === 'no-match' ? 'no-match' : 'ok');
    const runError = partialDiscovery
    ? (discoveryError || (discoveryFailures.length + ' of the sources this search consulted could not be retrieved, so this ranking is not a complete answer about the job market: ' + discoveryFailures.map((f) => (f && f.board) || 'unknown source').join(', ') + '.'))
    : null;
    const partialNote = partialDiscovery
    ? 'PARTIAL RESULT. The ' + ranked.length + ' ranked role' + (ranked.length === 1 ? '' : 's') + ' below come only from the job sources that answered. ' + runError + ' Roles on the sources that could not be retrieved are missing from this ranking because they were never read, not because they do not exist.'
    : null;

    const baseNote = allOffTarget
      ? 'None of the ' + droppedOffTarget.length + ' discovered role' + (droppedOffTarget.length === 1 ? '' : 's') + ' matched ' +
        (roleQueries.length ? '"' + roleQueries.join('", "') + '"' : 'your target roles') +
        ' by title, so nothing is shown. The job boards answered, but every posting they returned was for a different role. Widen the role terms, or set minRoleScore to 0 to see everything that was discovered.'
      : (discoveryData.note || (ranked.length ? null : 'Discovery ran but returned no matching roles. Widen your filters or add more companies.'));
    const noteParts = [baseNote, partialNote].filter(Boolean);
    const note = noteParts.length ? noteParts.join(' ') : undefined;

    const presentBlocks = [];
    const summaryLines = [];
    summaryLines.push('Search & Fit Ranking');
    summaryLines.push('====================');
    summaryLines.push('');
    summaryLines.push('Ranked roles: ' + ranked.length + ' (from ' + (discoveryData.total || 0) + ' discovered listing' + ((discoveryData.total || 0) === 1 ? '' : 's') + ')');
    if (jobTitles.length) summaryLines.push('Titles searched: ' + jobTitles.join(', '));
    if (companies.length) summaryLines.push('Companies: ' + companies.join(', '));
    if (droppedOffTarget.length) {
    summaryLines.push('Not shown as matches: ' + droppedOffTarget.length + ' role' + (droppedOffTarget.length === 1 ? '' : 's') + ' whose title did not match' + (roleQueries.length ? ' "' + roleQueries.join('", "') + '"' : ' your target roles'));
    }
    presentBlocks.push({ id: 'summary', title: runStatus === 'partial' ? 'Partial Search Results' : (runStatus === 'no-match' ? 'No Matching Roles' : 'Search Results'), kind: 'text', body: summaryLines.join('\n') });

    // The ranked roles themselves, each linked to its posting. The summary line above says
    // how many roles were ranked; without the roles attached, that count is the whole of what
    // the user is shown, and a search result they cannot open is not a result. Emitted on
    // every non-empty run, whatever the status, so a partial run's roles are visible alongside
    // the warning about the sources that never answered.
    const RANKED_LINK_CAP = 200;
    function rankedLink(job) {
    if (!job) return null;
    const url = String(job.applyUrl || job.sourceUrl || '').trim();
    // http(s) only: these become anchors in the UI.
    if (!/^https?:\/\//i.test(url)) return null;
    const title = String(job.title || '').trim();
    if (!title) return null;
    const company = String(job.company || '').trim();
    const detail = [];
    if (company) detail.push(company);
    if (typeof job.score === 'number') detail.push('fit ' + job.score);
    if (job.location) detail.push(job.location);
    return { label: title, url: url, detail: detail.join(' · ') || undefined };
    }
    if (ranked.length) {
    const links = ranked.map(rankedLink).filter(Boolean);
    if (links.length) {
      const shown = links.slice(0, RANKED_LINK_CAP);
      presentBlocks.push({
        id: 'ranked-listings',
        title: 'Ranked roles (' + links.length + ')',
        kind: 'text',
        body: shown.length < links.length
          ? 'Showing the top ' + shown.length + ' of ' + links.length + ' ranked roles. The full set is in data.ranked.'
          : 'Every ranked role, linked to the posting. Each opens in a new tab.',
        links: shown,
      });
    }
    }

    if (partialDiscovery) {
    presentBlocks.push({
    id: 'partial',
    title: 'PARTIAL RESULT \u2014 ' + discoveryFailures.length + ' source' + (discoveryFailures.length === 1 ? '' : 's') + ' were never read',
    kind: 'text',
    body: [
    'PARTIAL RESULT. This ranking is not a complete answer about the job market.',
    '',
    runError,
    '',
    'Sources that could not be retrieved or read:',
    failureLines(discoveryFailures),
    ].join('\n'),
    });
    }
    return {
      success: true,
      status: runStatus,
      data: {
        ranked: ranked,
        total: ranked.length,
        // Carried through so a run that held listings back can be audited instead of
        // being indistinguishable from a run where those roles were never posted.
        droppedOffTarget: droppedOffTarget,
        offTarget: droppedOffTarget.length,
        roleQueries: roleQueries,
        roleFloor: roleFloor,
        discoveryData: discoveryData,
        partialDiscovery: partialDiscovery,
      },
      error: runError || null,
      present: presentBlocks,
    };
  }
});
JOB_DISCOVERY_FIT_RANKING.configSchema = CAREER_WRAPPER_CONFIG_SCHEMA;
JOB_DISCOVERY_FIT_RANKING.configSchema = JOB_DISCOVERY_FIT_RANKING.manifest.configSchema as SchemaRecord;

export { JOB_DISCOVERY_FIT_RANKING };
