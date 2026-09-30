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
// Every run reports a per-source status derived from what actually happened, never
// merely from the fact that an HTTP request returned:
//   ok       - pages fetched AND listings extracted
//   no-match - pages fetched, page structure recognised, genuinely nothing matched.
//               A real answer from a source we did read, not a failure.
//   error    - the source could NOT be retrieved, or was retrieved but its structure
//               could NOT be recognised (request failed, page unreachable, layout
//               changed). There is no offline: an inability to retrieve is a failure
//               inside this system, so it surfaces through success / status / error
//               rather than riding along as a caveat on a passing run.
// A source is never reported as ok when nothing was extracted, and a retrieval
// failure is never reported as no-match.
//
// A run is a failure when no source it consulted could be read, and a partial
// success when some sources answered and others could not be retrieved at all.
// A run in which every source was read and genuinely had no matching roles is an
// ok run whose answer is zero.
//
// Returns { success, status, data: { listings, total, byBoard, failures, ... }, error }
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
  // The last HTTP status actually observed, and the last transport error. Retrying
  // a 5xx must not erase it: a persistent 500 that burns every retry used to be
  // reported as status 0, which read as a network failure and blamed our own
  // connection for the board's outage.
  let lastStatus = 0;
  let lastError = null;
  while (attempt <= MAX_RETRIES) {
    attempt++;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: controller.signal, headers: headers || {} });
      lastStatus = res.status;
      lastError = null;
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
      // A throw here is a transport-level failure (DNS, refused, aborted), so the
      // status really is 0 and it really is a network failure.
      lastStatus = 0;
      lastError = err && err.message ? err.message : String(err);
      if (attempt <= MAX_RETRIES) {
        await sleep(RETRY_DELAY_MS * attempt);
        continue;
      }
      return { ok: false, status: 0, data: null, error: lastError };
    } finally {
      clearTimeout(timer);
    }
  }
  // Every retry was spent on retryable statuses (5xx / 0). Report the last status
  // the server actually gave us, not a fabricated 0.
  return { ok: false, status: lastStatus, data: null, error: lastError || 'Max retries exceeded' };
}

async function getJson(url, headers) {
  return await httpGet(url, headers, true);
}

async function fetchHtml(url) {
  return await httpGet(url, null, false);
}

