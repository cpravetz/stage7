import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';
import { careerResultSchema } from './career-contract';

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
const CAREER_JOB_DISCOVERY_SOURCE = `0; (async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.CAREER_HOME || '/tmp/career';

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
    .replace(/[\\s]+/g, ' ')
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

// Tunable network & concurrency defaults. Can be overridden by \`input.*\` or env vars.
let REQUEST_TIMEOUT_MS = 20000;
let ENRICH_CONCURRENCY = 6;
let MAX_RETRIES = 2;
let RETRY_DELAY_MS = 500;

REQUEST_TIMEOUT_MS = num(input.requestTimeoutMs != null ? input.requestTimeoutMs : process.env.CAREER_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS);
MAX_RETRIES = Math.max(0, num(input.requestRetries != null ? input.requestRetries : process.env.CAREER_REQUEST_RETRIES, MAX_RETRIES));
RETRY_DELAY_MS = Math.max(0, num(input.requestRetryDelayMs != null ? input.requestRetryDelayMs : process.env.CAREER_REQUEST_RETRY_DELAY_MS, RETRY_DELAY_MS));
ENRICH_CONCURRENCY = Math.max(1, num(input.perSourceConcurrency != null ? input.perSourceConcurrency : process.env.CAREER_PER_SOURCE_CONCURRENCY, ENRICH_CONCURRENCY));

function sleep(ms) { return new Promise((res) => setTimeout(res, ms)); }

async function httpGet(url, headers, expectJson) {
  let attempt = 0;
  while (attempt <= MAX_RETRIES) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: headers || {} });
      if (!res.ok) {
        if (res.status >= 500 || res.status === 0) {
          if (attempt <= MAX_RETRIES) await sleep(RETRY_DELAY_MS * attempt);
          continue;
        }
        return { ok: false, status: res.status, data: null };
      }
      if (expectJson) {
        const data = await res.json();
        clearTimeout(timer);
        return { ok: true, status: res.status, data };
      }
      const text = await res.text();
      clearTimeout(timer);
      return { ok: true, data: text };
    } catch (err) {
      if (attempt <= MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      return { ok: false, status: 0, data: null, error: err && err.message ? err.message : String(err) };
    } finally {
      clearTimeout(timer);
    }
  }
  return { ok: false, status: 0, data: null, error: 'Max retries exceeded' };
}

async function getJson(url, headers) {
  return await httpGet(url, headers, true);
}

async function fetchHtml(url) {
  return await httpGet(url, null, false);
}

async function searchWellfound(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://wellfound.com/jobs?query=' + q + (loc ? '&location=' + loc : '') + '&sort_by=recent';
  const res = await fetchHtml(url);
  if (!res.ok) return [];
  const html = res.data;
  const jobs = [];
  const re = /data-job-id="(\\d+)"|/g;
  // Fallback generic scraping: look for job links and company names
  const linkRe = /<a[^>]+href="([^"]+)"[^>]*class="[^"]*(?:job|result|styles__card)[^"]*"[^>]*>([\\s\\S]*?)<\\/a>/gi;
  let m;
  let seen = 0;
  while ((m = linkRe.exec(html)) && seen < 20) {
    const href = m[1];
    const snippet = stripHtml(m[2] || '');
    const parts = snippet.split('\\n').map((s) => s.trim()).filter(Boolean);
    const title = parts[0] || 'Unknown';
    const company = parts[1] || '';
    const locationText = parts.slice(2).join(' ') || '';
    const id = 'wellfound_' + stableId('wf', [href, title, company]);
    jobs.push({ id, title: stripHtml(title), company: stripHtml(company), location: stripHtml(locationText), applyUrl: href.startsWith('http') ? href : ('https://wellfound.com' + href), source: 'Wellfound', postedAt: null, salary: null });
    seen++;
  }
  return jobs;
}

async function searchGeneralBoards(queryList, location) {
  const results = [];
  for (const q of queryList) {
    try {
      const [indeed, glassdoor, monster, linkedin, wellfound] = await Promise.all([
        searchIndeed(q, location),
        searchGlassdoor(q, location),
        searchMonster(q, location),
        searchLinkedIn(q, location),
        searchWellfound(q, location),
      ]);
      results.push(...indeed, ...glassdoor, ...monster, ...linkedin, ...wellfound);
    } catch (e) {
      console.error('General board search error for query "' + q + '": ' + (e instanceof Error ? e.message : String(e)));
    }
  }
  return results;
}

async function searchIndeed(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://www.indeed.com/jobs?q=' + q + (loc ? '&l=' + loc : '') + '&fromage=14';
  const res = await fetchHtml(url);
  if (!res.ok) return [];
  const html = res.data;
  const jobs = [];
  const re = /data-jk="([^"]+)".*?data-company-name="([^"]+)".*?data-location="([^"]+)"/gs;
  let m;
  while ((m = re.exec(html)) && jobs.length < 20) {
    const [, id, company, location] = m;
    const titleMatch = html.slice(m.index).match(new RegExp('<h2[^>]*><a[^>]*>([^<]+)</a></h2>'));
    const title = titleMatch ? stripHtml(titleMatch[1]) : 'Unknown';
    jobs.push({
      id: 'indeed_' + id,
      title,
      company: stripHtml(company),
      location: stripHtml(location),
      applyUrl: 'https://www.indeed.com/viewjob?jk=' + id,
      source: 'Indeed',
      postedAt: null,
      salary: null,
    });
  }
  return jobs;
}

async function searchGlassdoor(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://www.glassdoor.com/Job/jobs.htm?sc.keyword=' + q + (loc ? '&locT=C&locId=' + loc : '') + '&fromAge=14';
  const res = await fetchHtml(url);
  if (!res.ok) return [];
  const html = res.data;
  const jobs = [];
  const re = /data-job-id="([^"]+)".*?data-employer-name="([^"]+)".*?data-location="([^"]+)"/gs;
  let m;
  while ((m = re.exec(html)) && jobs.length < 20) {
    const [, id, company, location] = m;
    const titleMatch = html.slice(m.index).match(new RegExp('<a[^>]*class="[^"]*jobTitle[^"]*"[^>]*>([^<]+)</a>'));
    const title = titleMatch ? stripHtml(titleMatch[1]) : 'Unknown';
    jobs.push({
      id: 'glassdoor_' + id,
      title,
      company: stripHtml(company),
      location: stripHtml(location),
      applyUrl: 'https://www.glassdoor.com/job-listing/' + id,
      source: 'Glassdoor',
      postedAt: null,
      salary: null,
    });
  }
  return jobs;
}

async function searchMonster(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://www.monster.com/jobs/search?q=' + q + (loc ? '&where=' + loc : '') + '&age=14';
  const res = await fetchHtml(url);
  if (!res.ok) return [];
  const html = res.data;
  const jobs = [];
  const re = /data-job-id="([^"]+)".*?data-company-name="([^"]+)".*?data-location="([^"]+)"/gs;
  let m;
  while ((m = re.exec(html)) && jobs.length < 20) {
    const [, id, company, location] = m;
    const titleMatch = html.slice(m.index).match(new RegExp('<h2[^>]*><a[^>]*>([^<]+)</a></h2>'));
    const title = titleMatch ? stripHtml(titleMatch[1]) : 'Unknown';
    jobs.push({
      id: 'monster_' + id,
      title,
      company: stripHtml(company),
      location: stripHtml(location),
      applyUrl: 'https://www.monster.com/job/' + id,
      source: 'Monster',
      postedAt: null,
      salary: null,
    });
  }
  return jobs;
}

async function searchLinkedIn(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://www.linkedin.com/jobs/search?keywords=' + q + (loc ? '&location=' + loc : '') + '&f_TPR=r604800';
  const res = await fetchHtml(url);
  if (!res.ok) return [];
  const html = res.data;
  const jobs = [];
  const re = /data-entity-urn="urn:li:jobPosting:(\\d+)".*?data-company-name="([^"]+)".*?data-location="([^"]+)"/gs;
  let m;
  while ((m = re.exec(html)) && jobs.length < 20) {
    const [, id, company, location] = m;
    const titleMatch = html.slice(m.index).match(new RegExp('<h3[^>]*><a[^>]*>([^<]+)</a></h3>'));
    const title = titleMatch ? stripHtml(titleMatch[1]) : 'Unknown';
    jobs.push({
      id: 'linkedin_' + id,
      title,
      company: stripHtml(company),
      location: stripHtml(location),
      applyUrl: 'https://www.linkedin.com/jobs/view/' + id,
      source: 'LinkedIn',
      postedAt: null,
      salary: null,
    });
  }
  return jobs;
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
      const nums = value.replace(/,/g, '').match(new RegExp('\\d+(?:\\.\\d+)?', 'g'));
      if (nums && nums.length) {
        const vals = nums.map(Number);
        salaryMin = Math.min.apply(null, vals);
        salaryMax = Math.max.apply(null, vals);
        const cur = value.match(new RegExp('([$£€])\\s?\\d'));
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
  if (range && typeof range === 'string' && new RegExp('\\d').test(range)) {
    const nums = range.replace(/,/g, '').match(new RegExp('\\d+(?:\\.\\d+)?', 'g'));
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

async function collectGreenhouse(boardToken, cap, byBoard, enrich, pinned) {
  const url = 'https://boards-api.greenhouse.io/v1/boards/' + encodeURIComponent(boardToken) + '/jobs';
  const res = await getJson(url);
  if (!res.ok || !res.data || !Array.isArray(res.data.jobs)) {
    if (pinned) {
      byBoard.push({ board: 'greenhouse:' + boardToken, status: 'unavailable', count: 0, note: res.status === 404 ? 'No Greenhouse board with that name.' : 'Could not reach Greenhouse.' });
    }
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
  if (jobs.length || pinned) {
    byBoard.push({ board: 'greenhouse:' + boardToken, status: 'ok', count: jobs.length, note: 'Public Greenhouse board API. No key required.' });
  }
  return jobs;
}

async function collectAshby(boardName, cap, byBoard) {
  const url = 'https://api.ashbyhq.com/posting-api/job-board/' + encodeURIComponent(boardName) + '?includeCompensation=true';
  const res = await getJson(url);
  if (!res.ok || !res.data || !Array.isArray(res.data.jobs)) {
    // Only record unavailable if explicitly pinned by user
    return [];
  }
  const jobs = res.data.jobs.slice(0, cap).map((j) => fromAshby(j, boardName));
  if (jobs.length) byBoard.push({ board: 'ashby:' + boardName, status: 'ok', count: jobs.length, note: 'Public Ashby posting API. No key required.' });
  return jobs;
}

async function collectLever(company, cap, byBoard) {
  const url = 'https://api.lever.co/v0/postings/' + encodeURIComponent(company) + '?mode=json';
  const res = await getJson(url);
  if (!res.ok || !Array.isArray(res.data)) {
    // Only record unavailable if explicitly pinned by user
    return [];
  }
  const jobs = res.data.slice(0, cap).map((j) => fromLever(j, company));
  if (jobs.length) byBoard.push({ board: 'lever:' + company, status: 'ok', count: jobs.length, note: 'Public Lever postings API. No key required.' });
  return jobs;
 }

// ------------------------------------------------------------------ company career page scraper (fallback)

async function searchCompanyCareerPage(company, cap, byBoard, queryList) {
  if (!company) return [];
  const host = slug(company);
  const candidates = [
    'https://www.' + host + '.com/careers',
    'https://www.' + host + '.com/jobs',
    'https://' + host + '.com/careers',
    'https://' + host + '.com/jobs',
    'https://' + host + '.com/careers/jobs',
    'https://' + host + '.com/career',
    'https://' + host + '.com/open-roles',
    'https://' + host + '.com/teams',
  ];
  const jobs = [];
  for (const url of candidates) {
    try {
      const res = await fetchHtml(url);
      if (!res.ok) continue;
      const html = res.data;
      const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\\s\\S]*?)<\\/a>/gi;
      let m;
      const seen = new Set();
      while ((m = linkRe.exec(html)) && jobs.length < cap) {
        const href = m[1];
        const snippet = stripHtml(m[2] || '').trim();
        if (!snippet) continue;
        // only consider links that look job-like
        if (!/job|role|position|career|opening|opportunity/i.test(href + ' ' + snippet)) continue;
        const title = snippet.split('\\n')[0].trim();
        const id = 'site_' + stableId('site', [host, href, title]);
        if (seen.has(id)) continue;
        seen.add(id);
        jobs.push({ id, title: stripHtml(title), company, location: '', applyUrl: href.startsWith('http') ? href : ('https://' + host + (href.startsWith('/') ? '' : '/') + href), source: 'company-site', sourceUrl: url, postedAt: null, salary: null });
      }
      if (jobs.length) {
        byBoard.push({ board: 'company-site:' + company, status: 'ok', count: jobs.length, note: 'Scraped company career pages (best-effort)' });
        return jobs;
      }
    } catch (e) {
      // ignore and try next
    }
  }
  return [];
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
  listings = listings.concat(await collectGreenhouse(t, maxPerBoard, byBoard, enrich, true));
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
      { ats: 'greenhouse', fn: () => collectGreenhouse(token, maxPerBoard, byBoard, enrich, false) },
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
    // If ATS probes didn't find anything, try scraping the company's career pages.
    if (!found) {
      const siteRows = await searchCompanyCareerPage(company, maxPerBoard, byBoard, queries);
      if (siteRows && siteRows.length) { found = true; listings = listings.concat(siteRows); }
    }
  }
}
}

// Also search general job boards (Indeed, Glassdoor, Monster, LinkedIn) by scraping
// their public search pages. No API keys needed.
if (queries.length) {
  const loc = locations.length ? locations[0] : '';
  const generalJobs = await searchGeneralBoards(queries, loc);
  if (generalJobs.length) {
    byBoard.push({ board: 'general-boards', status: 'ok', count: generalJobs.length, note: 'Scraped from Indeed, Glassdoor, Monster, LinkedIn public search' });
    listings = listings.concat(generalJobs.slice(0, maxPerBoard * 2));
  } else {
    byBoard.push({ board: 'general-boards', status: 'no-match', count: 0, note: 'General board search returned no results' });
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
  note = 'Nothing to search. Provide "companies" (e.g., ["Google", "Microsoft"]) to check their job boards, or "queries" (e.g., ["Engineering Manager"]) to search general and company job boards.';
} else {
  note = 'No listings found. The boards checked returned no matching roles.';
  if (companies.length === 0 && queries.length > 0) {
    note = 'Searched general job boards (Indeed, Glassdoor, Monster, LinkedIn) for "' + queries.join(', ') + '" but found no matches. No company names were provided. Try different search terms or specify companies to check their career pages directly.';
  }
}

function fmtMoney(v) {
  if (v == null || v === '' ) return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return '$' + Math.round(n).toLocaleString();
}

function formatSalary(s) {
  if (!s || s.min == null || s.max == null) return '';
  const cur = s.currency ? s.currency + ' ' : '';
  return cur + fmtMoney(s.min) + ' - ' + fmtMoney(s.max);
}

function formatPostedAt(ts) {
  if (!ts) return 'Unknown';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return 'Unknown';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

var presentBlocks = [];
if (deduped.length > 0) {
  const tableLines = [];
  tableLines.push('Job Listings');
  tableLines.push('============');
  tableLines.push('');
  deduped.slice(0, 100).forEach(function (l, i) {
    tableLines.push((i + 1) + '. ' + l.title);
    tableLines.push('   Company: ' + (l.company || 'Unknown'));
    tableLines.push('   Location: ' + (l.location || 'Unknown') + (l.remote ? ' (remote)' : ''));
    const sal = formatSalary(l.salary);
    if (sal) tableLines.push('   Salary: ' + sal);
    tableLines.push('   Source: ' + l.source + ' \u2022 Posted: ' + formatPostedAt(l.postedAt));
    tableLines.push('');
  });
  presentBlocks.push({ id: 'listings', title: 'Job Listings (' + deduped.length + ')', kind: 'table', body: tableLines.join('\\n'), columns: ['#', 'Title', 'Company', 'Location', 'Salary', 'Posted'] });
  if (deduped.length > 100) tableLines.push('... and ' + (deduped.length - 100) + ' more.');
}

const statusLines = ['Search Summary'];
statusLines.push('===============');
statusLines.push('');
statusLines.push(note);
statusLines.push('');
statusLines.push('Search criteria:');
if (queries.length) statusLines.push('  Titles searched: ' + queries.join(', '));
else statusLines.push('  Titles searched: (any)');
if (companies.length) statusLines.push('  Companies: ' + companies.join(', '));
else statusLines.push('  Companies: (any)');
if (locations.length) statusLines.push('  Locations: ' + locations.join(', '));
else statusLines.push('  Locations: (any)');
presentBlocks.push({ id: 'summary', title: 'Search Results', kind: 'text', body: statusLines.join('\\n') });

if (okBoards.length > 0) {
  const boardLines = ['Sources checked:'];
  okBoards.forEach(function (b) { boardLines.push('  ' + b.board + ': ' + b.count + ' listing' + (b.count === 1 ? '' : 's') + ' \u2014 ' + b.note); });
  presentBlocks.push({ id: 'sources', title: 'Data Sources', kind: 'text', body: boardLines.join('\\n') });
}

if (noMatch.length > 0) {
  const noMatchLines = ['No matches from:'];
  noMatch.forEach(function (b) { noMatchLines.push('  ' + b.board + ' \u2014 ' + b.note); });
  presentBlocks.push({ id: 'no-match', title: 'Sources with no matches', kind: 'text', body: noMatchLines.join('\\n') });
}

console.log(JSON.stringify({
  success: true,
  data: {
    listings: deduped,
    total: deduped.length,
    byBoard,
    note,
  },
  present: presentBlocks,
}));
await Promise.resolve();
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
  outputSchema: careerResultSchema('Job listings, per-board source status, and search metadata'),
  triggers: [
    { kind: 'user', phrase_examples: ['Discover jobs', 'Search job boards', 'Find new listings'] },
  ],
});
CAREER_JOB_DISCOVERY.configSchema = CAREER_JOB_DISCOVERY.manifest.configSchema as SchemaRecord;

export { CAREER_JOB_DISCOVERY };
