import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// career-job-discovery: searches real job boards and returns normalized listings.
//
// Sources:
//
//   Public job board APIs with no auth required. These need no key and no account,
//   so discovery returns real results on a stock install:
//     - Greenhouse  https://boards-api.greenhouse.io/v1/boards/<token>/jobs
//     - Ashby        https://api.ashbyhq.com/posting-api/job-board/<name>
//     - Lever        https://api.lever.co/v0/postings/<company>
//
// Every run reports per-board status so a caller can always tell a real empty result
// (board has no matching roles) apart from a source that never ran.
//
// Returns { success, data: { listings, total, byBoard, storagePath, ... } }
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

// ------------------------------------------------------------------ orchestrate

const companies = asList(input.companies || input.targetCompanies || input.company);
const queries = asList(input.queries || input.query);
const locations = asList(input.locations);
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
  note = 'Nothing to search. Provide "companies" (company names to check on Greenhouse, Ashby and Lever) or "queries" (job titles to search).';
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
    note,
    storagePath,
    generatedAt: new Date().toISOString(),
  },
}));
})();`;

const CAREER_JOB_DISCOVERY_INPUT = {
  type: 'object',
  properties: {
    queries: { type: 'array', items: { type: 'string' }, description: 'Job titles to search for' },
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
    'Reads the public Greenhouse, Ashby and Lever job board APIs with no key required. Reports per-board status so ' +
    'empty results are never silent.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_JOB_DISCOVERY_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Discover jobs',
    readsEnvironment: ['CAREER_HOME'],
  },
  inputSchema: CAREER_JOB_DISCOVERY_INPUT,
  outputSchema: CAREER_JOB_DISCOVERY_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Discover jobs', 'Search job boards', 'Find new listings'] },
  ],
});
CAREER_JOB_DISCOVERY.configSchema = CAREER_JOB_DISCOVERY.manifest.configSchema as SchemaRecord;

export { CAREER_JOB_DISCOVERY };
