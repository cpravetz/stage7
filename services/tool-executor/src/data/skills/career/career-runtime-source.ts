// Shared runtime for every career source collector.
//
// career-job-discovery runs as a single JavaScript program in a spawned `node`
// child process, so the runtime has to be plain source text assembled into that
// program rather than a TypeScript module that can be imported. Each career
// source file imports these fragments and concatenates them.
//
// What lives here:
//   - the HTTP layer every collector shares (User-Agent, timeout, redirect
//     policy, retry with exponential backoff and jitter)
//   - parsing helpers (HTML entities, NaN-safe dates, safe URL encoding)
//   - the Job normalizer, so every source produces the same shape
//
// Design notes that are easy to get wrong and are load-bearing:
//
// User-Agent. Node's built-in fetch sends no User-Agent at all, and a large
// share of public job APIs and WAF-fronted boards reject a request that
// carries none. We send an honest, identifiable UA. This is NOT a
// circumvention: it identifies the crawler rather than impersonating a
// browser, and it does not solve or relay challenges.
//
// Redirects. Every request sets `redirect: 'manual'` and we re-validate the
// host of each hop before following it, bounded by MAX_REDIRECTS. A server
// redirect can otherwise point a request at an internal address after the
// hostname guard already passed the original host, and an unbounded chain is
// a request loop. Callers that want a hard failure use `allowRedirects: false`.

