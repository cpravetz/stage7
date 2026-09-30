import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';
import { careerResultSchema } from './career-contract';
import { CAREER_RUNTIME_SOURCE, CAREER_HELPERS_SOURCE, CAREER_JOB_SHAPE_SOURCE } from './career-runtime-source';
import { CAREER_ATS_PROVIDERS_SOURCE } from './career-ats-providers-source';
import { CAREER_FEED_PROVIDERS_SOURCE } from './career-feed-providers-source';
import { CAREER_COLLECTOR_SOURCE } from './career-collector-source';
import { CAREER_PORTAL_REGISTRY_SOURCE } from './career-portal-registry-source';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-job-discovery: finds real jobs and returns normalized listings.
//
// SOURCES, in the order they are consulted:
//
//   1. Company-agnostic public feeds (RemoteOK, Remotive, Arbeitnow, Jobicy,
//      We Work Remotely, Himalayas). Public, no-auth, structured. These need
//      no company name, so a search with nothing but a role works. This is the
//      tier that makes discovery possible without a target company.
//   2. Applicant Tracking Systems (Greenhouse, Lever, Ashby, Workday, iCIMS,
//      SmartRecruiters, BambooHR, Breezy, Jobvite, SuccessFactors, Oracle,
//      Recruitee, Teamtailor, Workable, Phenom). Also public, no-auth and
//      structured. These need a company, supplied by the caller, by
//      portals.json, or by probing the named company against each provider.
//   3. General search boards (LinkedIn, Wellfound, Indeed, Glassdoor, Monster).
//      These are HTML pages behind bot protection. They are consulted last, and
//      they are reported honestly: most are permanently blocked from a
//      datacenter IP and no amount of parsing changes that.
//
// The previous version consulted only tier 2 and tier 3, and gated tier 2
// behind the caller supplying company names. A query-only run therefore
// degraded entirely onto the blocked boards and returned nothing.
//
// Every run reports a per-source status derived from what actually happened:
//
//   ok       - pages read AND listings extracted
//   no-match - pages read, structure recognised, genuinely nothing matched.
//               A real answer from a source we did read, not a failure.
//   error    - the source could NOT be retrieved, or was retrieved but its
//               structure could NOT be recognised. There is no offline: an
//               inability to retrieve is a failure inside this system, so it
//               surfaces through success / status / error rather than riding
//               along as a caveat on a passing run.
//
// A source is never reported ok when nothing was extracted, and a retrieval
// failure is never reported as no-match.
//
// TARGETING: with no queries and no companies, the skill derives its search
// terms from the stored profile — target roles, or the headline parsed out of
// the resume text. That is what lets "find roles that fit my resume" work
// without the user restating their own job title.
//
// Returns { success, status, data: { listings, total, byBoard, failures, ... }, error }
//
// ---------------------------------------------------------------- assembly
//
// The skill runs as one JavaScript program in a spawned `node` child, so the
// source is assembled from fragments rather than imported as modules. Each
// fragment is plain source text in its own file; they are concatenated in
// dependency order (helpers, then providers, then engine, then entrypoint).
const CAREER_JOB_DISCOVERY_MAIN = String.raw`
// The general-board scrapers, declared here rather than after the
// orchestration block: runGeneralBoards is invoked from that block, and a const
// used before its declaration is a temporal-dead-zone ReferenceError.
const GENERAL_BOARD_FNS = [searchLinkedIn, searchWellfound];
const GENERAL_BOARD_NAMES = ['LinkedIn', 'Wellfound'];

// ---------------------------------------------------------------- orchestrate

const companies = asList(input.companies || input.targetCompanies || input.company);
const locations = asList(input.locations);
const explicitTokens = input.boardTokens && typeof input.boardTokens === 'object' ? input.boardTokens : {};
const maxPerBoard = Math.max(1, numOr(input.maxPerBoard, 50));
const enrich = input.enrichDescriptions !== false;
const minSalary = numOr(input.minSalary, 0);
const maxSalary = numOr(input.maxSalary, Infinity);
const wantsRemote = locations.some(function (l) { return /remote/i.test(l); });
const profileId = input.profileId || 'default';
const maxPages = Math.max(1, numOr(input.maxPages, 5));

const profile = loadCandidateProfile();

// ---- resolve the search criteria, falling back to the stored profile -------
//
// This is the fix for "discover jobs regardless of company": a run with no
// companies still searches, because the public feed tier does not need one. A
// run with no queries either uses the profile's target roles or parses a
// headline out of the resume.
let queries = asList(input.queries || input.query);
const targeting = [];
if (!queries.length) {
  const derived = deriveQueriesFromProfile(profile);
  if (derived.queries.length) {
    queries = derived.queries;
    targeting.push('Search terms taken from ' + derived.from + ': ' + queries.join(', '));
  }
}

// Companies: caller first, then profile preferences, then resume employers.
let companyNames = companies;
if (!companyNames.length) {
  const derivedCompanies = deriveCompaniesFromProfile(profile);
  if (derivedCompanies.length) {
    companyNames = derivedCompanies.slice(0, 25);
    targeting.push('Companies taken from the stored profile (' + companyNames.length + '): ' + companyNames.slice(0, 8).join(', ') + (companyNames.length > 8 ? ', …' : ''));
  }
}

const portalConfig = loadPortalConfig();
if (portalConfig.warning) targeting.push(portalConfig.warning);
else if (portalConfig.tracked_companies.length || portalConfig.job_boards.length) {
  targeting.push('Portal config read from ' + portalConfig.source + ' (' + portalConfig.tracked_companies.length + ' tracked companies, ' + portalConfig.job_boards.length + ' job boards)');
} else {
  targeting.push('No portals.json found; using the built-in public feed sources');
}

const wantsFeeds = input.usePublicFeeds !== false;
const wantsAts = input.useAts !== false;
const wantsGeneral = input.useGeneralBoards === true;

// A pinned board token or a configured portal is itself a search criterion: it
// names a source to read whether or not the caller named any query or company.
const pinnedBoardTokens = [];
for (const [ats, tokens] of Object.entries(explicitTokens)) {
  for (const t of asList(tokens)) pinnedBoardTokens.push({ name: t, company: t, token: t, provider: ats, pinned: true });
}
const configTrackedCompanies = portalConfig.tracked_companies.map(normalizeCompanyEntry).filter(Boolean);

if (!queries.length && !companyNames.length && !pinnedBoardTokens.length && !configTrackedCompanies.length) {
  // Nothing to search and nothing to derive. This is a blocked run, and saying
  // so is the honest answer \u2014 not an empty result.
  console.log(JSON.stringify({
    success: false,
    status: 'blocked',
    data: null,
    error: 'Nothing to search. Supply "queries" (job titles), or "companies", or configure employers in ' + path.join(baseDir, 'portals.json') + ', or set up a candidate profile at ' + path.join(baseDir, 'profiles', profileId + '.json') + ' with preferences.targetRoles and resume text so the search can be derived from it.',
    present: [{
      id: 'discovery-blocked', title: 'Nothing to search', kind: 'text',
      body: 'Discovery could not run because there was no search criterion and nothing in the stored profile to derive one from.\n\nProvide any one of:\n  - queries: job titles to search for\n  - companies: employers to read their ATS board\n  - tracked_companies in ' + path.join(baseDir, 'portals.json') + '\n  - a profile at ' + path.join(baseDir, 'profiles', profileId + '.json') + ' with preferences.targetRoles and resume text\n\nCompany-agnostic public feeds (RemoteOK, Remotive, Arbeitnow, Jobicy, We Work Remotely, Himalayas) need only a role, not a company.',
    }],
  }));
  return;
}

// ---------------------------------------------------------------- task list

const tasks = [];

// Tier 1: company-agnostic public feeds. Enabled by default because this is
// the only tier that works with no company, which is the common case.
if (wantsFeeds) {
  const configuredBoards = portalConfig.job_boards.map(normalizeBoardEntry).filter(Boolean);
  const wantedIds = configuredBoards.length ? configuredBoards.map(function (b) { return b.id; }) : FEED_PROVIDER_IDS;
  const configById = {};
  for (const b of configuredBoards) configById[b.id] = b;
  for (const id of wantedIds) {
    const feed = FEED_PROVIDERS[id];
    if (!feed) continue;
    tasks.push({
      label: 'feed:' + id,
      run: async function () { return await collectFeed(feed, { maxPages: maxPages, maxPerBoard: maxPerBoard }); },
    });
  }
}

// Tier 2: ATS providers.
//
// Three ways an entry arrives, in priority order:
//   a) explicit boardTokens pinned by the caller
//   b) entries from portals.json
//   c) a probe of each named company against every provider
//
// (c) is no longer gated behind the caller supplying companies: with no
// companies, the ATS tier simply contributes nothing and the feed tier carries
// the run. The previous gate made a query-only run skip ATS entirely.
const pinnedEntries = pinnedBoardTokens;

const configEntries = configTrackedCompanies;

if (wantsAts) {
  for (const entry of pinnedEntries.concat(configEntries)) {
    const resolved = resolveProviderFor(entry);
    if (!resolved.provider) {
      tasks.push({
        label: 'ats:' + (entry.name || entry.token) + ':uncovered',
        run: async function () {
          return { jobs: [], status: 'error', count: 0, pages: 0, note: resolved.reason + '. Add an explicit "provider" field to this entry in portals.json.' };
        },
      });
      continue;
    }
    const provider = resolved.provider;
    tasks.push({
      label: 'ats:' + provider.id + ':' + (entry.name || entry.token),
      run: async function () { return await collectAts(provider, entry, { maxPerBoard: maxPerBoard, enrich: enrich, pinned: entry.pinned === true, detailLimit: numOr(input.detailLimit, 20) }); },
    });
  }
}

// Tier 2c: probe each named company against every provider. Each provider is
// tried and the first that yields listings wins for that company, so a company
// on Greenhouse does not also get probed against Lever.
if (wantsAts && companyNames.length) {
  const PROBE_ORDER = ['greenhouse', 'ashby', 'lever', 'workday', 'icims', 'smartrecruiters', 'bamboohr', 'breezy', 'recruitee', 'teamtailor', 'successfactors', 'oracle'];
  tasks.push({
    label: 'ats-probe:' + companyNames.length + '-compan' + (companyNames.length === 1 ? 'y' : 'ies'),
    run: async function () {
      const jobs = [];
      const ledger = [];
      let covered = 0;
      for (const company of companyNames) {
        const token = slug(company);
        if (!token) continue;
        let found = false;
        for (const providerId of PROBE_ORDER) {
          const provider = ATS_PROVIDERS[providerId];
          if (!provider) continue;
          const entry = { name: company, company: company, token: token };
          let outcome;
          try {
            outcome = await collectAts(provider, entry, { maxPerBoard: Math.min(maxPerBoard, 25), enrich: false, probeOnly: true });
          } catch (e) {
            outcome = { jobs: [], status: 'error', count: 0, pages: 0, note: provider.id + ': probe raised ' + (e && e.message ? e.message : String(e)) };
          }
          if (outcome.jobs && outcome.jobs.length) {
            for (const j of outcome.jobs) jobs.push(j);
            ledger.push({ board: 'ats:' + provider.id + ':' + company, status: 'ok', count: outcome.count, note: outcome.note });
            found = true;
            covered++;
            break;
          }
          // A 404 means "not on this ATS", which is a real answer for a probe
          // and must not be reported as a retrieval failure.
          if (outcome.note && outcome.status === 'no-match') {
            ledger.push({ board: 'ats:' + provider.id + ':' + company, status: 'no-match', count: 0, note: outcome.note });
          }
        }
        if (!found) {
          ledger.push({
            board: 'ats:none:' + company,
            status: 'no-match',
            count: 0,
            note: 'None of the ' + PROBE_ORDER.length + ' known ATS platforms published a board for "' + company + '". This says nothing about whether the company is hiring \u2014 add its careers_url to portals.json to read it directly.',
          });
        }
      }
      return {
        jobs: jobs,
        status: jobs.length ? 'ok' : 'no-match',
        count: jobs.length,
        note: 'Probed ' + companyNames.length + ' named compan' + (companyNames.length === 1 ? 'y' : 'ies') + ' against ' + PROBE_ORDER.length + ' ATS platforms; ' + covered + ' returned a board.',
        ledger: ledger,
      };
    },
  });
}

// ---------------------------------------------------------------- general boards

const generalBoards = wantsGeneral ? await runGeneralBoards(queries, locations.length ? locations[0] : '') : { jobs: [], ledger: [] };

const ranCollectors = await runCollectors(tasks, Math.max(1, numOr(input.collectorConcurrency, 4)));

// Merge in the per-source detail each collector may have produced (the ATS
// probe reports one aggregate entry plus a sub-ledger per company).
let byBoard = generalBoards.ledger || [];
for (const entry of ranCollectors.ledger) {
  byBoard.push({ board: entry.board, status: entry.status, count: entry.count, note: entry.note });
  for (const sub of entry.subLedger || []) byBoard.push(sub);
}
let listings = ranCollectors.jobs.concat(generalBoards.jobs || []);

// ---------------------------------------------------------------- normalize

const seenIds = new Set();
listings = listings.filter(function (l) {
  if (!isUsableJob(l)) return false;
  if (seenIds.has(l.id)) return false;
  seenIds.add(l.id);
  return true;
});

// Salary filter, only where the source actually published salary. A listing
// with no salary data is not filtered out \u2014 it is unknown, not out of range.
listings = listings.filter(function (l) {
  if (!l.salary || l.salary.min == null) return true;
  if (l.salary.max != null && l.salary.max < minSalary) return false;
  if (l.salary.min > maxSalary) return false;
  return true;
});

if (wantsRemote) {
  listings = listings.filter(function (l) { return l.remote || /remote/i.test(l.location || ''); });
}

// Query filter. A term must match on a word boundary rather than as a
// substring: "ai" otherwise matches "maintain", and one common substring match
// is what silently admitted every unrelated listing.
if (queries.length) {
  const terms = [];
  for (const q of queries) {
    for (const t of roleTokens(q)) terms.push(t);
  }
  const uniqueTerms = [...new Set(terms)];
  if (uniqueTerms.length) {
    // Whole-word matching, not substring. "ai" as a substring also matches
    // "maintain" and "email", which is how an unrelated listing gets admitted.
    // Comparing tokens avoids building a RegExp from a variable, which the
    // enclosing template literal could corrupt.
    listings = listings.filter(function (l) {
      const hay = [l.title, l.company, l.department, l.employmentType, l.location, (l.description || '').slice(0, 2000)]
        .filter(Boolean).join(' ').toLowerCase();
      const tokens = hay.split(/[^a-z0-9+#.]+/).filter(Boolean);
      return uniqueTerms.some(function (t) {
        for (const token of tokens) {
          // Token-prefix, not equality: "engineering" is an engineering role,
          // and titles are full of the derived forms (engineering manager,
          // engineer, engineers). Equality dropped every one of them. This is
          // still not a substring test, so "ai" cannot match "maintain".
          if (token.startsWith(t)) return true;
        }
        return false;
      });
    });
  }
}

// Deduplicate across sources on title+company, keeping the row with the most
// information (the one with a description and a salary) and recording every
// source it was seen on.
const byKey = new Map();
for (const l of listings) {
  const key = (l.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + '|' + (l.company || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const existing = byKey.get(key);
  if (!existing) {
    byKey.set(key, Object.assign({}, l, { sources: [l.source] }));
    continue;
  }
  const sources = (existing.sources || []).concat(l.source ? [l.source] : []);
  const better = (l.description && l.description.length > (existing.description || '').length) || (!existing.salary && l.salary) ? l : existing;
  byKey.set(key, Object.assign({}, better, { sources: [...new Set(sources)] }));
}
listings = [...byKey.values()];
listings.sort(function (a, b) {
  const sa = a.salary && a.salary.max ? a.salary.max : 0;
  const sb = b.salary && b.salary.max ? b.salary.max : 0;
  if (sa !== sb) return sb - sa;
  return (a.title || '').localeCompare(b.title || '');
});

const okBoards = byBoard.filter(function (b) { return b.status === 'ok'; });
const noMatchBoards = byBoard.filter(function (b) { return b.status === 'no-match'; });
// Sources that could not be retrieved, or could not be read once retrieved.
// Every one of these is a failure of this system. They are never folded into
// "no matches" and never softened into an advisory on a passing run.
const failures = byBoard.filter(function (b) { return b.status === 'error'; });
const failureSummary = failures.length
  ? failures.length + ' of ' + byBoard.length + ' source' + (byBoard.length === 1 ? '' : 's') +
    ' could not be retrieved: ' + failures.map(function (b) { return b.board; }).join(', ') +
    '. Those sources were never read, so this run is PARTIAL \u2014 it is not a complete answer about the job market.'
  : null;

// ---------------------------------------------------------------- persist
//
// The stored file is an OBJECT carrying the listings AND the run ledger.
// Consumers must read .listings. Writing a bare array here previously
// destroyed the byBoard / failures ledger on the next run that wrote to it.
const storagePath = path.join(baseDir, 'listings', 'default.json');
fs.mkdirSync(path.dirname(storagePath), { recursive: true });
fs.writeFileSync(storagePath, JSON.stringify({
  listings: listings,
  total: listings.length,
  byBoard: byBoard,
  failures: failures.map(function (b) { return { board: b.board, status: b.status, note: b.note }; }),
  failureCount: failures.length,
  generatedAt: new Date().toISOString(),
}, null, 2));

// ---------------------------------------------------------------- outcome

const consulted = byBoard.length;
const answered = okBoards.length + noMatchBoards.length;
let runSuccess = true;
let runStatus = 'ok';
let runError = null;

if (consulted === 0) {
  runSuccess = false;
  runStatus = 'failed';
  runError = 'JOB DISCOVERY FAILED. No source was consulted: every source this build knows about was disabled by configuration.';
} else if (answered === 0) {
  runSuccess = false;
  runStatus = 'failed';
  runError = 'JOB DISCOVERY FAILED. All ' + consulted + ' source' + (consulted === 1 ? '' : 's') +
    ' this run tried could not be retrieved or read: ' + failures.map(function (b) { return b.board; }).join(', ') +
    '. No job board was successfully searched, so this run produced no answer at all about the job market \u2014 it did not determine that no jobs exist. Every failure is listed under "Retrieval failures" below.';
} else if (failures.length > 0) {
  runStatus = 'partial';
  runError = failureSummary;
} else if (!listings.length) {
  runStatus = 'no-match';
}

const present = [];

// Sources consulted, and how.
present.push({
  id: 'discovery-summary',
  title: 'Search summary',
  kind: 'text',
  body: [
    'Sources consulted: ' + consulted + ' (' + okBoards.length + ' answered with listings, ' + noMatchBoards.length + ' answered with none, ' + failures.length + ' could not be read)',
    queries.length ? 'Titles searched: ' + queries.join(', ') : 'Titles searched: none (filtered by company only)',
    companyNames.length ? 'Companies: ' + companyNames.join(', ') : 'Companies: none — searched company-agnostic public feeds',
    'Listings found: ' + listings.length,
  ].join('\n'),
});

// Every posting, not just the number of them.
//
// The summary above states how many listings were found; on its own that number is not
// a result the user can do anything with. Each listing is emitted as a link to the
// posting it came from, so the postings themselves are the output rather than a tally
// of postings the user is then expected to go and find elsewhere.
const LISTING_LINK_CAP = 200;

function listingLink(job) {
  if (!job) return null;
  const url = String(job.applyUrl || job.sourceUrl || '').trim();
  // Only http(s). A link is rendered as an anchor, so a javascript: or data: URL from a
  // scraped board would be an injection vector, not a posting.
  if (!/^https?:\/\//i.test(url)) return null;
  const title = String(job.title || '').trim();
  if (!title) return null;
  const company = String(job.company || '').trim();
  const detail = [job.location, job.source].filter(Boolean).join(' · ');
  return { label: company ? title + ' — ' + company : title, url: url, detail: detail || undefined };
}

if (listings.length) {
  // Distinct id from the zero-result block further down, which only ever runs when
  // there are no listings at all, so the two can never both be present.
  const links = listings.map(listingLink).filter(Boolean);
  if (links.length) {
    const shown = links.slice(0, LISTING_LINK_CAP);
    present.push({
      id: 'listings',
      title: 'Job postings (' + links.length + ')',
      kind: 'text',
      body: shown.length < links.length
        ? 'Showing the first ' + shown.length + ' of ' + links.length + ' postings. The full set is in data.listings.'
        : 'Every posting this search found, linked to the posting itself. Each opens in a new tab.',
      links: shown,
    });
  }
}


// How the search criteria were arrived at. The user asked for searches derived
// from their resume; this says explicitly when that happened.
if (targeting.length) {
  present.push({ id: 'discovery-targeting', title: 'How this search was targeted', kind: 'text', body: targeting.join('\n') });
}

if (okBoards.length) {
  present.push({
    id: 'sources', title: 'Sources that returned listings', kind: 'text',
    body: okBoards.map(function (b) { return '  [OK] ' + b.board + ' \u2014 ' + b.count + ' listing' + (b.count === 1 ? '' : 's') + (b.note ? '\n       ' + b.note : ''); }).join('\n'),
  });
}
if (noMatchBoards.length) {
  present.push({
    id: 'no-match', title: 'Sources read that had no matching listings', kind: 'text',
    body: noMatchBoards.map(function (b) { return '  [EMPTY] ' + b.board + (b.note ? ' \u2014 ' + b.note : ''); }).join('\n'),
  });
}
if (failures.length) {
  present.push({
    id: 'errors', title: 'RETRIEVAL FAILURE: ' + failures.length + ' source' + (failures.length === 1 ? '' : 's') + ' could not be retrieved or read', kind: 'text',
    body: failures.map(function (b) { return '  [FAILED] ' + b.board + ' \u2014 ' + (b.note || ''); }).join('\n\n'),
  });
}

if (!listings.length && answered > 0) {
  const note = 'No listings matched. All ' + noMatchBoards.length + ' board' + (noMatchBoards.length === 1 ? '' : 's') +
    ' checked were conclusively consulted and found no matches for these filters.';
  // Distinct id from the per-source no-match block above, which already owns
  // 'no-match'; a caller keying on the id must not get the wrong one.
  present.push({ id: 'listings', title: 'No matching listings', kind: 'text', body: note });
}

if (runError) {
  present.unshift({ id: 'failure', title: runStatus === 'partial' ? 'PARTIAL RESULT' : (runStatus === 'failed' ? 'JOB DISCOVERY FAILED' : 'Discovery could not run'), kind: 'text', body: runError });
}

console.log(JSON.stringify({
  success: runSuccess,
  status: runStatus,
  data: {
    listings: listings,
    total: listings.length,
    byBoard: byBoard,
    failures: failures.map(function (b) { return { board: b.board, status: b.status, note: b.note }; }),
    failureCount: failures.length,
    targetedFrom: targeting.join('; ') || null,
    queries: queries,
    companies: companyNames,
    // A one-line run summary. career-job-discovery-fit-ranking reads this to
    // explain a run, so it carries the outcome rather than only the counts.
    note: runError || (listings.length
      ? 'Found ' + listings.length + ' listing' + (listings.length === 1 ? '' : 's') + ' across ' + okBoards.length + ' source' + (okBoards.length === 1 ? '' : 's') + ' that answered (' + consulted + ' consulted)'
      : (answered > 0
        ? 'Read ' + answered + ' source' + (answered === 1 ? '' : 's') + ' successfully and found no matches'
        : 'Discovery ran but returned no matching roles')),
  },
  error: runError,
  present: present,
}));

// ---------------------------------------------------------------- general boards
//
// HTML search pages behind bot protection. Consulted only when explicitly
// requested (useGeneralBoards), because most of them are permanently blocked
// from a datacenter IP and the honest report of that block is more noise than
// signal on an every-run basis.
//
// The parser for each is deliberately stricter than it was: a page with no
// listing signal at all is a broken source, not an empty board. The previous
// shellRe included <article, which matches almost any page, so a total markup
// change reported itself as "no matching roles".
async function runGeneralBoards(queryList, location) {
  const jobs = [];
  const attempts = {};
  for (const name of GENERAL_BOARD_NAMES) attempts[name] = [];
  if (!queryList.length) return { jobs: jobs, ledger: [] };

  for (const q of queryList) {
    let outcomes;
    try {
      outcomes = await Promise.all(GENERAL_BOARD_FNS.map(function (fn) { return fn(q, location); }));
    } catch (e) {
      for (const name of GENERAL_BOARD_NAMES) attempts[name].push({ fetched: false, structure: false, count: 0, status: 0 });
      continue;
    }
    GENERAL_BOARD_NAMES.forEach(function (name, i) {
      const o = outcomes[i] || { jobs: [], fetched: false, structure: false, status: 0 };
      attempts[name].push({ fetched: !!o.fetched, structure: !!o.structure, count: (o.jobs || []).length, status: o.status });
      for (const j of o.jobs || []) jobs.push(j);
    });
  }

  const ledger = GENERAL_BOARD_NAMES.map(function (name) {
    const summary = summarizeBoard(attempts[name] || [], name);
    return { board: 'general-board:' + name, status: summary.status, count: summary.count, note: 'Scraped from ' + name + ' public search: ' + summary.reason };
  });
  return { jobs: jobs, ledger: ledger };
}

// Sums the per-query attempts of one board into a single honest status.
//   ok       - at least one listing was actually extracted
//   no-match - every reachable page looked structurally normal (a listing
//              signal was present) but nothing matched. A real answer.
//   error    - the request failed, or the page was fetched but no listing
//              signal was recognised at all. The source was not read.
function summarizeBoard(attempts, boardName) {
  const total = attempts.reduce(function (n, a) { return n + (a.count || 0); }, 0);
  if (total > 0) return { status: 'ok', count: total, reason: 'extracted ' + total + ' listing' + (total === 1 ? '' : 's') + ' from the fetched pages' };
  const reachable = attempts.filter(function (a) { return a.fetched; });
  if (!attempts.length || reachable.length === 0) {
    const statuses = attempts.map(function (a) { return a.status; }).filter(function (s) { return s != null; });
    // A 4xx is a bot wall only when the board actually answered and refused us.
    // 404 is different: the URL does not exist at that shape, so the board
    // never received a question. Both are retrieval failures, but calling a
    // 404 "blocked" is a false and permanent diagnosis.
    const wallCodes = [...new Set(statuses.filter(function (s) { return s >= 400 && s < 500 && s !== 404; }))];
    const serverCodes = [...new Set(statuses.filter(function (s) { return s >= 500; }))];
    const goneCodes = [...new Set(statuses.filter(function (s) { return s === 404; }))];
    const hasNetwork = statuses.some(function (s) { return s === 0; });
    let reason;
    if (wallCodes.length) {
      reason = boardName + ' blocked us (HTTP ' + wallCodes.join(', ') + '). This board refuses automated requests from this network and no amount of parsing will change that.';
    } else if (serverCodes.length) {
      reason = boardName + ' server error (HTTP ' + serverCodes.join(', ') + ')';
    } else if (goneCodes.length) {
      reason = boardName + ' search endpoint returned HTTP ' + goneCodes.join(', ') + ' \u2014 that board URL no longer exists, so no question was ever asked of it';
    } else if (hasNetwork) {
      reason = boardName + ' network failure';
    } else {
      reason = 'request failed for all ' + attempts.length + ' quer' + (attempts.length === 1 ? 'y' : 'ies');
    }
    return { status: 'error', count: 0, reason: reason };
  }
  const shaped = reachable.filter(function (a) { return a.structure; });
  if (shaped.length === 0) {
    return { status: 'error', count: 0, reason: 'fetched ' + reachable.length + ' of ' + attempts.length + ' page(s) but recognised no job-card markup at all \u2014 the layout has probably changed, so this source could not be read' };
  }
  return { status: 'no-match', count: 0, reason: 'fetched ' + reachable.length + ' of ' + attempts.length + ' page(s), job-card markup present, but nothing matched the query filters' };
}

// --- individual board scrapers ---------------------------------------------
//
// Only the two that have ever returned real listings from a server-side fetch
// are kept. Indeed, Glassdoor and Monster are dropped from the default set:
// they are permanently blocked at the network layer from a datacenter IP, and
// the honest report of a permanent block on every run is noise, not signal.
// They remain available through the ATS/public-feed tiers.

// LinkedIn serves a fully server-rendered results list; this is the one general
// board that reliably works without a browser.
async function searchLinkedIn(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://www.linkedin.com/jobs/search?keywords=' + q + (loc ? '&location=' + loc : '') + '&f_TPR=r604800';
  const res = await fetchHtml(url);
  if (!res.ok) return { jobs: [], fetched: false, structure: false, status: res.status };
  const html = res.data;
  const jobs = [];
  const cards = html.split('data-entity-urn="urn:li:jobPosting:');
  for (let i = 1; i < cards.length && jobs.length < 20; i++) {
    const card = cards[i];
    const idMatch = card.match(/^([0-9]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];
    const titleMatch = card.match(/base-search-card__title"[^>]*>([^<]+)</);
    const companyMatch = card.match(/base-search-card__subtitle"[^>]*>([\s\S]*?)<\/h4>/);
    const locationMatch = card.match(/job-search-card__location"[^>]*>([^<]+)</);
    const dateMatch = card.match(/job-search-card__listdate"[^>]*datetime="([^"]+)"/);
    const urlMatch = card.match(/base-card__full-link"[^>]*href="([^"]+)"/);
    const company = companyMatch ? stripHtml(companyMatch[1].replace(/<a[^>]*>/g, '').replace(/<\/a>/g, '')) : '';
    const job = makeJob({
      id: 'linkedin_' + id,
      title: titleMatch ? stripHtml(titleMatch[1]) : '',
      company: company,
      location: locationMatch ? stripHtml(locationMatch[1]) : '',
      applyUrl: urlMatch ? decodeEntities(urlMatch[1]) : 'https://www.linkedin.com/jobs/view/' + id,
      source: 'linkedin',
      sourceUrl: 'https://www.linkedin.com/jobs/search',
      postedAt: dateMatch ? dateMatch[1] : null,
    });
    if (isUsableJob(job)) jobs.push(job);
  }
  // The listing signal is the posting URN itself, which is specific to a
  // populated results page. No URNs means we are not looking at markup we
  // understand.
  const signal = /data-entity-urn="urn:li:jobPosting:[^"]*"|base-search-card__title|jobs-search__results-list/i;
  return { jobs: jobs, fetched: true, structure: signal.test(html), status: res.status };
}

// Wellfound renders its results client-side and ignores ?query=, so it is kept
// only as a best-effort pass and reports honestly when it cannot be read.
async function searchWellfound(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://wellfound.com/jobs?query=' + q + (loc ? '&location=' + loc : '') + '&sort_by=recent';
  const res = await fetchHtml(url);
  if (!res.ok) return { jobs: [], fetched: false, structure: false, status: res.status };
  const html = res.data;
  const jobs = [];
  // Anchor to the job detail path shape rather than to a class substring: a
  // class match on "job" also matches navigation links.
  const linkRe = /<a[^>]+href="([^"]*\/jobs\/[0-9a-f][^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(html)) && jobs.length < 20) {
    const href = decodeEntities(m[1]);
    const snippet = stripHtml(m[2] || '');
    if (!snippet) continue;
    // Wellfound's card is "Title \n Company \n Location", which arrives as
    // separate block elements; stripHtml collapses them, so take the first two
    // sentences instead.
    const parts = snippet.split(/(?<=[a-z0-9)])\.\s+|\s+\|\s+/).filter(Boolean);
    const title = parts[0] || '';
    const company = parts[1] || '';
    const loc2 = parts.slice(2).join(', ');
    const job = makeJob({
      id: 'wellfound_' + stableId('wf', [href, title, company]),
      title: title,
      company: company,
      location: loc2,
      applyUrl: href.startsWith('http') ? href : 'https://wellfound.com' + href,
      source: 'wellfound',
      sourceUrl: 'https://wellfound.com/jobs',
      postedAt: null,
    });
    if (isUsableJob(job)) jobs.push(job);
  }
  const signal = /styles__card|styles__job|jobPosting|StartupsList/i;
  return { jobs: jobs, fetched: true, structure: signal.test(html), status: res.status };
}

`;