// Sums the per-query attempts of one board into a single honest status.
//   ok       - at least one listing was actually extracted
//   no-match - every reachable page looked structurally normal (card-shaped markup
//              present) but nothing matched the query filters. A real answer.
//   error    - the request failed, or the page was fetched but no card-shaped markup
//              was recognised at all (layout change / bot wall). The source was not
//              read, so this is a failure and is never reported as ok or as no-match.
function summarizeBoard(attempts, boardName) {
  const total = attempts.reduce((n, a) => n + (a.count || 0), 0);
  if (total > 0) return { status: 'ok', count: total, reason: 'extracted ' + total + ' listing' + (total === 1 ? '' : 's') + ' from the fetched pages' };
  const reachable = attempts.filter((a) => a.fetched);
  if (!attempts.length || reachable.length === 0) {
    // All attempts failed to reach the server. Classify by HTTP status.
    const statuses = attempts.map((a) => a.status).filter((s) => s != null);
    // A 4xx is a bot wall only when the board actually answered and refused us
    // (401/403/407/429 and friends). 404 is a different condition: the hardcoded
    // search URL does not exist at that shape, so the board never received a
    // question at all. Both are retrieval failures, but calling a 404 "blocked"
    // is a false diagnosis, and a permanent one that no retry or backoff will
    // clear, so it is named as what it is.
    const wallCodes = [...new Set(statuses.filter((s) => s >= 400 && s < 500 && s !== 404))];
    const serverCodes = [...new Set(statuses.filter((s) => s >= 500))];
    const goneCodes = [...new Set(statuses.filter((s) => s === 404))];
    const hasNetwork = statuses.some((s) => s === 0);
    let reason;
    if (wallCodes.length) {
      reason = boardName + ' blocked (HTTP ' + wallCodes.join(', ') + ')';
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
  const shaped = reachable.filter((a) => a.structure);
  if (shaped.length === 0) {
    return { status: 'error', count: 0, reason: 'fetched ' + reachable.length + ' of ' + attempts.length + ' page(s) but recognised no job-card markup at all \u2014 the layout has probably changed, so this source could not be read' };
  }
  return { status: 'no-match', count: 0, reason: 'fetched ' + reachable.length + ' of ' + attempts.length + ' page(s), job-card markup present, but nothing matched the query filters' };
}

async function searchWellfound(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://wellfound.com/jobs?query=' + q + (loc ? '&location=' + loc : '') + '&sort_by=recent';
  const res = await fetchHtml(url);
  if (!res.ok) return { jobs: [], fetched: false, structure: false, status: res.status };
  const html = res.data;
  const jobs = [];
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
  // Cheap positive signal: a real results page still carries card markup even when
  // zero roles match the query. No markup at all means we are not looking at a page
  // we understand, so an empty result must not be reported as "no matching roles".
  const shellRe = /data-job-id="[^"]*"|styles__card|styles__job|jobPosting|StartupsList/i;
  return { jobs: jobs, fetched: true, structure: shellRe.test(html), status: res.status };
}

const GENERAL_BOARD_SCRAPERS = [
  { name: 'Indeed', fn: searchIndeed },
  { name: 'Glassdoor', fn: searchGlassdoor },
  { name: 'Monster', fn: searchMonster },
  { name: 'LinkedIn', fn: searchLinkedIn },
  { name: 'Wellfound', fn: searchWellfound },
];

// Each scraper reports { jobs, fetched, structure }, so an empty result can be told
// apart from a scraper whose regex no longer matches the site's HTML.
async function searchGeneralBoards(queryList, location) {
  const results = [];
  const attempts = {};
  for (const b of GENERAL_BOARD_SCRAPERS) attempts[b.name] = [];
  for (const q of queryList) {
    let outcomes;
    try {
      outcomes = await Promise.all(GENERAL_BOARD_SCRAPERS.map((b) => b.fn(q, location)));
    } catch (e) {
      console.error('General board search error for query "' + q + '": ' + (e instanceof Error ? e.message : String(e)));
      for (const b of GENERAL_BOARD_SCRAPERS) attempts[b.name].push({ fetched: false, structure: false, count: 0, status: 0 });
      continue;
    }
    GENERAL_BOARD_SCRAPERS.forEach((b, i) => {
      const o = outcomes[i] || { jobs: [], fetched: false, structure: false, status: 0 };
      attempts[b.name].push({ fetched: !!o.fetched, structure: !!o.structure, count: (o.jobs || []).length, status: o.status });
      for (const j of o.jobs || []) results.push(j);
    });
  }
  return { jobs: results, attempts: attempts };
}

async function searchIndeed(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://www.indeed.com/jobs?q=' + q + (loc ? '&l=' + loc : '') + '&fromage=14';
  const res = await fetchHtml(url);
  if (!res.ok) return { jobs: [], fetched: false, structure: false, status: res.status };
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
  const shellRe = /data-jk="[^"]*"|jcs-JobCard|job_seen_beacon|<article/i;
  return { jobs: jobs, fetched: true, structure: shellRe.test(html), status: res.status };
}

async function searchGlassdoor(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://www.glassdoor.com/Job/jobs.htm?sc.keyword=' + q + (loc ? '&locT=C&locId=' + loc : '') + '&fromAge=14';
  const res = await fetchHtml(url);
  if (!res.ok) return { jobs: [], fetched: false, structure: false, status: res.status };
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
  const shellRe = /data-job-id="[^"]*"|jobTitle|react-job-listing|JobCard|<article/i;
  return { jobs: jobs, fetched: true, structure: shellRe.test(html), status: res.status };
}

async function searchMonster(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://www.monster.com/jobs/search?q=' + q + (loc ? '&where=' + loc : '') + '&age=14';
  const res = await fetchHtml(url);
  if (!res.ok) return { jobs: [], fetched: false, structure: false, status: res.status };
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
  const shellRe = /data-job-id="[^"]*"|job-result|jobResult|jobCard|job-listing|<article/i;
  return { jobs: jobs, fetched: true, structure: shellRe.test(html), status: res.status };
}