export const CAREER_RUNTIME_SOURCE = String.raw`
const CAREER_DEFAULT_USER_AGENT =
  'Stage7CareerAgent/1.0 (+https://github.com/stage7; public job board reader)';

// Tunable network & concurrency defaults. Overridable by \`input.*\` or env vars.
let REQUEST_TIMEOUT_MS = 20000;
let MAX_RETRIES = 2;
let RETRY_BASE_DELAY_MS = 500;
let RETRY_MAX_DELAY_MS = 8000;
let MAX_REDIRECTS = 3;
let ENRICH_CONCURRENCY = 6;
let INTER_REQUEST_DELAY_MS = 0;

REQUEST_TIMEOUT_MS = numOr(input.requestTimeoutMs != null ? input.requestTimeoutMs : ctx.config?.requestTimeoutMs, REQUEST_TIMEOUT_MS);
MAX_RETRIES = Math.max(0, numOr(input.requestRetries != null ? input.requestRetries : ctx.config?.requestRetries, MAX_RETRIES));
RETRY_BASE_DELAY_MS = Math.max(0, numOr(input.requestRetryBaseMs != null ? input.requestRetryBaseMs : ctx.config?.requestRetryBaseMs, RETRY_BASE_DELAY_MS));
RETRY_MAX_DELAY_MS = Math.max(RETRY_BASE_DELAY_MS, numOr(input.requestRetryMaxMs != null ? input.requestRetryMaxMs : ctx.config?.requestRetryMaxMs, RETRY_MAX_DELAY_MS));
ENRICH_CONCURRENCY = Math.max(1, numOr(input.perSourceConcurrency != null ? input.perSourceConcurrency : ctx.config?.perSourceConcurrency, ENRICH_CONCURRENCY));
INTER_REQUEST_DELAY_MS = Math.max(0, numOr(input.interRequestDelayMs != null ? input.interRequestDelayMs : ctx.config?.interRequestDelayMs, INTER_REQUEST_DELAY_MS));

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  if (!(ms > 0)) return Promise.resolve();
  return new Promise((res) => setTimeout(res, ms));
}

// Exponential backoff with full jitter. Jitter matters: a run that walks many
// boards in lockstep would otherwise retry in lockstep too, which is exactly
// the burst pattern a rate limiter is looking for.
function retryDelayMs(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) {
      // Clamp: a hostile Retry-After must not be able to stall the sweep.
      return Math.min(secs * 1000, RETRY_MAX_DELAY_MS);
    }
  }
  const exp = Math.min(RETRY_BASE_DELAY_MS * Math.pow(2, Math.max(0, attempt - 1)), RETRY_MAX_DELAY_MS);
  return Math.floor(exp / 2 + Math.random() * (exp / 2));
}

function hostnameOf(raw) {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}

// Resolves only the origin from a config-derived URL and discards the caller's
// path, port, query and fragment. Rebuilding the origin by hand (rather than
// using \`new URL(raw).origin\`) is deliberate: .origin carries the input's own
// port through unchanged, which reopens exactly what discarding the path was
// meant to close. A provider appends its own fixed path to this.
function originFromConfigUrl(raw) {
  const hostname = hostnameOf(raw);
  if (!hostname) return null;
  return 'https://' + hostname;
}

// Anchored whole-hostname test for wildcard-tenant ATS domains
// (\`<tenant>.<vendor-domain>\`). Deliberately not a RegExp: the emitted program
// is assembled through a template literal, where a backslash escape inside a
// \`new RegExp('...')\` string argument is consumed before the script is ever
// parsed. That is exactly the shape that shipped a production salary-parsing
// bug, so the anchor is checked with string operations instead.
//
// The leading dot on the suffix test is load-bearing: a bare
// \`endsWith('vendordomain.com')\` also accepts \`evilvendordomain.com\`.
function matchesTenantHost(hostname, vendorDomain) {
  if (!hostname || !vendorDomain) return false;
  const host = String(hostname).toLowerCase();
  const domain = String(vendorDomain).toLowerCase().replace(/^[.]+/, '');
  if (host.length <= domain.length + 1) return false;
  if (!host.endsWith('.' + domain)) return false;
  // Everything before the vendor domain must be a single legal tenant label.
  const tenant = host.slice(0, host.length - domain.length - 1);
  return /^[a-z0-9-]+$/.test(tenant);
}

function isPrivateHostname(hostname) {
  if (!hostname) return true;
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname.endsWith('.internal')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    const parts = hostname.split('.').map(Number);
    if (parts.some((p) => p > 255)) return true;
    if (parts[0] === 10 || parts[0] === 127 || parts[0] === 0) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    return false;
  }
  if (hostname.startsWith('[') || hostname.includes(':')) return true; // IPv6 literal
  if (hostname.startsWith('fc') || hostname.startsWith('fd') || hostname.startsWith('fe80')) return true;
  return false;
}

// One HTTP request with timeout, redirect handling and bounded retry.
//
// Returns { ok, status, data, error }. \`data\` is parsed JSON when expectJson,
// otherwise the response text. On a non-retryable failure it returns
// immediately with the status the server actually gave, so the ledger can name
// the real condition (blocked / 404 / 5xx) instead of a catch-all.
async function httpRequest(url, options) {
  const opts = options || {};
  const method = opts.method || 'GET';
  const expectJson = opts.expectJson !== false;
  const extraHeaders = opts.headers || {};
  const body = opts.body === undefined ? undefined : JSON.stringify(opts.body);
  const allowRedirects = opts.allowRedirects !== false;
  // When set, every hop (and the first request) must resolve to one of these
  // hosts. Providers whose URL is built from portals.yml data set this so a
  // redirect cannot walk the request off-origin.
  const allowedHosts = opts.allowedHosts || null;

  let currentUrl = url;
  let lastStatus = 0;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    if (attempt > 1) await sleep(retryDelayMs(attempt - 1, null));

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const hostname = hostnameOf(currentUrl);
      if (!hostname) {
        return { ok: false, status: 0, data: null, error: 'malformed URL: ' + currentUrl };
      }
      if (isPrivateHostname(hostname)) {
        return { ok: false, status: 0, data: null, error: 'refusing to request a private or internal host (' + hostname + ')' };
      }
      if (allowedHosts && !allowedHosts.some(function (h) { return hostname === h || matchesTenantHost(hostname, h); })) {
        return { ok: false, status: 0, data: null, error: 'refusing to request off-origin host (' + hostname + ')' };
      }

      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, opts.timeoutMs || REQUEST_TIMEOUT_MS);
      let res;
      try {
        const headers = Object.assign({
          'User-Agent': CAREER_DEFAULT_USER_AGENT,
          'Accept': expectJson ? 'application/json, text/plain, */*' : 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
        }, extraHeaders);
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        res = await fetch(currentUrl, {
          method: method,
          body: body,
          redirect: 'manual',
          signal: controller.signal,
          headers: headers,
        });
      } catch (err) {
        clearTimeout(timer);
        // Transport-level failure (DNS, refused, aborted, manual-redirect
        // unsupported): the status really is 0 and this really is a network
        // failure, so it is retryable.
        lastStatus = 0;
        lastError = err && err.message ? err.message : String(err);
        if (attempt <= MAX_RETRIES) { hop = MAX_REDIRECTS + 1; break; }
        return { ok: false, status: 0, data: null, error: lastError };
      }
      clearTimeout(timer);

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers && res.headers.get ? res.headers.get('location') : null;
        // Bail the instant a hop points off-origin or we run out of hops.
        // Re-validating every hop (not just the first request) is what catches a
        // later hop redirecting away.
        if (!allowRedirects) {
          return { ok: false, status: res.status, data: null, error: 'redirect not followed (HTTP ' + res.status + ')', location: location };
        }
        if (!location || hop >= MAX_REDIRECTS) {
          return { ok: false, status: res.status, data: null, error: 'redirect chain exhausted or target missing (HTTP ' + res.status + ')' };
        }
        let next;
        try {
          next = new URL(location, currentUrl).toString();
        } catch (e) {
          return { ok: false, status: res.status, data: null, error: 'unparseable redirect target' };
        }
        currentUrl = next;
        continue;
      }

      lastStatus = res.status;
      lastError = null;

      if (!res.ok) {
        if (RETRYABLE_STATUS.has(res.status)) {
          const retryAfter = res.headers && res.headers.get ? res.headers.get('retry-after') : null;
          lastError = 'HTTP ' + res.status;
          if (attempt <= MAX_RETRIES) {
            await sleep(retryDelayMs(attempt, retryAfter));
            break;
          }
          return { ok: false, status: res.status, data: null, error: 'HTTP ' + res.status + ' after ' + attempt + ' attempt(s)' };
        }
        // A non-retryable 4xx. 404 in particular is permanent and no backoff
        // will clear it, so it is returned immediately and named as what it is.
        return { ok: false, status: res.status, data: null, error: 'HTTP ' + res.status };
      }

      try {
        if (expectJson) {
          const data = await res.json();
          return { ok: true, status: res.status, data: data };
        }
        const text = await res.text();
        return { ok: true, status: res.status, data: text };
      } catch (err) {
        // A 2xx whose body will not parse is a broken source, not an empty one.
        return { ok: false, status: res.status, data: null, error: 'response body was not valid ' + (expectJson ? 'JSON' : 'text') };
      }
    }
  }

  return { ok: false, status: lastStatus, data: null, error: lastError || 'Max retries exceeded' };
}

async function httpGet(url, options) {
  return await httpRequest(url, Object.assign({ method: 'GET' }, options || {}));
}

async function getJson(url, options) {
  return await httpGet(url, Object.assign({ expectJson: true }, options || {}));
}

async function fetchHtml(url, options) {
  return await httpGet(url, Object.assign({ expectJson: false }, options || {}));
}

// Some sources (Workday CXS) only serve their search route over POST with a
// JSON filter body. This shares the same manual-redirect hop logic, so a 3xx is
// not silently followed on POST either.
async function postJson(url, body, options) {
  return await httpRequest(url, Object.assign({ method: 'POST', body: body, expectJson: true }, options || {}));
}
`;

