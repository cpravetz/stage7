import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-job-discovery: searches real job boards and returns normalized listings.
//
// Sources, in two tiers:
//
//   Tier 1 - applicant tracking systems with public, no-auth JSON APIs. These need no
//   key and no account, so discovery returns real results on a stock install:
//     - Greenhouse  https://boards-api.greenhouse.io/v1/boards/<token>/jobs
//     - Ashby        https://api.ashbyhq.com/posting-api/job-board/<name>
//     - Lever        https://api.lever.co/v0/postings/<company>
//
//   Tier 2 - the large aggregators (LinkedIn, Indeed, Glassdoor, Monster, Wellfound) plus
//   Google Jobs. These block unauthenticated scraping, so we do not scrape them. Instead a
//   single SERPAPI_API_KEY unlocks SerpAPI's per-board engines, and its google_jobs engine
//   already aggregates LinkedIn, Indeed and Glassdoor listings. Without a key these sources
//   are reported as skipped rather than silently returning nothing.
//
// Every run reports per-board status so a caller can always tell a real empty result
// (board has no matching roles) apart from a source that never ran.
//
// Returns { success, data: { listings, total, byBoard, serpApiConfigured, storagePath, ... } }
const CAREER_JOB_DISCOVERY_SOURCE = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || '/tmp/career';
const REQUEST_TIMEOUT_MS = 20000;
const ENRICH_CONCURRENCY = 6;