async function searchLinkedIn(query, location) {
  const q = encodeURIComponent(query);
  const loc = location ? encodeURIComponent(location) : '';
  const url = 'https://www.linkedin.com/jobs/search?keywords=' + q + (loc ? '&location=' + loc : '') + '&f_TPR=r604800';
  const res = await fetchHtml(url);
  if (!res.ok) return { jobs: [], fetched: false, structure: false, status: res.status };
  const html = res.data;
  const jobs = [];

  // Split on each job card by the entity URN anchor
  const cards = html.split('data-entity-urn="urn:li:jobPosting:');
  for (let i = 1; i < cards.length && jobs.length < 20; i++) {
    const card = cards[i];

    // Job ID: digits up to the next quote
    const idMatch = card.match(/^([0-9]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];

    // Title: base-search-card__title"> up to <
    const titleMatch = card.match(/base-search-card__title"[^>]*>([^<]+)</);
    const title = titleMatch ? stripHtml(titleMatch[1]) : 'Unknown';

    // Company: base-search-card__subtitle"> then to </h4>, strip any nested <a> tag
    const companyMatch = card.match(/base-search-card__subtitle"[^>]*>([\\s\\S]*?)<\\/h4>/);
    let company = '';
    if (companyMatch) {
      company = stripHtml(companyMatch[1].replace(/<a[^>]*>/g, '').replace(/<\\/a>/g, ''));
    }

    // Location: job-search-card__location"> up to <
    const locationMatch = card.match(/job-search-card__location"[^>]*>([^<]+)</);
    const locationText = locationMatch ? stripHtml(locationMatch[1]) : '';

    // Posted date: job-search-card__listdate" datetime=" up to "
    const dateMatch = card.match(/job-search-card__listdate"[^>]*datetime="([^"]+)"/);
    const postedAt = dateMatch ? dateMatch[1] : null;

    // Apply URL: base-card__full-link" href=" up to "
    const urlMatch = card.match(/base-card__full-link"[^>]*href="([^"]+)"/);
    const applyUrl = urlMatch ? urlMatch[1] : ('https://www.linkedin.com/jobs/view/' + id);

    jobs.push({
      id: 'linkedin_' + id,
      title,
      company,
      location: locationText,
      applyUrl,
      source: 'LinkedIn',
      postedAt,
      salary: null,
    });
  }

  const shellRe = /data-entity-urn="urn:li:jobPosting:[^"]*"|base-card|base-SearchCard|jobs-search__results-list/i;
  return { jobs: jobs, fetched: true, structure: shellRe.test(html), status: res.status };
}

// ---------------------------------------------------------------- ATS collectors

// Classifies a failed ATS board fetch. A definitive HTTP 404 is a real answer: no
// board of that kind exists under that name, so there was never anything there to
// read. Everything else - timeout, connection failure, 5xx, or a payload we cannot
// read as a jobs array - means the question was never asked. There is no offline, so
// that case is a failure of this system and is recorded as one, whether the board was
// pinned by the caller or probed automatically.
function recordAtsFailure(byBoard, board, res, pinned) {
  if (res.status === 404) {
    if (pinned) {
      byBoard.push({ board: board, status: 'no-match', count: 0, note: 'The board does not exist: the ATS returned HTTP 404 for that board name. A definitive answer, not a retrieval failure.' });
    }
    return;
  }
  const detail = res.error ? ' (' + res.error + ')' : (res.status ? ' (HTTP ' + res.status + ')' : ' (no response)');
  byBoard.push({
    board: board,
    status: 'error',
    count: 0,
    note: (pinned ? 'Pinned board could not be retrieved' : 'Auto-probed board could not be retrieved') + detail + '. This source was never read, so nothing is known about what it lists.',
  });
}

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
      const nums = value.replace(/,/g, '').match(/[0-9]+(?:[.][0-9]+)?/g);
      if (nums && nums.length) {
        const vals = nums.map(Number);
        salaryMin = Math.min.apply(null, vals);
        salaryMax = Math.max.apply(null, vals);
        const cur = value.match(/([$£€])[^0-9]*[0-9]/);
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
  if (range && typeof range === 'string' && /[0-9]/.test(range)) {
    const nums = range.replace(/,/g, '').match(/[0-9]+(?:[.][0-9]+)?/g);
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
    recordAtsFailure(byBoard, 'greenhouse:' + boardToken, res, pinned);
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

async function collectAshby(boardName, cap, byBoard, pinned) {
  const url = 'https://api.ashbyhq.com/posting-api/job-board/' + encodeURIComponent(boardName) + '?includeCompensation=true';
  const res = await getJson(url);
  if (!res.ok || !res.data || !Array.isArray(res.data.jobs)) {
    recordAtsFailure(byBoard, 'ashby:' + boardName, res, !!pinned);
    return [];
  }
  const jobs = res.data.jobs.slice(0, cap).map((j) => fromAshby(j, boardName));
  if (jobs.length) byBoard.push({ board: 'ashby:' + boardName, status: 'ok', count: jobs.length, note: 'Public Ashby posting API. No key required.' });
  return jobs;
}

async function collectLever(company, cap, byBoard, pinned) {
  const url = 'https://api.lever.co/v0/postings/' + encodeURIComponent(company) + '?mode=json';
  const res = await getJson(url);
  if (!res.ok || !Array.isArray(res.data)) {
    recordAtsFailure(byBoard, 'lever:' + company, res, !!pinned);
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
  const probes = [];
  for (const url of candidates) {
    try {
      const res = await fetchHtml(url);
      // Several of these templates legitimately do not exist (404). That is a
      // different condition from "careers page found, no roles listed".
      if (!res.ok) { probes.push({ url: url, fetched: false, httpStatus: res.status, usable: false }); continue; }
      const html = res.data;
      probes.push({ url: url, fetched: true, httpStatus: res.status, usable: stripHtml(html).length >= 200 });
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
      probes.push({ url: url, fetched: false, httpStatus: 0, usable: false });
    }
  }
  // Nothing was found. Report which of the three conditions actually applies instead
  // of letting a totally unreachable site read as "company has no openings".
  const responded = probes.filter((pr) => pr.fetched);
  const usable = responded.filter((pr) => pr.usable);
  if (responded.length === 0) {
    byBoard.push({ board: 'company-site:' + company, status: 'error', count: 0, note: 'None of the ' + candidates.length + ' guessed career-page URLs responded (HTTP 404 or unreachable), so this company career page could not be read. This is a retrieval failure, not a company with no openings.' });
  } else if (usable.length === 0) {
    byBoard.push({ board: 'company-site:' + company, status: 'error', count: 0, note: responded.length + ' career-page URL(s) responded but returned empty or near-empty pages, so this source could not be read. This is a retrieval failure, not a company with no openings.' });
  } else {
    byBoard.push({ board: 'company-site:' + company, status: 'no-match', count: 0, note: usable.length + ' of ' + candidates.length + ' career-page URLs returned real pages, but no job-like links matched on them.' });
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
  listings = listings.concat(await collectAshby(t, maxPerBoard, byBoard, true));
}
for (const t of leverTokens) {
  listings = listings.concat(await collectLever(t, maxPerBoard, byBoard, true));
}

// Tier 1: otherwise probe ATS platforms for each named company, first hit wins.
if (ghTokens.length === 0 && ashbyTokens.length === 0 && leverTokens.length === 0 && companies.length > 0) {
  for (const company of companies) {
    const token = slug(company);
    if (!token) continue;
    let found = false;
    for (const probe of [
      { ats: 'greenhouse', fn: () => collectGreenhouse(token, maxPerBoard, byBoard, enrich, false) },
      { ats: 'ashby', fn: () => collectAshby(token, maxPerBoard, byBoard, false) },
      { ats: 'lever', fn: () => collectLever(token, maxPerBoard, byBoard, false) },
    ]) {
      if (found) break;
      const rows = await probe.fn();
      if (rows.length > 0) { found = true; listings = listings.concat(rows); }
    }
    // If ATS probes didn't find anything, try scraping the company's career pages.
    if (!found) {
      const siteRows = await searchCompanyCareerPage(company, maxPerBoard, byBoard, queries);
      if (siteRows && siteRows.length) { found = true; listings = listings.concat(siteRows); }
    }
  }
}

// Also search general job boards (Indeed, Glassdoor, Monster, LinkedIn, Wellfound) by
// scraping their public search pages. No API keys needed. Each board gets its own ledger
// entry carrying the real outcome of its scraper.
if (queries.length) {
  const loc = locations.length ? locations[0] : '';
  const general = await searchGeneralBoards(queries, loc);
  for (const b of GENERAL_BOARD_SCRAPERS) {
    const summary = summarizeBoard(general.attempts[b.name] || [], b.name);
    byBoard.push({
      board: 'general-board:' + b.name,
      status: summary.status,
      count: summary.count,
      note: 'Scraped from ' + b.name + ' public search: ' + summary.reason,
      queries: queries.length,
    });
  }
  if (general.jobs.length) {
    listings = listings.concat(general.jobs.slice(0, maxPerBoard * 2));
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
const okBoards = byBoard.filter((b) => b.status === 'ok');
const noMatchBoards = byBoard.filter((b) => b.status === 'no-match');
// Sources that could not be retrieved, or could not be read once retrieved. There is
// no offline, so every one of these is a failure of this system. They are never folded
// into "no matches" and never softened into an advisory on an otherwise passing run.
const failures = byBoard.filter((b) => b.status === 'error');
const failureSummary = failures.length
  ? failures.length + ' of ' + byBoard.length + ' source' + (byBoard.length === 1 ? '' : 's') +
    ' could not be retrieved: ' + failures.map((b) => b.board).join(', ') +
    '. Those sources were never read, so this run is PARTIAL \u2014 it is not a complete answer about the job market.'
  : null;

fs.writeFileSync(storagePath, JSON.stringify({
  listings: deduped,
  total: deduped.length,
  byBoard,
  failures: failures.map((b) => ({ board: b.board, status: b.status, note: b.note })),
  failureCount: failures.length,
  generatedAt: new Date().toISOString(),
}, null, 2));

// Run-level outcome. A source that answered and genuinely had nothing is a real
// answer, so a run made only of those is a success whose answer is zero. A source
// that could not be retrieved or could not be read is a failure, and is surfaced
// through success / status / error rather than as advice the caller has to act on.
const consulted = byBoard.length;
const answered = okBoards.length + noMatchBoards.length;
// An explicitly pinned ATS board counts as something to search, even with no company
// name and no query: the caller named the board they wanted read.
const nothingToSearch = companies.length === 0 && queries.length === 0 &&
  ghTokens.length === 0 && ashbyTokens.length === 0 && leverTokens.length === 0;

let runSuccess = true;
let runStatus = 'ok';
let runError = null;

if (nothingToSearch) {
  runSuccess = false;
  runStatus = 'blocked';
  runError = 'Nothing to search. Provide "companies" (e.g., ["Google", "Microsoft"]) to check their job boards, "queries" (e.g., ["Engineering Manager"]) to search general and company job boards, or "boardTokens" to pin an exact ATS board.';
} else if (consulted === 0 || answered === 0) {
  // Every source this run consulted failed. A run that could not answer its own
  // question is a failure, not a thin result, and it must not read as "no jobs exist".
  runSuccess = false;
  runStatus = 'failed';
  runError = 'JOB DISCOVERY FAILED. All ' + consulted + ' source' + (consulted === 1 ? '' : 's') +
    ' this run tried could not be retrieved or read: ' + failures.map((b) => b.board).join(', ') +
    '. No job board was successfully searched, so this run produced no answer at all about the job market \u2014 it did not determine that no jobs exist. Every failure is listed under "Retrieval failures" below.';
} else if (failures.length > 0) {
  // Some sources answered, others could not be retrieved. The run produced a real
  // partial answer, and the sources it could not reach are reported as errors.
  runStatus = 'partial';
  runError = failureSummary;
}

let note;
if (runStatus === 'blocked' || runStatus === 'failed') {
  note = runError;
} else if (deduped.length > 0) {
  note = 'Found ' + deduped.length + ' listing' + (deduped.length === 1 ? '' : 's') + ' across ' +
    okBoards.length + ' board' + (okBoards.length === 1 ? '' : 's') + ' (' + beforeFilter + ' raw, ' + deduped.length + ' after filtering).' +
    (runError ? ' ' + runError : '');
} else if (okBoards.length > 0) {
  note = 'Reached ' + okBoards.length + ' board' + (okBoards.length === 1 ? '' : 's') + ' but nothing matched your filters (' + beforeFilter + ' listings were returned). Widen your search or add more companies.' +
    (runError ? ' ' + runError : '');
} else {
  // Every board this run consulted was successfully retrieved and parsed, and every
  // one of them genuinely had no matching roles. That is a real, complete answer.
  note = 'No listings found. All ' + noMatchBoards.length + ' board' + (noMatchBoards.length === 1 ? '' : 's') +
    ' checked were conclusively consulted and found no matches for these filters.' +
    (companies.length === 0 && queries.length > 0
      ? ' Searched general job boards (Indeed, Glassdoor, Monster, LinkedIn, Wellfound) for "' + queries.join(', ') +
        '" and found no matches. No company names were provided. Try different search terms or specify companies to check their career pages directly.'
      : ' Try different search terms, or add more companies to check their career pages directly.') +
    (runError ? ' ' + runError : '');
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

if (noMatchBoards.length > 0) {
  const noMatchLines = ['No matches from (successfully retrieved, structure recognised, nothing matched):'];
  noMatchBoards.forEach(function (b) { noMatchLines.push('  ' + b.board + ' \u2014 ' + b.note); });
  presentBlocks.push({ id: 'no-match', title: 'Sources with no matches', kind: 'text', body: noMatchLines.join('\\n') });
}

if (failures.length > 0) {
  // A retrieval failure is a failure, so it is labelled and headed as one. There is no
  // "unverified" middle state left: a source either answered, or this system could not
  // read it and the run says so.
  const failureLines = [
    'RETRIEVAL FAILURE: ' + failures.length + ' source' + (failures.length === 1 ? '' : 's') +
    ' could not be retrieved or read. This is a failure of this system, not an empty job market.',
    '',
  ];
  failures.forEach(function (b) { failureLines.push('  [FAILED] ' + b.board + ' \u2014 ' + b.note); });
  presentBlocks.push({ id: 'errors', title: 'Retrieval failures (' + failures.length + ') \u2014 these sources were never read', kind: 'text', body: failureLines.join('\\n') });
}

if (runStatus === 'failed') {
  // A run where nothing could be read is unmistakably a failure: it leads the output,
  // it names every source it tried, and it refuses to read as "no jobs exist".
  const lines = [
    'JOB DISCOVERY FAILED',
    '===================',
    '',
    'None of the ' + consulted + ' source' + (consulted === 1 ? '' : 's') + ' this run tried could be retrieved or read.',
    'No job board was successfully searched. This run produced no answer about the job market,',
    'and in particular it did NOT determine that no jobs exist.',
    '',
    'Sources attempted:',
  ];
  failures.forEach(function (b) { lines.push('  ' + b.board + ' \u2014 ' + b.note); });
  presentBlocks.unshift({ id: 'failure', title: 'Job discovery FAILED \u2014 no source could be retrieved', kind: 'text', body: lines.join('\\n') });
}

console.log(JSON.stringify({
  success: runSuccess,
  status: runStatus,
  data: {
    listings: deduped,
    total: deduped.length,
    byBoard,
    failures: failures.map((b) => ({ board: b.board, status: b.status, note: b.note })),
    failureCount: failures.length,
    note,
  },
  error: runError,
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
    'Reads the public Greenhouse, Ashby and Lever job board APIs with no key required. Reports a per-source ' +
    'status derived from the real outcome of each scraper (ok / no-match / error). A source that was retrieved ' +
    'and genuinely had no matching roles is a real answer (no-match); a source that could not be retrieved or ' +
    'could not be parsed is a failure, surfaced as status "partial" or "failed" with a non-null error, never as ' +
    'a caveat on a passing run.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: CAREER_JOB_DISCOVERY_SOURCE,
    configSchema: CAREER_BASE_CONFIG_SCHEMA,
    actionLabel: 'Discover jobs',
    readsEnvironment: ['CAREER_HOME'],
  },
  inputSchema: CAREER_JOB_DISCOVERY_INPUT,
  outputSchema: careerResultSchema('Job listings, per-board source status (ok / no-match / error), the per-source retrieval failures, and search metadata'),
  triggers: [
    { kind: 'user', phrase_examples: ['Discover jobs', 'Search job boards', 'Find new listings'] },
  ],
});
CAREER_JOB_DISCOVERY.configSchema = CAREER_JOB_DISCOVERY.manifest.configSchema as SchemaRecord;

export { CAREER_JOB_DISCOVERY };