// Parsing helpers shared by every collector.
//
// NOTE ON ESCAPING: this string is embedded in a JavaScript program that is
// written to disk and executed, so regex literals and backslashes here are
// String.raw and must be written exactly as they should appear in that
// program. A \`\\s\` in this file is a literal backslash-s in the emitted
// program, which is what a regex literal needs.
export const CAREER_HELPERS_SOURCE = String.raw`
// ---------------------------------------------------------------- helpers

function asList(v) {
  if (v == null) return [];
  if (Array.isArray(v)) return v.filter((x) => x !== null && x !== undefined && String(x).trim() !== '').map(String);
  return String(v).trim() === '' ? [] : [String(v)];
}

function numOr(v, dflt) {
  if (v === null || v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// HTML entities, numeric (decimal and hex) and the named set that actually
// shows up in job markup. One decoder, not a per-source private copy: a
// combined decimal|hex regex that misparses one form as the other is a known
// failure mode, so decode numeric forms first and separately.
const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–',
  mdash: '—', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  hellip: '…', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü',
  ouml: 'ö', auml: 'ä', szlig: 'ß', deg: '°', euro: '€', pound: '£',
  yen: '¥', cent: '¢', sect: '§', para: '¶', dagger: '†', permil: '‰',
  laquo: '«', raquo: '»', times: '×', divide: '÷', plusmn: '±',
};

function decodeEntities(input) {
  if (!input) return '';
  let s = String(input);
  s = s.replace(/&#x([0-9a-f]+);/gi, function (_m, hex) {
    const code = parseInt(hex, 16);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
  s = s.replace(/&#(\d+);/g, function (_m, dec) {
    const code = parseInt(dec, 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
  });
  s = s.replace(/&([a-z][a-z0-9]*);/gi, function (m, name) {
    const key = name.toLowerCase();
    return Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key) ? NAMED_ENTITIES[key] : m;
  });
  return s;
}

function stripHtml(html) {
  if (!html) return '';
  return decodeEntities(
    String(html)
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
  )
    .replace(/[\s ]+/g, ' ')
    .trim();
}

// NaN-safe date parse. \`Date.parse(s) || undefined\` is wrong twice: it also
// nulls a valid epoch 0, and Date.parse returns NaN for anything unparseable,
// which is falsy so it happens to work — but the \`0\` case silently drops a real
// 1970 timestamp. Check Number.isNaN explicitly.
function toEpochMs(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function toIsoOrNull(value) {
  const ms = toEpochMs(value);
  if (ms === null) return null;
  try {
    return new Date(ms).toISOString();
  } catch (e) {
    return null;
  }
}

// Encodes a HOST-CONTROLLED id/slug that becomes a URL path segment.
// encodeURIComponent throws URIError on a lone UTF-16 surrogate, and a
// "\uD800" escape survives JSON.parse — the throw would abort the whole page's
// loop and lose every posting already parsed. Returning null lets the caller
// drop exactly the one bad posting.
function safeSegment(value) {
  if (value === null || value === undefined) return null;
  try {
    return encodeURIComponent(String(value));
  } catch (e) {
    return null;
  }
}

function slug(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '');
}

function stableId(prefix, parts) {
  let h = 5381;
  const str = parts.join('|').toLowerCase();
  for (let i = 0; i < str.length; i++) {
    h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  }
  return prefix + '_' + h.toString(36);
}

function truncate(s, n) {
  const str = String(s == null ? '' : s);
  return str.length > n ? str.slice(0, n) : str;
}

// Reads the single numeric value out of a free-text salary string
// ("$120,000 - $150,000 USD", "120k-150k").
function parseSalaryText(text) {
  if (!text) return null;
  const raw = String(text);
  // The digit classes below carry no backslash on purpose. The emitted program
  // is assembled through a template literal, so a "\d" in a regex literal here
  // would be consumed before the script is ever parsed and the effective
  // pattern would silently become /d+(?:.d+)?/ \u2014 which matches no digits.
  // That shipped as a production salary-parsing bug.
  const nums = raw.replace(/,/g, '').match(/[0-9]+(?:[.][0-9]+)?/g);
  if (!nums || !nums.length) return null;
  const values = nums.map((n) => {
    // "120k" / "150K" mean thousands.
    const k = /[0-9.]+k/i.test(n);
    return Number(n.replace(/k$/i, '')) * (k ? 1000 : 1);
  }).filter((n) => Number.isFinite(n) && n > 0);
  if (!values.length) return null;
  let currency = null;
  if (/€|\bEUR\b/i.test(raw)) currency = 'EUR';
  else if (/£|\bGBP\b/i.test(raw)) currency = 'GBP';
  else if (/\$|\bUSD\b/i.test(raw)) currency = 'USD';
  else if (/\bCAD\b/i.test(raw)) currency = 'CAD';
  else if (/\bAUD\b/i.test(raw)) currency = 'AUD';
  else if (/\bINR\b|₹/i.test(raw)) currency = 'INR';
  return { min: Math.min.apply(null, values), max: Math.max.apply(null, values), currency: currency, raw: truncate(raw, 200) };
}

function normalizeSalaryRange(range) {
  if (!isPlainObject(range)) return null;
  const min = numOr(range.min, null);
  const max = numOr(range.max, null);
  if (min === null && max === null) return null;
  return {
    min: min !== null ? min : max,
    max: max !== null ? max : min,
    currency: range.currency || range.currencyCode || null,
    raw: truncate(range.raw || range.shortText || '', 200),
  };
}
`;