const CAREER_JOB_DISCOVERY_SOURCE =
  '0; (async () => {\n' +
  'const input = typeof __tool_input !== \'undefined\' ? __tool_input : {};\n' +
  'const fs = require(\'fs\');\n' +
  'const path = require(\'path\');\n' +
  'const baseDir = process.env.CAREER_HOME || \'/tmp/career\';\n' +
  CAREER_HELPERS_SOURCE +
  CAREER_RUNTIME_SOURCE +
  CAREER_JOB_SHAPE_SOURCE +
  CAREER_ATS_PROVIDERS_SOURCE +
  CAREER_FEED_PROVIDERS_SOURCE +
  CAREER_PORTAL_REGISTRY_SOURCE +
  CAREER_COLLECTOR_SOURCE +
  CAREER_JOB_DISCOVERY_MAIN +
  '\n})();';

const CAREER_JOB_DISCOVERY_INPUT = {
  type: 'object',
  properties: {
    queries: {
      ...SchemaProps.stringArray({ description: 'Job titles to search for, e.g. ["Chief Product Officer"]. Derived from the stored profile (target roles, or a headline parsed from the resume) when omitted.' }),
    },
    companies: {
      ...SchemaProps.stringArray({ description: 'Employers to read directly. Each is probed against every known ATS platform. Derived from the stored profile when omitted.' }),
    },
    locations: { ...SchemaProps.stringArray({ description: 'Preferred locations. Include "remote" to keep remote roles only.' }) },
    boardTokens: {
      type: 'object',
      description: 'Pin specific ATS board tokens, e.g. { "greenhouse": ["stripe"], "workday": ["acme"] }',
      properties: {
        greenhouse: { type: 'array', items: { type: 'string' } },
        lever: { type: 'array', items: { type: 'string' } },
        ashby: { type: 'array', items: { type: 'string' } },
      },
    },
    profileId: { ...SchemaProps.text({ description: 'Candidate profile to read for derived targeting. Defaults to "default".' }) },
    maxPerBoard: { ...SchemaProps.integer({ description: 'Maximum listings to keep per source.', default: 50 }) },
    maxPages: { ...SchemaProps.integer({ description: 'Maximum pages to read per paginating source.', default: 5 }) },
    detailLimit: { ...SchemaProps.integer({ description: 'Maximum per-posting detail fetches per source when enriching descriptions.', default: 20 }) },
    enrichDescriptions: { ...SchemaProps.boolean({ description: 'Fetch descriptions for sources whose list payload omits them. Default true.', default: true }) },
    minSalary: { ...SchemaProps.number({ description: 'Drop listings whose maximum salary is below this.' }) },
    maxSalary: { ...SchemaProps.number({ description: 'Drop listings whose minimum salary is above this.' }) },
    usePublicFeeds: { ...SchemaProps.boolean({ description: 'Consult the company-agnostic public feeds. Default true; these are the only tier that works without a company.', default: true }) },
    useAts: { ...SchemaProps.boolean({ description: 'Probe ATS platforms for named companies and read configured portals. Default true.', default: true }) },
    useGeneralBoards: { ...SchemaProps.boolean({ description: 'Also consult HTML job boards (LinkedIn, Wellfound). Default false: they are mostly blocked from a datacenter IP and add a permanent failure to every run.', default: false }) },
    collectorConcurrency: { ...SchemaProps.integer({ description: 'How many sources to read concurrently.', default: 4 }) },
    interRequestDelayMs: { ...SchemaProps.integer({ description: 'Delay between requests to the same source, for rate-limited hosts.' }) },
    requestTimeoutMs: { ...SchemaProps.integer({ description: 'Per-request timeout in milliseconds.' }) },
    requestRetries: { ...SchemaProps.integer({ description: 'Retries for a rate-limited or failing source.' }) },
    perSourceConcurrency: { ...SchemaProps.integer({ description: 'Concurrency for per-posting detail fetches.' }) },
  },
  required: [],
};