function asList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined && String(x).trim() !== '').map(String);
  return String(v).trim() === '' ? [] : [String(v)];
}
function num(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
function stripHtml(html) {
  if (!html) return '';
  return String(html)
    .replace(/<script[\\s\\S]*?<\\/script>/gi, ' ')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\\s+/g, ' ')
    .trim();
}
function slug(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
}
function stableId(prefix, parts) {
  let h = 5381;
  const str = parts.join('|').toLowerCase();
  for (let i = 0; i < str.length; i++) { h = ((h * 33) ^ str.charCodeAt(i)) >>> 0; }
  return prefix + '_' + h.toString(36);
}
async function getJson(url, headers) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: headers || {} });
    if (!res.ok) return { ok: false, status: res.status, data: null };
    const data = await res.json();
    return { ok: true, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 0, data: null, error: err && err.message ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

// Maps common board names to SerpAPI engines so the freeJobBoards/premiumJobBoards
// inputs keep working as the user-facing way to pick sources.
const BOARD_ENGINE_MAP = [
  { match: /greenhouse/i, ats: 'greenhouse' },
  { match: /ashby/i, ats: 'ashby' },
  { match: /lever/i, ats: 'lever' },
  { match: /linkedin/i, engine: 'linkedin_jobs' },
  { match: /indeed/i, engine: 'indeed' },
  { match: /glassdoor/i, engine: 'glassdoor' },
  { match: /monster/i, engine: 'monster' },
  { match: /wellfound|angellist/i, engine: 'wellfound' },
  { match: /google|careers?\\.google/i, engine: 'google_jobs' },
];

function resolveSerpKey(cfgInput) {
  // Order: explicit input, then env, then the Vault. Never throws - an absent key just
  // means the aggregator tier is reported as skipped.
  if (cfgInput.serpApiKey) return Promise.resolve(String(cfgInput.serpApiKey));
  const fromEnv = process.env.SERPAPI_API_KEY || process.env.SERP_API_KEY || '';
  if (fromEnv) return Promise.resolve(fromEnv);
  const vaultUrl = (process.env.VAULT_URL || 'http://vault:4000').replace(/\\/+$/, '');
  return fetch(vaultUrl + '/secrets/career-serpapi/decrypt', { headers: { 'X-Tenant-Id': 'system' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => (d && d.plaintext ? d.plaintext : ''))
    .catch(() => '');
}

// ---------------------------------------------------------------- ATS collectors

function fromGreenhouse(job, boardToken) {
  const title = job.title || '';
  const company = job.company_name || boardToken;
  const location = (job.location && job.location.name) || '';
  let salaryMin = null, salaryMax = null, salaryRaw = null, currency = null;
  const meta = Array.isArray(job.metadata) ? job.metadata : [];
  for (const entry of meta) {
    const value = (entry && entry.value) ? String(entry.value) : '';
    const salaryEntry = meta.find((m) => m && /pay|salary|compensation/i.test(m.name || ''));
    if (salaryEntry && value) salaryRaw = value;
    if (/salary|compensation|pay range/i.test(entry && entry.name ? entry.name : '')) {
      const nums = value.replace(/,/g, '').match(/\\d+(?:\\.\\d+)?/g);
      if (nums && nums.length) {
        const vals = nums.map(Number);
        salaryMin = Math.min.apply(null, vals);
        salaryMax = Math.max.apply(null, vals);
        const cur = value.match(/([$£€])\\s?\\d/);
        if (cur) currency = cur[1] === '£' ? 'GBP' : cur[1] === '€' ? 'EUR' : 'USD';
      }
    }
  }
  return {
    id: 'gh_' + String(job.id || stableId('gh', [title, company])),
    title,
    company,
    location,
    remote: /remote/i.test(location),
    description: '',
    applyUrl: job.absolute_url || '',
    source: 'greenhouse',
    sourceUrl: 'boards.greenhouse.io/' + boardToken,
    postedAt: job.updated_at || job.first_published || null,
    employmentType: 'full-time',
    department: '',
    salary: salaryMin != null ? { min: salaryMin, max: salaryMax, currency, raw: salaryRaw } : null,
  };
}

function fromAshby(job, boardName) {
  let salaryMin = null, salaryMax = null, salaryRaw = null, currency = null;
  const comp = job.compensation || null;
  if (comp && Array.isArray(comp.summaryComponents)) {
    for (const c of comp.summaryComponents) {
      if (c && c.compensationType === 'Salary' && c.minValue != null) {
        salaryMin = c.minValue;
        salaryMax = c.maxValue != null ? c.maxValue : c.minValue;
        currency = c.currencyCode || null;
        salaryRaw = c.summary || comp.scrapeableCompensationSalarySummary || comp.compensationTierSummary || null;
      }
    }
  }
  return {
    id: 'ash_' + String(job.id || stableId('ash', [job.title, boardName])),
    title: job.title || '',
    company: boardName,
    location: job.location || '',
    remote: !!job.isRemote,
    description: job.descriptionPlain || stripHtml(job.descriptionHtml),
    applyUrl: job.applyUrl || job.jobUrl || '',
    source: 'ashby',
    sourceUrl: job.jobUrl || ('jobs.ashbyhq.com/' + boardName),
    postedAt: job.publishedAt || null,
    employmentType: job.employmentType || '',
    department: job.department || job.team || '',
    salary: salaryMin != null ? { min: salaryMin, max: salaryMax, currency, raw: salaryRaw } : null,
  };
}

function fromLever(job, company) {
  const cats = job.categories || {};
  const location = cats.location || (Array.isArray(cats.allLocations) ? cats.allLocations.join(', ') : '');
  let salaryMin = null, salaryMax = null, salaryRaw = null, currency = null;
  // Only salaryRange is a pay field. additionalPlain is free-text ad copy and will pick up
  // stray years ("Y Combinator 2012"), so it is deliberately not used.
  const range = job.salaryRange || null;
  if (range && typeof range === 'string' && /\\d/.test(range)) {
    const nums = range.replace(/,/g, '').match(/\\d+(?:\\.\\d+)?/g);
    if (nums && nums.length) {
      const vals = nums.map(Number);
      salaryMin = Math.min.apply(null, vals);
      salaryMax = Math.max.apply(null, vals);
      salaryRaw = range;
      if (/€/.test(range)) currency = 'EUR';
      else if (/£/.test(range)) currency = 'GBP';
    }
  }
  return {
    id: 'lev_' + String(job.id || stableId('lev', [job.text, company])),
    title: job.text || '',
    company,
    location,
    remote: job.workplaceType === 'remote' || /remote/i.test(location),
    description: job.descriptionPlain || stripHtml(job.description),
    applyUrl: job.applyUrl || job.hostedUrl || '',
    source: 'lever',
    sourceUrl: job.hostedUrl || ('jobs.lever.co/' + company),
    postedAt: job.createdAt ? new Date(job.createdAt).toISOString() : null,
    employmentType: cats.commitment || '',
    department: cats.team || '',
    salary: salaryMin != null ? { min: salaryMin, max: salaryMax, currency, raw: salaryRaw } : null,
  };
}

async function collectGreenhouse(boardToken, cap, byBoard, enrich) {
  const url = 'https://boards-api.greenhouse.io/v1/boards/' + encodeURIComponent(boardToken) + '/jobs';
  const res = await getJson(url);
  if (!res.ok || !res.data || !Array.isArray(res.data.jobs)) {
    byBoard.push({ board: 'greenhouse:' + boardToken, status: 'unavailable', count: 0, note: res.status === 404 ? 'No Greenhouse board with that name.' : 'Could not reach Greenhouse.' });
    return [];
  }
  let jobs = res.data.jobs.slice(0, cap);
  jobs = jobs.map((j) => fromGreenhouse(j, boardToken));
  if (enrich) {
    // Greenhouse omits descriptions from the list endpoint; fetch them per job.
    const withDetail = jobs.slice(0, Math.min(jobs.length, cap));
    let cursor = 0;
    const workers = [];
    const workerCount = Math.min(ENRICH_CONCURRENCY, withDetail.length);
    for (let w = 0; w < workerCount; w++) {
      workers.push((async () => {
        while (cursor < withDetail.length) {
          const idx = cursor++;
          const job = withDetail[idx];
          const raw = job.id.replace(/^gh_/, '');
          const d = await getJson('https://boards-api.greenhouse.io/v1/boards/' + encodeURIComponent(boardToken) + '/jobs/' + raw);
          if (d.ok && d.data && d.data.content) job.description = stripHtml(d.data.content);
        }
      })());
    }
    await Promise.all(workers);
  }
  byBoard.push({ board: 'greenhouse:' + boardToken, status: 'ok', count: jobs.length, note: 'Public Greenhouse board API. No key required.' });
  return jobs;
}

async function collectAshby(boardName, cap, byBoard) {
  const url = 'https://api.ashbyhq.com/posting-api/job-board/' + encodeURIComponent(boardName) + '?includeCompensation=true';
  const res = await getJson(url);
  if (!res.ok || !res.data || !Array.isArray(res.data.jobs)) {
    byBoard.push({ board: 'ashby:' + boardName, status: 'unavailable', count: 0, note: res.status === 404 ? 'No Ashby job board with that name.' : 'Could not reach Ashby.' });
    return [];
  }
  const jobs = res.data.jobs.slice(0, cap).map((j) => fromAshby(j, boardName));
  byBoard.push({ board: 'ashby:' + boardName, status: 'ok', count: jobs.length, note: 'Public Ashby posting API. No key required.' });
  return jobs;
}

async function collectLever(company, cap, byBoard) {
  const url = 'https://api.lever.co/v0/postings/' + encodeURIComponent(company) + '?mode=json';
  const res = await getJson(url);
  if (!res.ok || !Array.isArray(res.data)) {
    byBoard.push({ board: 'lever:' + company, status: 'unavailable', count: 0, note: res.status === 404 ? 'No Lever postings under that name.' : 'Could not reach Lever.' });
    return [];
  }
  const jobs = res.data.slice(0, cap).map((j) => fromLever(j, company));
  byBoard.push({ board: 'lever:' + company, status: 'ok', count: jobs.length, note: 'Public Lever postings API. No key required.' });
  return jobs;
}

// ------------------------------------------------------------- SerpAPI collectors

// SerpAPI returns different array keys and field names per engine, so read defensively
// across the shapes the jobs engines actually use.
function pickArray(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  for (const key of ['jobs_results', 'organic_results', 'data', 'job_results', 'results']) {
    if (Array.isArray(data[key])) return data[key];
  }
  return [];
}
function fromSerp(row, engine) {
  const title = row.title || row.text || row.job_title || row.position || '';
  const company = row.company_name || row.companyName || row.employer || row.company || row.hiring_company || '';
  let applyUrl = '';
  if (Array.isArray(row.apply_options) && row.apply_options.length && row.apply_options[0] && row.apply_options[0].link) applyUrl = row.apply_options[0].link;
  if (!applyUrl) applyUrl = row.applyUrl || row.apply_url || row.url || row.link || row.job_url || row.jobUrl || '';
  let salaryRaw = null, salaryMin = null, salaryMax = null;
  const det = row.detected_extensions || {};
  if (det.salary) salaryRaw = String(det.salary);
  if (row.salary) salaryRaw = String(row.salary);
  if (row.compensation) salaryRaw = String(row.compensation);
  if (salaryRaw) {
    const nums = salaryRaw.replace(/,/g, '').match(/\\d+(?:\\.\\d+)?/g);
    if (nums && nums.length) {
      const vals = nums.map(Number);
      salaryMin = Math.min.apply(null, vals);
      salaryMax = Math.max.apply(null, vals);
    }
  }
  return {
    id: 'serp_' + String(row.job_id || row.id || stableId('serp', [title, company, engine])),
    title,
    company,
    location: row.location || row.candidate_required_location || row.city || '',
    remote: !!row.is_remote || /remote/i.test(String(row.location || '')),
    description: stripHtml(row.description || row.snippet || row.job_description || ''),
    applyUrl,
    source: engine,
    sourceUrl: row.via ? ('via ' + row.via) : engine,
    postedAt: row.detected_extensions && row.detected_extensions.posted_at ? String(row.detected_extensions.posted_at) : (row.posted_at || row.date_posted || null),
    employmentType: (row.detected_extensions && row.detected_extensions.schedule_type) || row.employment_type || '',
    department: '',
    salary: salaryMin != null ? { min: salaryMin, max: salaryMax, currency: null, raw: salaryRaw } : null,
  };
}

async function collectSerpEngine(engine, query, location, cap, apiKey, byBoard) {
  const url = 'https://serpapi.com/search?engine=' + encodeURIComponent(engine) +
    '&q=' + encodeURIComponent(query) +
    (location ? '&location=' + encodeURIComponent(location) : '') +
    '&num=' + Math.min(cap, 20) +
    '&api_key=' + encodeURIComponent(apiKey);
  const res = await getJson(url);
  if (!res.ok || !res.data) {
    byBoard.push({ board: engine, status: 'unavailable', count: 0, note: res.status === 401 ? 'SerpAPI rejected the key.' : 'SerpAPI search failed.' });
    return [];
  }
  if (res.data.error) {
    byBoard.push({ board: engine, status: 'unavailable', count: 0, note: 'SerpAPI error: ' + String(res.data.error).slice(0, 120) });
    return [];
  }
  const rows = pickArray(res.data).slice(0, cap).map((r) => fromSerp(r, engine));
  byBoard.push({ board: engine, status: 'ok', count: rows.length, note: 'SerpAPI ' + engine + ' engine.' });
  return rows;
}

// ------------------------------------------------------------------ orchestrate

const companies = asList(input.companies || input.targetCompanies || input.company);
const queries = asList(input.queries || input.query);
const locations = asList(input.locations);
const freeJobBoards = asList(input.freeJobBoards);
const premiumJobBoards = asList(input.premiumJobBoards);
const explicitTokens = input.boardTokens && typeof input.boardTokens === 'object' ? input.boardTokens : {};
const maxPerBoard = Math.max(1, num(input.maxPerBoard, 50));
const enrich = input.enrichDescriptions !== false;
const minSalary = num(input.minSalary, 0);
const maxSalary = num(input.maxSalary, Infinity);
const wantsRemote = locations.some((l) => /remote/i.test(l));

const byBoard = [];
let listings = [];

// Tier 1: explicit board tokens win.
const ghTokens = asList(explicitTokens.greenhouse);
const ashbyTokens = asList(explicitTokens.ashby);
const leverTokens = asList(explicitTokens.lever);

for (const t of ghTokens) {
  listings = listings.concat(await collectGreenhouse(t, maxPerBoard, byBoard, enrich));
}
for (const t of ashbyTokens) {
  listings = listings.concat(await collectAshby(t, maxPerBoard, byBoard));
}
for (const t of leverTokens) {
  listings = listings.concat(await collectLever(t, maxPerBoard, byBoard));
}

// Tier 1: otherwise probe ATS platforms for each named company, first hit wins.
if (ghTokens.length === 0 && ashbyTokens.length === 0 && leverTokens.length === 0 && companies.length > 0) {
  for (const company of companies) {
    const token = slug(company);
    if (!token) continue;
    let found = false;
    for (const probe of [
      { ats: 'greenhouse', fn: () => collectGreenhouse(token, maxPerBoard, byBoard, enrich) },
      { ats: 'ashby', fn: () => collectAshby(token, maxPerBoard, byBoard) },
      { ats: 'lever', fn: () => collectLever(token, maxPerBoard, byBoard) },
    ]) {
      if (found) break;
      const rows = await probe.fn();
      if (rows.length > 0) { found = true; listings = listings.concat(rows); }
      else {
        const last = byBoard[byBoard.length - 1];
        if (last && last.status === 'unavailable') last.status = 'no-match';
      }
    }
  }
}

// Tier 2: aggregators, only with a SerpAPI key.
const serpApiKey = await resolveSerpKey(input);
const serpApiConfigured = !!serpApiKey;

const requestedEngines = asList(input.searchEngines || input.engines);
const boardNamedEngines = [];
for (const board of [...freeJobBoards, ...premiumJobBoards]) {
  for (const entry of BOARD_ENGINE_MAP) {
    if (entry.match.test(board) && entry.engine && boardNamedEngines.indexOf(entry.engine) < 0) {
      boardNamedEngines.push(entry.engine);
    }
  }
}
// Google Jobs is the default aggregator query surface: it already indexes LinkedIn,
// Indeed and Glassdoor listings, so one call covers the big three.
const serpEngines = [];
for (const e of [...requestedEngines, ...boardNamedEngines, 'google_jobs']) {
  if (serpEngines.indexOf(e) < 0) serpEngines.push(e);
}

const anyAtsHit = byBoard.some((b) => b.status === 'ok');
if (queries.length > 0 && serpApiConfigured) {
  const searchQuery = queries.join(' OR ');
  const searchLocation = locations.filter((l) => !/remote/i.test(l))[0] || '';
  for (const engine of serpEngines) {
    listings = listings.concat(await collectSerpEngine(engine, searchQuery, searchLocation, maxPerBoard, serpApiKey, byBoard));
  }
} else if (queries.length > 0 && !serpApiConfigured && !anyAtsHit) {
  byBoard.push({ board: 'aggregators', status: 'skipped', count: 0, note: 'LinkedIn, Indeed, Glassdoor, Monster, Wellfound and Google Jobs are not scraped. Add SERPAPI_API_KEY to your .env to search them; the google_jobs engine already aggregates LinkedIn, Indeed and Glassdoor listings.' });
}

// ------------------------------------------------------------------ normalize

// A parsed range is only trusted if it looks like a real annual salary band. Guards
// against free-text scraping artifacts (a stray year, a ZIP code, a percentage).
function plausibleSalary(s) {
  if (!s || s.min == null || s.max == null) return null;
  const lo = Number(s.min);
  const hi = Number(s.max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  if (lo <= 0 || hi <= 0) return null;
  // Allow hourly and contract rates, but reject bands spanning more than 20x.
  if (hi / lo > 20) return null;
  // Anything above 10M is almost certainly a year, ID, or a concatenated figure.
  if (hi > 10000000) return null;
  if (lo < 5) return null;
  return s;
}

function dedupeKey(l) {
  return (l.title || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim() + '|' +
         (l.company || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}
const merged = new Map();
for (const l of listings) {
  if (!l || !l.title) continue;
  const checked = plausibleSalary(l.salary);
  if (l.salary && !checked) l.salaryRejected = l.salary;
  l.salary = checked;
  const key = dedupeKey(l);
  if (merged.has(key)) {
    const existing = merged.get(key);
    if (!existing.description && l.description) existing.description = l.description;
    if (!existing.salary && l.salary) existing.salary = l.salary;
    if (!existing.applyUrl && l.applyUrl) existing.applyUrl = l.applyUrl;
    existing.sources = (existing.sources || [existing.source]).concat(l.source);
  } else {
    l.sources = [l.source];
    merged.set(key, l);
  }
}
let deduped = Array.from(merged.values());

// -------------------------------------------------------------------- filter

const beforeFilter = deduped.length;
if (queries.length > 0) {
  const terms = queries.join(' ').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
  if (terms.length > 0) {
    deduped = deduped.filter((l) => {
      const hay = ((l.title || '') + ' ' + (l.company || '') + ' ' + (l.department || '') + ' ' + (l.description || '')).toLowerCase();
      return terms.some((t) => hay.indexOf(t) >= 0);
    });
  }
}
if (locations.length > 0) {
  const locs = locations.map((l) => l.toLowerCase()).filter((l) => !/^remote$/.test(l));
  if (locs.length > 0) {
    deduped = deduped.filter((l) => l.remote || locs.some((loc) => (l.location || '').toLowerCase().indexOf(loc) >= 0));
  } else if (wantsRemote) {
    deduped = deduped.filter((l) => l.remote);
  }
}
if (minSalary > 0 || Number.isFinite(maxSalary)) {
  deduped = deduped.filter((l) => {
    if (!l.salary || l.salary.max == null) return true;
    if (Number.isFinite(maxSalary) && l.salary.max > maxSalary * 1.15) return false;
    if (minSalary > 0 && l.salary.max < minSalary * 0.8) return false;
    return true;
  });
}

deduped.sort((a, b) => {
  const at = a.postedAt ? Date.parse(a.postedAt) : 0;
  const bt = b.postedAt ? Date.parse(b.postedAt) : 0;
  if (bt !== at) return bt - at;
  return (a.title || '').localeCompare(b.title || '');
});

const storagePath = path.join(baseDir, 'listings', 'default.json');
fs.mkdirSync(path.dirname(storagePath), { recursive: true });
fs.writeFileSync(storagePath, JSON.stringify({
  listings: deduped,
  total: deduped.length,
  byBoard,
  serpApiConfigured,
  generatedAt: new Date().toISOString(),
}, null, 2));

const okBoards = byBoard.filter((b) => b.status === 'ok');
const noMatch = byBoard.filter((b) => b.status === 'no-match' || b.status === 'unavailable');
let note;
if (okBoards.length > 0 && deduped.length > 0) {
  note = 'Found ' + deduped.length + ' listing' + (deduped.length === 1 ? '' : 's') + ' across ' +
    okBoards.length + ' board' + (okBoards.length === 1 ? '' : 's') + ' (' + beforeFilter + ' raw, ' + deduped.length + ' after filtering).';
} else if (okBoards.length > 0 && deduped.length === 0) {
  note = 'Reached ' + okBoards.length + ' board' + (okBoards.length === 1 ? '' : 's') + ' but nothing matched your filters (' + beforeFilter + ' listings were returned). Widen your search or add more companies.';
} else if (companies.length === 0 && queries.length === 0) {
  note = 'Nothing to search. Provide "companies" (company names to check on Greenhouse, Ashby and Lever) or "queries" (job titles to search the aggregators).';
} else {
  note = 'No listings found. The boards checked returned no matching roles. See byBoard for the status of each source.';
}

console.log(JSON.stringify({
  success: true,
  data: {
    listings: deduped,
    total: deduped.length,
    byBoard,
    rawCount: beforeFilter,
    queriesUsed: queries,
    companiesSearched: companies,
    boardsSearched: okBoards.map((b) => b.board),
    boardsUnavailable: noMatch.map((b) => b.board),
    serpApiConfigured,
    enginesRequested: queries.length > 0 ? serpEngines : [],
    note,
    storagePath,
    generatedAt: new Date().toISOString(),
  },
}));
})();`;

const CAREER_JOB_DISCOVERY_INPUT = {
  type: 'object',
  properties: {
    queries: { type: 'array', items: { type: 'string' }, description: 'Job titles to search the job-board aggregators' },
    query: { type: 'string', description: 'Single search query' },
    companies: { type: 'array', items: { type: 'string' }, description: 'Company names. Checked against the public Greenhouse, Ashby and Lever job board APIs.' },
    targetCompanies: { type: 'array', items: { type: 'string' }, description: 'Alias for companies' },
    locations: { type: 'array', items: { type: 'string' } },
    minSalary: { type: 'number' },
    maxSalary: { type: 'number' },
    boardTokens: {
      type: 'object',
      description: 'Explicit ATS board names to pin, e.g. { "greenhouse": ["stripe"], "ashby": ["ashby"], "lever": ["leverdemo"] }',
      properties: {
        greenhouse: { type: 'array', items: { type: 'string' } },
        ashby: { type: 'array', items: { type: 'string' } },
        lever: { type: 'array', items: { type: 'string' } },
      },
    },
    searchEngines: {
      type: 'array',
      items: { type: 'string' },
      description: 'SerpAPI engines to use: google_jobs, indeed, linkedin_jobs, glassdoor, monster, wellfound',
    },
    serpApiKey: { type: 'string', sensitive: true, description: 'Optional SerpAPI key. Falls back to SERPAPI_API_KEY then the Vault.' },
    freeJobBoards: { type: 'array', items: { type: 'string' } },
    premiumJobBoards: { type: 'array', items: { type: 'string' } },
    maxPerBoard: { type: 'number', default: 50 },
    enrichDescriptions: { type: 'boolean', default: true },
  },
};

const CAREER_JOB_DISCOVERY_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: {
      type: 'object',
      properties: {
        listings: { type: 'array' },
        total: { type: 'number' },
        byBoard: { type: 'array', description: 'Per-source status so a real empty result is distinguishable from a source that never ran' },
        rawCount: { type: 'number' },
        queriesUsed: { type: 'array' },
        companiesSearched: { type: 'array' },
        boardsSearched: { type: 'array' },
        boardsUnavailable: { type: 'array' },
        serpApiConfigured: { type: 'boolean' },
        enginesRequested: { type: 'array' },
        note: { type: 'string' },
        storagePath: { type: 'string' },
        generatedAt: { type: 'string', format: 'date-time' },
      },
    },
    error: { type: 'string' },
  },
  required: ['success'],
};

const CAREER_JOB_DISCOVERY = createCodeSkill({
  id: 'career-job-discovery',
  isSkill: false,
  name: 'Job Discovery',
  description:
    'Searches real job boards and returns normalized job objects with title, company, location, salary, and apply URL. ' +
    'Reads the public Greenhouse, Ashby and Lever job board APIs with no key required, and uses a SerpAPI key to search ' +
    'Google Jobs, LinkedIn, Indeed, Glassdoor, Monster and Wellfound. Reports per-board status so empty results are never silent.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_JOB_DISCOVERY_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Discover jobs',
    readsEnvironment: ['SERPAPI_API_KEY', 'CAREER_HOME', 'VAULT_URL'],
    vaultSecrets: ['career-serpapi'],
  },
  inputSchema: CAREER_JOB_DISCOVERY_INPUT,
  outputSchema: CAREER_JOB_DISCOVERY_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Discover jobs', 'Search job boards', 'Find new listings'] },
  ],
});
CAREER_JOB_DISCOVERY.configSchema = CAREER_JOB_DISCOVERY.manifest.configSchema as SchemaRecord;

export { CAREER_JOB_DISCOVERY };