// The normalized Job shape, plus the ledger writer.
//
// Every collector builds a job through \`makeJob\` so that a listing from a
// Workday JSON API and one from a scraped HTML card rank on the same axes. The
// previous shape was built ad hoc per collector, which meant scraped listings
// silently had no description, no remote flag and no employment type — and
// career-rank then scored them as 0.5 on three of five axes purely because of
// which collector produced them.
export const CAREER_JOB_SHAPE_SOURCE = String.raw`
// The single normalized Job shape. \`source\` is the provider id (lowercase, no
// spaces) so the ledger and the UI can group by it.
function makeJob(fields) {
  const title = stripHtml(fields.title || '');
  const company = stripHtml(fields.company || '');
  const location = stripHtml(fields.location || '');
  const description = stripHtml(fields.description || '');
  const applyUrl = typeof fields.applyUrl === 'string' && /^https:\/\//i.test(fields.applyUrl) ? fields.applyUrl : '';
  const salary = fields.salary === undefined ? null : fields.salary;
  const remote = fields.remote === true || /\bremote\b/i.test(location);
  return {
    id: String(fields.id || stableId(String(fields.source || 'job'), [title, company, applyUrl])),
    title: title,
    company: company,
    location: location,
    remote: remote,
    description: description,
    applyUrl: applyUrl,
    // Where we read it from, e.g. "greenhouse" or "remoteok". Distinct from
    // applyUrl, which is where the candidate applies.
    source: String(fields.source || ''),
    // The canonical page for the posting on the source we read it from.
    sourceUrl: typeof fields.sourceUrl === 'string' ? fields.sourceUrl : '',
    postedAt: toIsoOrNull(fields.postedAt),
    employmentType: stripHtml(fields.employmentType || ''),
    department: stripHtml(fields.department || ''),
    salary: salary,
  };
}

// A row missing title or applyUrl cannot be acted on: the candidate could not
// apply to it and could not read it. Drop it, never throw — one bad row must
// not cost the target every other posting on the page.
function isUsableJob(job) {
  return !!job && !!job.title && !!job.applyUrl;
}
`;