const CAREER_JOB_DISCOVERY_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    status: { type: 'string', enum: ['ok', 'partial', 'no-match', 'failed', 'blocked'] },
    data: {
      type: 'object',
      properties: {
        listings: { type: 'array', items: { type: 'object' } },
        total: { type: 'number' },
        byBoard: { type: 'array', items: { type: 'object' } },
        failures: { type: 'array', items: { type: 'object' } },
        failureCount: { type: 'number' },
        targetedFrom: { type: ['string', 'null'] },
        queries: { type: 'array', items: { type: 'string' } },
        companies: { type: 'array', items: { type: 'string' } },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'status', 'data', 'error'],
};

export const CAREER_JOB_DISCOVERY: Tool = createCodeSkill({
  id: 'career-job-discovery',
  name: 'Job Discovery',
  description: 'Finds real job listings from public, no-auth sources and returns normalized postings.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_JOB_DISCOVERY_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    readsEnvironment: ['CAREER_HOME', 'CAREER_REQUEST_TIMEOUT_MS', 'CAREER_REQUEST_RETRIES', 'CAREER_REQUEST_RETRY_BASE_MS', 'CAREER_REQUEST_RETRY_MAX_MS', 'CAREER_PER_SOURCE_CONCURRENCY', 'CAREER_INTER_REQUEST_DELAY_MS'],
    // A discovery run reads many sources, paginates them, and can enrich each
    // posting with a detail request. The previous 30s default was shared with
    // every other code skill and could SIGKILL a legitimate multi-source sweep,
    // losing the whole run with an opaque timeout.
    timeoutMs: 240000,
  },
  inputSchema: CAREER_JOB_DISCOVERY_INPUT,
  outputSchema: careerResultSchema(
    'Normalized job listings plus the per-source run ledger. Read data.listings for the postings and data.byBoard / data.failures for the outcome of every source consulted.'
  ) as unknown as SchemaRecord,
  triggers: [
    {
      kind: 'user',
      phrase_examples: ['Discover jobs', 'Find matching roles', 'Search for jobs', 'What jobs are open for me'],
    },
  ],
  tier: 'aid',
  isSkill: false,
});
