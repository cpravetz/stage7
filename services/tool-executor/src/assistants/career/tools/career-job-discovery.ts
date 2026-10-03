// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { careerResultSchema } from '../career-contract';

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
// ---------------------------------------------------------------- assembly
//
// The skill used to run as one JavaScript program in a spawned `node` child, so its
// source was assembled from six fragment files (helpers, runtime, job shape, ATS
// providers, public feeds, portal registry, collector). The body below is that same
// program, verbatim, as an inline handler: the fragments were concatenated in
// dependency order and the four places they reached outside the handler were
// rewired - `__tool_input` became the `input` parameter, the `fs`/`path` requires
// were dropped, `baseDir` was dropped in favour of `ctx.store`, and the two
// `console.log(JSON.stringify(...))` emissions became `return` statements.
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

export const CAREER_JOB_DISCOVERY: Tool = createDeclarativeCodeSkill({
  id: 'career-job-discovery',
  name: 'Job Discovery',
  description: 'Finds real job listings from public, no-auth sources and returns normalized postings.',
  persistenceEnvVar: 'CAREER_HOME',
  configSchema: CAREER_BASE_CONFIG_SCHEMA,
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
  tier: 'advise',
  domainKnowledge: 'Job board search & discovery operations across ATS systems, public feeds, and aggregator APIs.',
  isSkill: false,
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    readsEnvironment: ['CAREER_HOME', 'CAREER_REQUEST_TIMEOUT_MS', 'CAREER_REQUEST_RETRIES', 'CAREER_REQUEST_RETRY_BASE_MS', 'CAREER_REQUEST_RETRY_MAX_MS', 'CAREER_PER_SOURCE_CONCURRENCY', 'CAREER_INTER_REQUEST_DELAY_MS'],
    // A discovery run reads many sources, paginates them, and can enrich each
    // posting with a detail request. The previous 30s default was shared with
    // every other code skill and could SIGKILL a legitimate multi-source sweep,
    // losing the whole run with an opaque timeout.
    timeoutMs: 240000,
  },
  handler: async function handler(input, ctx) {

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

    // ---------------------------------------------------------------- ATS providers
    //
    // Every provider here reads a public, no-auth endpoint that the employer (or
    // their ATS vendor) published for public consumption. Each declares the host
    // shape it will accept so a config-derived URL cannot be pointed somewhere
    // else.

    // Restricts a config-derived request to the hosts the provider legitimately
    // contacts: the entry's own host plus every vendor domain the provider uses to
    // reach its API. Pinning only the entry's host would block the provider's own
    // API host; pinning only the vendor hosts would defeat the point of the guard.
    //
    // Only applied when the entry supplied a URL. A provider with a fixed literal
    // host and no config input needs nothing.
    function providerHttpOptions(entry, provider) {
      const opts = {};
      const hosts = [];
      for (const raw of [entry && entry.api, entry && entry.careers_url]) {
        if (typeof raw !== 'string' || !raw) continue;
        const h = hostnameOf(raw);
        if (h) hosts.push(h);
      }
      if (provider && Array.isArray(provider.vendorDomains)) hosts.push(...provider.vendorDomains);
      if (!hosts.length) return opts;
      opts.allowedHosts = [...new Set(hosts)];
      return opts;
    }

    // Whether a fixed-host provider may claim this entry during auto-detection.
    //
    // A provider whose board identifier is a bare slug (Greenhouse, Lever, Ashby
    // build their URL from the company name) must NOT claim an entry that points at
    // a different vendor's careers page: "Deloitte" carries a Workday URL, and the
    // slug "deloitte" would otherwise be probed against Greenhouse. An explicit
    // \`provider:\` field still overrides this — the operator asked for it by name.
    function providerMayClaim(provider, entry) {
      if (!provider || !Array.isArray(provider.vendorDomains) || !provider.vendorDomains.length) return true;
      const supplied = [entry && entry.api, entry && entry.careers_url];
      let sawHost = false;
      for (const raw of supplied) {
        if (typeof raw !== 'string' || !raw) continue;
        const h = hostnameOf(raw);
        if (!h) continue;
        sawHost = true;
        const owned = provider.vendorDomains.some(function (d) {
          // String comparison rather than a built RegExp: a dynamic pattern would
          // have to be assembled from a string literal, where the enclosing
          // template literal can eat a backslash escape before the script parses.
          const clean = String(d).toLowerCase().replace(/^[.]+/, '');
          const h = String(hostname).toLowerCase();
          return h === clean || h.endsWith('.' + clean);
        });
        if (!owned) return false;
      }
      // No URL supplied: the slug is all there is, so the provider may try it.
      return !sawHost || true;
    }

    // Reads the documented array out of a payload, or returns null so the caller
    // can tell "absent / wrong type" from "present and empty". An absent container
    // is a markup or API change and must surface as a failure, not as zero jobs.
    function pickArray(payload, keys) {
      if (!isPlainObject(payload)) return null;
      for (const key of keys) {
        if (Array.isArray(payload[key])) return payload[key];
      }
      return null;
    }

    // --- Greenhouse ------------------------------------------------------------
    // https://boards-api.greenhouse.io/v1/boards/<token>/jobs
    const greenhouseProvider = {
      id: 'greenhouse',
      vendorDomains: ['boards-api.greenhouse.io', 'boards.greenhouse.io', 'my.greenhouse.io'],
      listUrl: function (entry) {
        const token = entry && entry.token ? entry.token : slug(entry && (entry.name || entry.company));
        if (!token) return null;
        return 'https://boards-api.greenhouse.io/v1/boards/' + encodeURIComponent(token) + '/jobs';
      },
      rows: function (payload, entry) {
        const jobs = pickArray(payload, ['jobs']);
        if (jobs === null) throw new Error('greenhouse: unexpected response, expected jobs[]');
        const token = entry && entry.token ? entry.token : slug(entry && (entry.name || entry.company));
        const company = (entry && entry.company) || (entry && entry.name) || token;
        return jobs.map(function (j) {
          return makeJob({
            id: 'gh_' + String(j.id || stableId('gh', [j.title, company])),
            title: j.title,
            company: j.company_name || company,
            location: isPlainObject(j.location) ? j.location.name : j.location,
            description: j.content || '',
            applyUrl: j.absolute_url || '',
            source: 'greenhouse',
            sourceUrl: token ? 'boards.greenhouse.io/' + token : '',
            postedAt: j.updated_at || j.first_published,
            employmentType: 'full-time',
            salary: (function () {
              const meta = Array.isArray(j.metadata) ? j.metadata : [];
              for (const m of meta) {
                if (m && /salary|compensation|pay range|pay/i.test(String(m.name || ''))) {
                  return parseSalaryText(m.value);
                }
              }
              return null;
            })(),
          });
        });
      },
      // Greenhouse omits descriptions from the list endpoint; they live on a
      // per-job detail route. This is the opt-in enrichment path and it is bounded
      // and skipped entirely during a probe.
      detail: async function (job, entry, ctx) {
        const token = entry && entry.token ? entry.token : slug(entry && (entry.name || entry.company));
        const raw = String(job.id || '').replace(/^gh_/, '');
        if (!token || !raw) return;
        const d = await getJson('https://boards-api.greenhouse.io/v1/boards/' + encodeURIComponent(token) + '/jobs/' + encodeURIComponent(raw));
        if (d.ok && d.data && d.data.content) job.description = stripHtml(d.data.content);
      },
    };

    // --- Ashby -----------------------------------------------------------------
    // https://api.ashbyhq.com/posting-api/job-board/<name>
    const ashbyProvider = {
      id: 'ashby',
      vendorDomains: ['api.ashbyhq.com', 'jobs.ashbyhq.com'],
      listUrl: function (entry) {
        const name = entry && entry.token ? entry.token : slug(entry && (entry.name || entry.company));
        if (!name) return null;
        return 'https://api.ashbyhq.com/posting-api/job-board/' + encodeURIComponent(name) + '?includeCompensation=true';
      },
      rows: function (payload, entry) {
        const jobs = pickArray(payload, ['jobs']);
        if (jobs === null) throw new Error('ashby: unexpected response, expected jobs[]');
        const name = (entry && (entry.company || entry.name)) || '';
        return jobs.map(function (j) {
          let salary = null;
          const comp = isPlainObject(j.compensation) ? j.compensation : null;
          if (comp) {
            if (Array.isArray(comp.summaryComponents)) {
              for (const c of comp.summaryComponents) {
                if (c && c.compensationType === 'Salary' && c.minValue != null) {
                  salary = normalizeSalaryRange({ min: c.minValue, max: c.maxValue, currency: c.currencyCode, raw: c.summary || '' });
                }
              }
            }
            if (!salary) salary = parseSalaryText(comp.scrapeableCompensationSalarySummary || comp.compensationTierSummary || '');
          }
          return makeJob({
            id: 'ash_' + String(j.id || stableId('ash', [j.title, name])),
            title: j.title,
            company: name,
            location: j.location,
            remote: j.isRemote === true,
            description: j.descriptionPlain || j.descriptionHtml,
            applyUrl: j.applyUrl || j.jobUrl,
            source: 'ashby',
            sourceUrl: j.jobUrl || '',
            postedAt: j.publishedAt,
            employmentType: j.employmentType,
            department: j.department || j.team,
            salary: salary,
          });
        });
      },
    };

    // --- Lever -----------------------------------------------------------------
    // https://api.lever.co/v0/postings/<company>?mode=json
    const leverProvider = {
      id: 'lever',
      vendorDomains: ['api.lever.co', 'jobs.lever.co'],
      listUrl: function (entry) {
        const name = entry && entry.token ? entry.token : slug(entry && (entry.name || entry.company));
        if (!name) return null;
        return 'https://api.lever.co/v0/postings/' + encodeURIComponent(name) + '?mode=json';
      },
      rows: function (payload, entry) {
        // Lever returns a bare top-level array, so this shape is the container to
        // type-check: a non-array here is an envelope change, not an empty board.
        const jobs = Array.isArray(payload) ? payload : null;
        if (jobs === null) throw new Error('lever: unexpected response, expected a jobs array at the top level');
        const name = (entry && (entry.company || entry.name)) || '';
        return jobs.map(function (j) {
          const cats = isPlainObject(j.categories) ? j.categories : {};
          return makeJob({
            id: 'lev_' + String(j.id || stableId('lev', [j.text, name])),
            title: j.text,
            company: name,
            location: cats.location || (Array.isArray(j.categories && j.categories.allLocations) ? j.categories.allLocations.join(', ') : ''),
            remote: j.workplaceType === 'remote',
            description: j.descriptionPlain || j.description,
            applyUrl: j.applyUrl || j.hostedUrl,
            source: 'lever',
            sourceUrl: j.hostedUrl,
            postedAt: j.createdAt ? numOr(j.createdAt, 0) : null,
            employmentType: cats.commitment,
            department: cats.team,
            // Only salaryRange is a pay field. additionalPlain is free-text ad copy
            // and picks up stray years, so it is deliberately not used.
            salary: j.salaryRange ? parseSalaryText(j.salaryRange) : null,
          });
        });
      },
    };

    // --- Workday ---------------------------------------------------------------
    // Wildcard-tenant: <tenant>.<vendor-domain>, e.g. acme.wd5.myworkdayjobs.com
    // The CXS search route under /wday/cxs/<tenant>/<site>/jobs is public and JSON,
    // but it only serves results over POST with a JSON filter body: the GET form of
    // the same path answers with a wml:Application_Error document.
    const workdayProvider = {
      id: 'workday',
      vendorDomains: ['myworkdayjobs.com'],
      // The tenant and site cannot be derived from a bare company slug, so an entry
      // must carry the careers URL (or an explicit api) that carries them.
      listUrl: function (entry) {
        const base = entry && (entry.api || entry.careers_url);
        if (!base) return null;
        let u;
        try {
          u = new URL(String(base));
        } catch (e) {
          return null;
        }
        const host = u.hostname.toLowerCase();
        if (!/\.myworkdayjobs\.com$/i.test(host)) return null;
        const tenant = host.split('.')[0];
        // The site is the first path segment of the careers URL
        // (https://x.wd5.myworkdayjobs.com/<site>/...); fall back to the tenant.
        const segments = u.pathname.split('/').filter(Boolean);
        const site = (entry && entry.site) || segments[0] || tenant;
        return {
          url: 'https://' + host + '/wday/cxs/' + encodeURIComponent(tenant) + '/' + encodeURIComponent(site) + '/jobs',
          tenant: tenant,
          site: site,
        };
      },
      // Workday pages through POST with an explicit offset/limit filter body.
      request: function (base, page, options) {
        const perPage = 20;
        return postJson(base, { appliedFacets: {}, limit: perPage, offset: (page - 1) * perPage, searchText: '' }, options);
      },
      rows: function (payload, entry, ctx) {
        const envelope = isPlainObject(payload) && isPlainObject(payload.jobPostings) ? payload.jobPostings : null;
        // Workday returns the array under the key "0" of the jobPostings object.
        const rows = envelope ? envelope['0'] : null;
        if (!envelope || !Array.isArray(rows)) {
          throw new Error('workday: unexpected response, expected jobPostings[] under the CXS envelope');
        }
        const detailUrl = ctx.workdayDetailUrl;
        return rows.map(function (e) {
          const p = isPlainObject(e.jobPostingInfo) ? e.jobPostingInfo : {};
          const req = e.jobReqId || p.jobReqId || '';
          return makeJob({
            id: 'wd_' + String(req || stableId('wd', [p.title, p.location])),
            title: p.title || '',
            company: (entry && entry.company) || ctx.tenantLabel || '',
            location: p.location || '',
            description: '',
            applyUrl: detailUrl ? (detailUrl + '/' + encodeURIComponent(String(req)) + '?source=CareerBoard') : '',
            source: 'workday',
            sourceUrl: detailUrl || '',
            postedAt: p.startDate,
            employmentType: '',
            salary: null,
          });
        }).filter(function (j) {
          // applyUrl is required for a usable job; a row with no requisition id
          // cannot be acted on and is dropped rather than aborting the page.
          return isUsableJob(j);
        });
      },
      paginated: true,
    };

    // --- iCIMS -----------------------------------------------------------------
    // Wildcard-tenant: <tenant>.careers.<vendor>.com, served by the public
    // /api/config/... search route.
    const icimsProvider = {
      id: 'icims',
      vendorDomains: ['icims.com', 'icims.na'],
      listUrl: function (entry) {
        const base = entry && (entry.api || entry.careers_url);
        if (!base) return null;
        let u;
        try {
          u = new URL(String(base));
        } catch (e) {
          return null;
        }
        const host = u.hostname.toLowerCase();
        if (!/\.icims\.com$/i.test(host) && !/\.careers\.[a-z0-9.-]+$/i.test(host)) return null;
        const tenant = host.split('.')[0];
        return {
          url: 'https://' + host + '/api/config/search/jobs?page=1&limit=100&sortBy=Most+Recent',
          tenant: tenant,
        };
      },
      rows: function (payload, entry, ctx) {
        if (!isPlainObject(payload)) throw new Error('icims: unexpected response, expected an object');
        const items = Array.isArray(payload.items) ? payload.items : null;
        if (items === null) {
          if (Array.isArray(payload)) return payload.map(function (j) { return icimsRow(j, entry, ctx); });
          throw new Error('icims: unexpected response, expected items[]');
        }
        return items.map(function (j) { return icimsRow(j, entry, ctx); });
      },
      paginated: true,
      pageUrl: function (base, page) {
        return base.replace(/page=\d+/, 'page=' + page);
      },
      pageCountFrom: function (payload) {
        return payload && numOr(payload.total, 0);
      },
    };

    function icimsRow(j, entry, ctx) {
      const title = j.jobTitle || j.title || '';
      const url = j.url || (ctx.icimsBase ? ctx.icimsBase + '/jobs/' + (j.id || '') : '');
      return makeJob({
        id: 'icims_' + String(j.id || stableId('icims', [title, url])),
        title: title,
        company: (entry && entry.company) || (j.companyName || ''),
        location: j.location || (isPlainObject(j.location) ? j.location.city : '') || '',
        description: j.description || j.jobDescription || '',
        applyUrl: url,
        source: 'icims',
        sourceUrl: url,
        postedAt: j.datePosted || j.postedDate,
        employmentType: j.typeOfEmployment || '',
        salary: parseSalaryText(j.salary || ''),
      });
    }

    // --- SmartRecruiters -------------------------------------------------------
    // https://api.smartrecruiters.com/v1/companies/<key>/postings?limit=100
    const smartRecruitersProvider = {
      id: 'smartrecruiters',
      vendorDomains: ['api.smartrecruiters.com', 'careers.smartrecruiters.com'],
      listUrl: function (entry) {
        const key = entry && (entry.token || entry.company || entry.name);
        if (!key) return null;
        return { url: 'https://api.smartrecruiters.com/v1/companies/' + encodeURIComponent(String(key)) + '/postings?limit=100', key: String(key) };
      },
      rows: function (payload, entry) {
        const jobs = pickArray(payload, ['content']);
        if (jobs === null) throw new Error('smartrecruiters: unexpected response, expected content[]');
        return jobs.map(function (j) {
          const loc = isPlainObject(j.location) ? j.location : {};
          const city = loc.city || '';
          const region = loc.region || '';
          const country = loc.country || '';
          const place = [city, region, country].filter(Boolean).join(', ');
          const name = isPlainObject(j.jobAd ? j.jobAd.companyName : null) ? j.jobAd.companyName : ((entry && (entry.company || entry.name)) || '');
          return makeJob({
            id: 'sr_' + String(j.id || stableId('sr', [j.name, place])),
            title: j.name,
            company: name,
            location: place,
            description: (isPlainObject(j.jobAd) ? j.jobAd.description : '') || '',
            applyUrl: j.applyUrl || '',
            source: 'smartrecruiters',
            sourceUrl: j.applyUrl || '',
            postedAt: j.releasedDate || '',
            employmentType: (isPlainObject(j.typeOfEmployment) ? j.typeOfEmployment.name : '') || '',
            department: isPlainObject(j.jobAd) && j.jobAd.department ? j.jobAd.department.label : '',
            salary: parseSalaryText((isPlainObject(j.jobAd) ? j.jobAd.salary : null) || ''),
          });
        });
      },
    };

    // --- BambooHR --------------------------------------------------------------
    // https://api.bamboohr.com/api/gateway.php/<tenant>/v1/positions/<id>
    // and the list endpoint /v1/positions/<subdomain>/<host>/...
    const bambooProvider = {
      id: 'bamboohr',
      vendorDomains: ['bamboohr.com', 'api.bamboohr.com'],
      listUrl: function (entry) {
        const base = entry && (entry.api || entry.careers_url);
        const token = entry && entry.token;
        if (!token) return null;
        let subdomain = String(token);
        let host = null;
        if (base) {
          try {
            const u = new URL(String(base));
            subdomain = u.hostname.split('.')[0];
            host = u.hostname;
          } catch (e) {
            // fall back to the token
          }
        }
        const hostPart = host || (subdomain + '.bamboohr.com');
        return { url: 'https://api.bamboohr.com/api/gateway.php/' + encodeURIComponent(subdomain) + '/v1/positions/' + encodeURIComponent(hostPart), subdomain: subdomain };
      },
      rows: function (payload, entry) {
        const jobs = pickArray(payload, ['positions']);
        if (jobs === null) throw new Error('bamboohr: unexpected response, expected positions[]');
        return jobs.map(function (j) {
          const title = j.title || '';
          const dept = isPlainObject(j.department) ? j.department.name : j.department;
          return makeJob({
            id: 'bh_' + String(j.id || stableId('bh', [title, dept])),
            title: title,
            company: (entry && (entry.company || entry.name)) || '',
            location: j.location || '',
            description: j.description || '',
            applyUrl: j.applicationUrl || j.url || '',
            source: 'bamboohr',
            sourceUrl: j.url || '',
            postedAt: j.datePosted || j.openDate,
            employmentType: j.employmentStatus || '',
            department: dept || '',
            salary: null,
          });
        });
      },
    };

    // --- Breezy ----------------------------------------------------------------
    // https://<tenant>.breezy.hr/json/<subdomain>
    const breezyProvider = {
      id: 'breezy',
      vendorDomains: ['breezy.hr'],
      listUrl: function (entry) {
        const base = entry && (entry.api || entry.careers_url);
        const token = entry && (entry.token || slug(entry && (entry.company || entry.name)));
        if (!token) return null;
        let subdomain = String(token);
        if (base) {
          const h = hostnameOf(base);
          if (h) subdomain = h.split('.')[0];
        }
        return { url: 'https://' + encodeURIComponent(subdomain) + '.breezy.hr/json/' + encodeURIComponent(subdomain), subdomain: subdomain };
      },
      rows: function (payload, entry) {
        const jobs = Array.isArray(payload) ? payload : null;
        if (jobs === null) throw new Error('breezy: unexpected response, expected a jobs array at the top level');
        const name = (entry && (entry.company || entry.name)) || '';
        return jobs.map(function (j) {
          return makeJob({
            id: 'brz_' + String(j.id || stableId('brz', [j.title, name])),
            title: j.title,
            company: name,
            location: j.location ? (j.location.city || '') + (j.location.state ? ', ' + j.location.state : '') : '',
            description: j.description || '',
            applyUrl: j.url || j.apply_url || '',
            source: 'breezy',
            sourceUrl: j.url || '',
            postedAt: j.published_at || j.publishedAt,
            employmentType: (j.type_of_employment && j.type_of_employment.name) || '',
            department: (j.department && j.department.name) || '',
            salary: parseSalaryText(j.salary || ''),
          });
        });
      },
    };

    // --- Jobvite ----------------------------------------------------------------
    // Host shape: <tenant>.<variant>.jobvite.com
    const jobviteProvider = {
      id: 'jobvite',
      vendorDomains: ['jobvite.com'],
      listUrl: function (entry) {
        const base = entry && (entry.api || entry.careers_url);
        const token = entry && entry.token;
        if (!base && !token) return null;
        let host = null;
        if (base) {
          const h = hostnameOf(base);
          if (h && /\.jobvite\.com$/i.test(h)) host = h;
        }
        if (!host) {
          if (!token) return null;
          host = String(token) + '.jobvite.com';
        }
        return { url: 'https://' + host + '/api/jobs', host: host };
      },
      rows: function (payload, entry) {
        if (!isPlainObject(payload)) throw new Error('jobvite: unexpected response, expected an object');
        const jobs = pickArray(payload, ['jobs']);
        if (jobs === null) throw new Error('jobvite: unexpected response, expected jobs[]');
        const name = (entry && (entry.company || entry.name)) || '';
        return jobs.map(function (j) {
          const title = j.title || j.jobtitle || '';
          const url = j.url || j.applyUrl || '';
          return makeJob({
            id: 'jv_' + String(j.id || j.key || stableId('jv', [title, url])),
            title: title,
            company: name,
            location: j.location || (j.city ? [j.city, j.state, j.country].filter(Boolean).join(', ') : ''),
            description: j.description || j.jobdescription || '',
            applyUrl: url,
            source: 'jobvite',
            sourceUrl: url,
            postedAt: j.datePosted || j.posted_date || '',
            employmentType: j.type || j.employmenttype || '',
            department: j.department || j.category || '',
            salary: parseSalaryText(j.salary || ''),
          });
        });
      },
    };

    // --- SuccessFactors --------------------------------------------------------
    // Marketing-site hosted: careers.<company>.com. The public search API lives at
    // /go/api/search/... but the reliable no-auth surface is the SSR HTML of the
    // search results page, so this provider scrapes JSON-LD JobPosting blocks.
    const successFactorsProvider = {
      id: 'successfactors',
      vendorDomains: ['successfactors.com', 'sapsf.com'],
      listUrl: function (entry) {
        const base = entry && (entry.careers_url || entry.api);
        if (!base) return null;
        const h = hostnameOf(base);
        if (!h) return null;
        return { url: 'https://' + h + '/search/?q=&locationsearch=', host: h };
      },
      rows: function (html, entry, ctx) {
        if (typeof html !== 'string') throw new Error('successfactors: unexpected response, expected HTML');
        // JSON-LD JobPosting blocks are the stable, machine-readable surface here.
        const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
        let m;
        const out = [];
        let sawListingSignal = false;
        while ((m = re.exec(html))) {
          let parsed;
          try {
            parsed = JSON.parse(m[1]);
          } catch (e) {
            continue; // one malformed block must not lose the rest of the page
          }
          const blocks = Array.isArray(parsed) ? parsed : [parsed];
          for (const b of blocks) {
            const node = isPlainObject(b) && Array.isArray(b['@graph']) ? b['@graph'] : [b];
            for (const n of node) {
              if (!isPlainObject(n)) continue;
              const types = Array.isArray(n['@type']) ? n['@type'] : [n['@type']];
              if (!types.some(function (t) { return t === 'JobPosting' || (String(t || '').indexOf('JobPosting') >= 0); })) continue;
              sawListingSignal = true;
              const url = n.url || (isPlainObject(n.hiringOrganization) ? n.hiringOrganization.sameAs : '') || '';
              const loc = isPlainObject(n.jobLocation)
                ? (Array.isArray(n.jobLocation) ? (n.jobLocation[0] && n.jobLocation[0].address) : n.jobLocation.address)
                : '';
              out.push(makeJob({
                id: 'sf_' + String(n.identifier && n.identifier.value ? n.identifier.value : stableId('sf', [n.title, url])),
                title: n.title,
                company: isPlainObject(n.hiringOrganization) ? n.hiringOrganization.name : '',
                location: isPlainObject(loc)
                  ? [loc.addressLocality, loc.addressRegion, loc.addressCountry].filter(Boolean).join(', ')
                  : '',
                description: n.description || '',
                applyUrl: url,
                source: 'successfactors',
                sourceUrl: url,
                postedAt: n.datePosted || '',
                employmentType: Array.isArray(n.employmentType) ? n.employmentType.join(', ') : (n.employmentType || ''),
                department: isPlainObject(n.occupationalCategory) ? n.occupationalCategory : (typeof n.occupationalCategory === 'string' ? n.occupationalCategory : ''),
                salary: parseSalaryText(isPlainObject(n.baseSalary) ? JSON.stringify(n.baseSalary) : ''),
              }));
            }
          }
        }
        if (!sawListingSignal) {
          const hasLink = /href=["'][^"']*(?:\/job\/|\/jobsearch\/|\/search\/job)[^"']*["']/i.test(html);
          if (hasLink) throw new Error('successfactors: listing-shaped links present but no JobPosting JSON-LD parsed — markup changed');
        }
        return out;
      },
    };

    // --- Oracle / Oracle HCM ----------------------------------------------------
    // careers.oracle.com and tenant oraclescloud host a public JSON search.
    const oracleProvider = {
      id: 'oracle',
      vendorDomains: ['oracle.com', 'oraclecloud.com'],
      listUrl: function (entry) {
        const base = entry && (entry.careers_url || entry.api);
        const host = base ? hostnameOf(base) : null;
        if (!host) return null;
        return { url: 'https://' + host + '/oracle/careers/search?limit=100', host: host };
      },
      rows: function (payload, entry) {
        const items = isPlainObject(payload)
          ? (Array.isArray(payload.items) ? payload.items : (Array.isArray(payload.jobPostings) ? payload.jobPostings : null))
          : null;
        if (items === null) throw new Error('oracle: unexpected response, expected items[] or jobPostings[]');
        const name = (entry && (entry.company || entry.name)) || '';
        return items.map(function (j) {
          const p = isPlainObject(j.jobPostingInfo) ? j.jobPostingInfo : j;
          const title = p.title || j.title || '';
          const id = j.id || j.jobReqId || '';
          return makeJob({
            id: 'orc_' + String(id || stableId('orc', [title])),
            title: title,
            company: name,
            location: p.location || '',
            description: p.description || '',
            applyUrl: p.externalUrl || j.url || '',
            source: 'oracle',
            sourceUrl: p.externalUrl || '',
            postedAt: p.startDate || '',
            salary: null,
          });
        });
      },
    };

    // --- Recruitee --------------------------------------------------------------
    // <tenant>.recruitee.com/api/offers/
    const recruiteeProvider = {
      id: 'recruitee',
      vendorDomains: ['recruitee.com'],
      listUrl: function (entry) {
        const base = entry && (entry.api || entry.careers_url);
        const token = entry && entry.token;
        let host = base ? hostnameOf(base) : null;
        if (host && !/^([a-z0-9-]+\.)*recruitee\.com$/i.test(host)) return null;
        if (!host) {
          if (!token) return null;
          host = String(token) + '.recruitee.com';
        }
        return { url: 'https://' + host + '/api/offers/', host: host };
      },
      rows: function (payload, entry) {
        const jobs = pickArray(payload, ['offers', 'jobs']);
        if (jobs === null) throw new Error('recruitee: unexpected response, expected offers[]');
        const name = (entry && (entry.company || entry.name)) || '';
        return jobs.map(function (j) {
          const loc = j.location || {};
          const place = [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
          return makeJob({
            id: 'rec_' + String(j.id || stableId('rec', [j.title, place])),
            title: j.title,
            company: name,
            location: place,
            remote: !!j.remote,
            description: j.description || j.requirements || '',
            applyUrl: j.url || j.careers_url || '',
            source: 'recruitee',
            sourceUrl: j.url || '',
            postedAt: j.published_at || j.publishedAt,
            employmentType: j.employment_type || '',
            department: j.department || j.team || '',
            salary: null,
          });
        });
      },
    };

    // --- Teamtailor -------------------------------------------------------------
    // <tenant>.teamtailor.com/api/v2/posts?page[size]=100
    const teamtailorProvider = {
      id: 'teamtailor',
      vendorDomains: ['teamtailor.com', 'teamtailor.io'],
      listUrl: function (entry) {
        const base = entry && (entry.api || entry.careers_url);
        const token = entry && entry.token;
        let host = base ? hostnameOf(base) : null;
        if (host && !/^([a-z0-9-]+\.)*teamtailor\.(com|io)$/i.test(host)) return null;
        if (!host) {
          if (!token) return null;
          host = String(token) + '.teamtailor.com';
        }
        return { url: 'https://' + host + '/api/v2/posts?page%5Bsize%5D=100', host: host };
      },
      rows: function (payload, entry) {
        const data = isPlainObject(payload) ? payload.data : null;
        const jobs = Array.isArray(data) ? data : null;
        if (jobs === null) throw new Error('teamtailor: unexpected response, expected data[]');
        const name = (entry && (entry.company || entry.name)) || '';
        return jobs.map(function (j) {
          const attrs = isPlainObject(j.attributes) ? j.attributes : {};
          const loc = isPlainObject(attrs.location) ? attrs.location : {};
          return makeJob({
            id: 'tt_' + String(j.id || stableId('tt', [attrs.title, loc.city])),
            title: attrs.title,
            company: name,
            location: [loc.city, loc.region, loc.country].filter(Boolean).join(', '),
            description: stripHtml(attrs.description || attrs.content || ''),
            applyUrl: attrs.url || '',
            source: 'teamtailor',
            sourceUrl: attrs.url || '',
            postedAt: attrs.published_at || '',
            employmentType: attrs.employment_type || '',
            department: attrs.department || attrs.team || '',
            salary: null,
          });
        });
      },
    };

    // --- Workable ---------------------------------------------------------------
    // apply.workable.com/<tenant>/j/ — the public list is SSR HTML with JSON-LD.
    const workableProvider = {
      id: 'workable',
      vendorDomains: ['workable.com', 'apply.workable.com'],
      listUrl: function (entry) {
        const base = entry && (entry.api || entry.careers_url);
        const token = entry && entry.token;
        if (!base && !token) return null;
        const host = 'apply.workable.com';
        const tenant = token || 'stage7';
        return { url: 'https://apply.workable.com/' + encodeURIComponent(String(tenant)) + '/', host: host };
      },
      rows: function (html, entry) {
        return successFactorsProvider.rows.call(null, html, entry, {});
      },
    };

    // --- Phenom -----------------------------------------------------------------
    // <tenant>.phenompeople.com/jobs — SSR HTML with JSON-LD JobPosting.
    const phenomProvider = {
      id: 'phenom',
      vendorDomains: ['phenompeople.com'],
      listUrl: function (entry) {
        const base = entry && (entry.api || entry.careers_url);
        const token = entry && entry.token;
        let host = base ? hostnameOf(base) : null;
        if (host && !/^([a-z0-9-]+\.)*phenompeople\.com$/i.test(host)) return null;
        if (!host) {
          if (!token) return null;
          host = String(token) + '.phenompeople.com';
        }
        return { url: 'https://' + host + '/jobs', host: host };
      },
      rows: function (html, entry) {
        return successFactorsProvider.rows.call(null, html, entry, {});
      },
    };

    const ATS_PROVIDERS = {
      greenhouse: greenhouseProvider,
      lever: leverProvider,
      ashby: ashbyProvider,
      workday: workdayProvider,
      icims: icimsProvider,
      smartrecruiters: smartRecruitersProvider,
      bamboohr: bambooProvider,
      breezy: breezyProvider,
      jobvite: jobviteProvider,
      successfactors: successFactorsProvider,
      oracle: oracleProvider,
      recruitee: recruiteeProvider,
      teamtailor: teamtailorProvider,
      workable: workableProvider,
      phenom: phenomProvider,
    };

    // Providers that read HTML rather than JSON. Their row mapper returns parsed
    // markup, so the fetcher asks for text instead of JSON.
    const HTML_ATS_PROVIDERS = new Set(['successfactors', 'workable', 'phenom']);

    const ATS_PROVIDER_IDS = Object.keys(ATS_PROVIDERS);

    // ---------------------------------------------------------------- public feeds
    //
    // Company-agnostic sources. Each reads a public no-auth feed that aggregates
    // many employers. These are what make a query-only search possible: the ATS
    // tier needs a company name to build a board URL, these do not.

    // RemoteOK — public JSON API, no key.
    const remoteOkFeed = {
      id: 'remoteok',
      label: 'RemoteOK',
      kind: 'json',
      // The API returns the whole board in one array; it is not paginated.
      url: 'https://remoteok.com/api',
      rows: function (payload) {
        // RemoteOK's first element is its own metadata record, not a job.
        const list = Array.isArray(payload) ? payload.slice(1) : null;
        if (list === null) throw new Error('remoteok: unexpected response, expected a top-level array');
        return list.map(function (j) {
          const tags = Array.isArray(j.tags) ? j.tags.join(', ') : (j.tags || '');
          const salaryMin = numOr(j.min_salary, null);
          const salaryMax = numOr(j.max_salary, null);
          return makeJob({
            id: 'rok_' + String(j.id || stableId('rok', [j.position, j.company_name])),
            title: j.position,
            company: j.company_name || '',
            location: j.location || '',
            remote: true,
            description: stripHtml(j.description || '') + (tags ? '\n\nSkills: ' + tags : ''),
            applyUrl: j.apply_url || j.url || '',
            source: 'remoteok',
            sourceUrl: j.url || 'https://remoteok.com',
            postedAt: j.date || '',
            employmentType: j.employment_type || '',
            department: j.tags || '',
            salary: salaryMin !== null || salaryMax !== null
              ? { min: salaryMin !== null ? salaryMin : salaryMax, max: salaryMax !== null ? salaryMax : salaryMin, currency: null, raw: '' }
              : null,
          });
        });
      },
    };

    // Remotive — public JSON API, no key. Supports a keyword search natively.
    const remotiveFeed = {
      id: 'remotive',
      label: 'Remotive',
      kind: 'json',
      url: 'https://remotive.com/api/remote-jobs?limit=100',
      rows: function (payload) {
        const jobs = pickArray(payload, ['jobs']);
        if (jobs === null) throw new Error('remotive: unexpected response, expected jobs[]');
        return jobs.map(function (j) {
          const cats = Array.isArray(j.category) ? j.category.join(', ') : (j.category || '');
          return makeJob({
            id: 'rmv_' + String(j.id || stableId('rmv', [j.title, j.company_name])),
            title: j.title,
            company: j.company_name || '',
            location: j.candidate_required_location || j.job_location || '',
            remote: true,
            description: j.description || '',
            applyUrl: j.url || '',
            source: 'remotive',
            sourceUrl: j.url || 'https://remotive.com',
            postedAt: j.publication_date || '',
            employmentType: j.job_type || '',
            department: cats,
            salary: parseSalaryText(j.salary || ''),
          });
        });
      },
    };

    // Arbeitnow — public JSON API, no key, genuinely paginated (1-indexed).
    const arbeitnowFeed = {
      id: 'arbeitnow',
      label: 'Arbeitnow',
      kind: 'json',
      url: 'https://www.arbeitnow.com/api/job-board-api?page=1',
      paginated: true,
      pageUrl: function (base, page) {
        const u = new URL(base);
        u.searchParams.set('page', String(page));
        return u.toString();
      },
      rows: function (payload) {
        const jobs = pickArray(payload, ['data']);
        if (jobs === null) throw new Error('arbeitnow: unexpected response, expected data[]');
        return jobs.map(function (j) {
          return makeJob({
            id: 'arb_' + String(j.slug ? String(j.slug).replace(/[^a-z0-9]+/gi, '_') : stableId('arb', [j.title, j.company_name])),
            title: j.title,
            company: j.company_name || '',
            location: j.location || '',
            remote: /remote/i.test(j.location || '') || /remote/i.test(j.tags || ''),
            description: j.description || '',
            applyUrl: j.url || '',
            source: 'arbeitnow',
            sourceUrl: j.url || 'https://www.arbeitnow.com',
            postedAt: j.created_at || '',
            employmentType: j.job_types || '',
            department: Array.isArray(j.tags) ? j.tags.join(', ') : (j.tags || ''),
            salary: null,
          });
        });
      },
    };

    // Jobicy — public JSON API, no key.
    const jobicyFeed = {
      id: 'jobicy',
      label: 'Jobicy',
      kind: 'json',
      url: 'https://jobicy.com/api/v2/remote-jobs?count=50',
      rows: function (payload) {
        const jobs = pickArray(payload, ['jobs']);
        if (jobs === null) throw new Error('jobicy: unexpected response, expected jobs[]');
        return jobs.map(function (j) {
          const loc = Array.isArray(j.jobGeo) ? j.jobGeo.join(', ') : (j.jobGeo || '');
          return makeJob({
            id: 'jcy_' + String(j.id || stableId('jcy', [j.jobTitle, j.companyName])),
            title: j.jobTitle,
            company: j.companyName || '',
            location: loc,
            remote: true,
            description: stripHtml(j.jobDescription || j.jobDescriptionPlain || ''),
            applyUrl: j.url || '',
            source: 'jobicy',
            sourceUrl: j.url || 'https://jobicy.com',
            postedAt: j.pubDate || '',
            employmentType: j.jobType || '',
            department: Array.isArray(j.tags) ? j.tags.join(', ') : (j.tags || ''),
            salary: parseSalaryText(j.annualSalaryMin ? (j.annualSalaryMin + ' - ' + (j.annualSalaryMax || j.annualSalaryMin)) : ''),
          });
        });
      },
    };

    // We Work Remotely — public RSS. No JSON API without a key, so this is parsed
    // in-process. The publisher publishes RSS for public consumption.
    const wwrFeed = {
      id: 'weworkremotely',
      label: 'We Work Remotely',
      kind: 'rss',
      url: 'https://weworkremotely.com/remote-jobs.rss',
      rows: function (xml) {
        return parseRssItems(xml, {
          idPrefix: 'wwr',
          source: 'weworkremotely',
          sourceUrl: 'https://weworkremotely.com',
          // <item><title>Company: Position</title></item> is this feed's convention.
          // WWR titles are "Company: Position (Location)".
          companyFromTitle: true,
        });
      },
    };

    // Himalayas — public RSS. Replaces Remote.co, whose /feed/ path 301s to a 404
    // and whose /remote-jobs.rss answers 403, so it was a permanently failing
    // source that reported a failure on every single run.
    const himalayasFeed = {
      id: 'himalayas',
      label: 'Himalayas',
      kind: 'rss',
      url: 'https://himalayas.app/jobs/rss',
      rows: function (xml) {
        return parseRssItems(xml, {
          idPrefix: 'him',
          source: 'himalayas',
          sourceUrl: 'https://himalayas.app',
          companyFromTitle: true,
        });
      },
    };

    // Recruit.jobs / Recruitee is handled by the ATS tier. Hacker News "Who is
    // hiring" is deliberately excluded: it is a forum thread, not a posting feed,
    // and parsing it would not be a source of employer-attributed listings.

    // Parses an RSS 2.0 / Atom document into jobs, in-process, with no dependency.
    // CDATA is unwrapped, entities decoded, and a malformed <item> is skipped
    // rather than aborting the feed.
    function parseRssItems(xml, map) {
      if (typeof xml !== 'string' || !xml.trim()) throw new Error(map.idPrefix + ': empty RSS document');
      const itemRe = /<item[\s>][\s\S]*?<\/item>/gi;
      const altRe = /<entry[\s>][\s\S]*?<\/entry>/gi;
      const blocks = [];
      let m;
      while ((m = itemRe.exec(xml))) blocks.push(m[0]);
      if (!blocks.length) {
        while ((m = altRe.exec(xml))) blocks.push(m[0]);
      }
      if (!blocks.length) {
        // Distinguish "feed is well-formed but empty" from "markup changed".
        if (/<rss[\s>]/i.test(xml) || /<feed[\s>]/i.test(xml)) return [];
        throw new Error(map.idPrefix + ': document is not an RSS/Atom feed');
      }
      const out = [];
      for (const block of blocks) {
        const title = decodeEntities(unwrapCdata(extractTag(block, 'title')));
        const link = extractTag(block, 'link') || (block.match(/<link[^>]*href=["']([^"']+)["']/i) || [])[1] || '';
        const description = decodeEntities(unwrapCdata(extractTag(block, 'description') || extractTag(block, 'content:encoded') || extractTag(block, 'content')));
        const pubDate = extractTag(block, 'pubDate') || extractTag(block, 'published') || extractTag(block, 'updated') || '';
        const url = decodeEntities(String(link).trim());
        if (!title || !/^https?:\/\//i.test(url)) continue; // a row we cannot act on
        // These feeds encode the employer in the title ("Acme Corp: Senior Data
        // Engineer (Remote)"). Splitting it means ranking sees a job title rather
        // than "Acme: VP Sales", and the company axis is populated instead of
        // defaulting to a neutral score.
        const split = map.companyFromTitle ? splitCompanyTitle(title) : null;
        out.push(makeJob({
          id: map.idPrefix + '_' + stableId(map.idPrefix, [title, url]),
          title: split ? split.role : title,
          company: split ? split.company : '',
          location: '',
          remote: true,
          description: description,
          applyUrl: url,
          source: map.source,
          sourceUrl: map.sourceUrl,
          postedAt: pubDate,
          employmentType: '',
          department: '',
          salary: null,
        }));
      }
      return out;
    }

    function unwrapCdata(s) {
      if (!s) return '';
      return String(s).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
    }

    // Returns the inner text of the first <tag>…</tag>, tolerant of attributes and
    // of a self-closing/empty tag.
    //
    // Written with per-tag scanner functions rather than new RegExp(tag + ...):
    // the emitted program is assembled through a template literal, where a
    // backslash inside a dynamic string argument can be consumed before the script
    // is ever parsed. Every tag read here comes from a fixed list below, so each
    // gets a literal pattern and nothing is ever built from a variable.
    const RSS_TAG_READERS = {
      title: function (b) { const m = b.match(/<title(?:\s[^>]*)?>([\s\S]*?)<\/title>/i); return m ? m[1] : ''; },
      link: function (b) {
        const m = b.match(/<link(?:\s[^>]*)?>([\s\S]*?)<\/link>/i);
        if (m) return m[1];
        // Atom puts the target in an href attribute on a self-closing <link/>.
        const self = b.match(/<link\s([^>]*?)\/?>/i);
        if (self) {
          const href = /href=["']([^"']+)["']/.exec(self[1]);
          return href ? href[1] : '';
        }
        return '';
      },
      description: function (b) { const m = b.match(/<description(?:\s[^>]*)?>([\s\S]*?)<\/description>/i); return m ? m[1] : ''; },
      'content:encoded': function (b) { const m = b.match(/<content:encoded(?:\s[^>]*)?>([\s\S]*?)<\/content:encoded>/i); return m ? m[1] : ''; },
      content: function (b) { const m = b.match(/<content(?:\s[^>]*)?>([\s\S]*?)<\/content>/i); return m ? m[1] : ''; },
      pubDate: function (b) { const m = b.match(/<pubDate(?:\s[^>]*)?>([\s\S]*?)<\/pubDate>/i); return m ? m[1] : ''; },
      published: function (b) { const m = b.match(/<published(?:\s[^>]*)?>([\s\S]*?)<\/published>/i); return m ? m[1] : ''; },
      updated: function (b) { const m = b.match(/<updated(?:\s[^>]*)?>([\s\S]*?)<\/updated>/i); return m ? m[1] : ''; },
    };

    function extractTag(block, tag) {
      const reader = RSS_TAG_READERS[tag];
      return reader ? reader(block) : '';
    }

    // "Acme Corp: Senior Data Engineer (Remote)" -> { company, role }.
    // Returns null when the title carries no company separator, so the caller keeps
    // the original title rather than guessing a company out of a role name.
    function splitCompanyTitle(title) {
      const s = String(title || '');
      const m = s.match(/^\s*(.{2,60}?)\s*[:|]\s*(.{3,})\s*$/);
      if (!m) return null;
      return { company: m[1].trim(), role: m[2].replace(/\([^)]*\)\s*$/, '').trim() };
    }

    const FEED_PROVIDERS = {
      remoteok: remoteOkFeed,
      remotive: remotiveFeed,
      arbeitnow: arbeitnowFeed,
      jobicy: jobicyFeed,
      weworkremotely: wwrFeed,
      himalayas: himalayasFeed,
    };

    const FEED_PROVIDER_IDS = Object.keys(FEED_PROVIDERS);

    // ---------------------------------------------------------------- registry

    function portalsConfigPath() {
      return ctx.store.getFilePath('portals');
    }

    // Returns { tracked_companies, job_boards, source }. Never throws: a missing
    // file is the normal case, and a malformed one is reported as a note so the
    // run still proceeds on the built-in defaults rather than failing outright.
    function loadPortalConfig() {
      const p = portalsConfigPath();
      const parsed = ctx.store.load('portals', null);
      if (!parsed) {
        return { tracked_companies: [], job_boards: [], source: 'built-in defaults (no portals.json)', warning: null };
      }
      if (!isPlainObject(parsed)) {
        return { tracked_companies: [], job_boards: [], source: p, warning: 'portals.json is not an object; falling back to built-in defaults' };
      }
      return {
        tracked_companies: Array.isArray(parsed.tracked_companies) ? parsed.tracked_companies : [],
        job_boards: Array.isArray(parsed.job_boards) ? parsed.job_boards : [],
        source: p,
        warning: null,
      };
    }

    // Normalizes one tracked_companies entry into { name, company, token, provider,
    // careersUrl }. An entry may pin a provider explicitly, or leave it to
    // detection: the first provider whose listUrl accepts the entry claims it.
    function normalizeCompanyEntry(raw) {
      if (!isPlainObject(raw)) return null;
      const name = String(raw.name || raw.company || '').trim();
      if (!name) return null;
      if (raw.enabled === false) return null;
      return {
        name: name,
        company: String(raw.company || name),
        token: raw.token ? String(raw.token) : slug(raw.token || name),
        provider: raw.provider ? String(raw.provider) : null,
        careers_url: raw.careers_url ? String(raw.careers_url) : null,
        api: raw.api ? String(raw.api) : null,
        site: raw.site ? String(raw.site) : null,
        max_pages: numOr(raw.max_pages, null),
      };
    }

    function normalizeBoardEntry(raw) {
      if (isPlainObject(raw)) {
        if (raw.enabled === false) return null;
        const id = String(raw.id || raw.provider || '').trim();
        if (!id) return null;
        return { id: id };
      }
      const id = String(raw || '').trim();
      if (!id) return null;
      return { id: id };
    }

    // Picks the provider for an entry: an explicit \`provider:\` field wins, then the
    // first provider whose listUrl accepts the entry and yields a URL. Returns null
    // when nothing claims it, which is reported as an uncovered entry rather than
    // silently skipped.
    function resolveProviderFor(entry) {
      if (entry.provider) {
        const p = ATS_PROVIDERS[entry.provider];
        if (!p) return { provider: null, reason: 'provider "' + entry.provider + '" is not one this build knows' };
        return { provider: p, url: p.listUrl(entry) };
      }
      for (const id of ATS_PROVIDER_IDS) {
        const p = ATS_PROVIDERS[id];
        // Auto-detection must not hand a Workday entry to Greenhouse just because
        // the company name also happens to be a Greenhouse board slug.
        if (!providerMayClaim(p, entry)) continue;
        let url = null;
        try {
          url = p.listUrl(entry);
        } catch (e) {
          url = null;
        }
        if (url) return { provider: p, url: url };
      }
      return { provider: null, reason: 'no provider claimed this entry' };
    }

    // ---------------------------------------------------------------- targeting

    // Reads the stored profile so a run with no explicit criteria can still search.
    // Returns { profile, targetRoles, targetCompanies, keywords, resumeText }.
    function loadCandidateProfile() {
      const profileId = input.profileId || 'default';
      return ctx.store.load('profiles/' + profileId, null);
    }

    function collectResumeText(profile) {
      if (!isPlainObject(profile)) return '';
      const parts = [];
      const r = profile.resume;
      if (isPlainObject(r)) {
        if (typeof r.parsedText === 'string') parts.push(r.parsedText);
        if (typeof r.rawText === 'string' && r.rawText !== r.parsedText) parts.push(r.rawText);
      }
      if (typeof profile.resumeText === 'string') parts.push(profile.resumeText);
      if (typeof profile.summary === 'string') parts.push(profile.summary);
      return parts.filter(Boolean).join('\n').trim();
    }

    // Stems a role phrase to its distinctive head noun so "Chief Product Officer"
    // and "Senior Product Manager" share the searchable token "product".
    function roleTokens(role) {
      const stop = new Set(['a', 'an', 'the', 'of', 'and', 'or', 'to', 'for', 'in', 'at', 'senior', 'sr', 'junior', 'jr', 'staff', 'principal', 'lead', 'head', 'chief', 'vp', 'vice', 'president', 'director', 'manager', 'associate', 'specialist', 'general']);
      const words = String(role || '').toLowerCase().split(/[^a-z0-9+#.]+/).filter(Boolean);
      return words.filter(function (w) { return w.length > 2 && !stop.has(w); });
    }

    // Derives search queries from the profile when the caller gave none.
    //
    // Order of preference:
    //   1. preferences.targetRoles, which the user has already curated
    //   2. title-ish lines from the resume, which is the "determine it from my
    //      resume" path
    //
    // The resume path deliberately looks for a self-declared title near the top of
    // the document rather than trying to infer one from the whole body: a resume
    // contains every job the candidate has ever had, so scanning all of it yields
    // whatever is most frequent rather than what they want next.
    function deriveQueriesFromProfile(profile) {
      const prefs = isPlainObject(profile) && isPlainObject(profile.preferences) ? profile.preferences : {};
      const explicit = asList(prefs.targetRoles);
      if (explicit.length) return { queries: explicit, from: 'profile preferences.targetRoles' };

      const resume = collectResumeText(profile);
      if (!resume) return { queries: [], from: null };

      const lines = resume.split(/[\r\n]+/).map(function (l) { return l.trim(); }).filter(Boolean);
      const found = [];
      for (const line of lines.slice(0, 25)) {
        const t = stripHtml(line);
        // A headline line: short, no sentence punctuation, and contains a role word.
        if (t.length > 60 || t.length < 3) continue;
        if (/[.!?;]/.test(t)) continue;
        if (/\b(experience|education|skills|summary|contact|email|phone|linkedin|github|http)/i.test(t)) continue;
        const tokens = roleTokens(t);
        if (!tokens.length) continue;
        if (!/(officer|manager|director|engineer|developer|designer|analyst|scientist|architect|consultant|lead|head|vp|president|specialist|strategist|marketer|recruiter|researcher|writer|accountant|attorney|advisor|scientist|technician|nurse|teacher|professor|sales)/i.test(t)) continue;
        found.push(t);
        if (found.length >= 3) break;
      }
      return { queries: found, from: 'resume headline' };
    }

    // Derives target companies from the profile, used to seed the ATS tier when the
    // caller named no companies.
    function deriveCompaniesFromProfile(profile) {
      const prefs = isPlainObject(profile) && isPlainObject(profile.preferences) ? profile.preferences : {};
      const explicit = asList(prefs.targetCompanies);
      if (explicit.length) return explicit;
      const fromResume = [];
      const resume = collectResumeText(profile);
      const expRe = /\b(?:at|@)\s+([A-Z][A-Za-z0-9&.\- ]{1,40})/g;
      let m;
      while ((m = expRe.exec(resume)) && fromResume.length < 15) {
        const name = m[1].trim().replace(/[.,]$/, '');
        if (name.length > 1 && !fromResume.includes(name)) fromResume.push(name);
      }
      return fromResume;
    }

    // Keyword filter terms derived from the profile, used to keep the query
    // substring test from admitting every listing that shares one common word.
    function deriveKeywordsFromProfile(profile) {
      const prefs = isPlainObject(profile) && isPlainObject(profile.preferences) ? profile.preferences : {};
      return asList(prefs.keywords).map(function (k) { return String(k).toLowerCase(); }).filter(Boolean);
    }

    // ---------------------------------------------------------------- collector

    // Absolute page ceilings. A paginating provider's page count must never come
    // from the source alone — that is untrusted third-party data, and a growing or
    // tampered response would turn one config line into an unbounded request loop.
    // A source-reported total can only enter the walk through Math.min with these
    // ceilings, never on its own.
    const DEFAULT_MAX_PAGES = 5;
    const MAX_PAGES_CAP = 25;
    const MAX_JOBS_PER_BOARD = 500;

    function resolveMaxPages(entry) {
      const v = entry && entry.max_pages;
      if (Number.isInteger(v) && v > 0) return Math.min(v, MAX_PAGES_CAP);
      return DEFAULT_MAX_PAGES;
    }

    // Records why a walk stopped, so a consumer can tell "truncated a healthy
    // board" from "the board broke". Both the warning and the incomplete marker are
    // driven from this.
    const STOP_COMPLETE = 'complete';
    const STOP_CAP = 'cap';
    const STOP_FETCH_ERROR = 'fetch-error';
    const STOP_PARSE_ERROR = 'parse-error';

    // Runs an ATS provider over one entry.
    //
    // Returns { jobs, status, count, note, stopReason, pages } and never throws:
    // a provider failure is recorded against the ledger and the sweep continues.
    async function collectAts(provider, entry, ctx) {
      const boardLabel = provider.id + ':' + (entry.name || entry.token || 'board');

      let listUrl;
      try {
        listUrl = provider.listUrl(entry);
      } catch (e) {
        return { jobs: [], status: 'error', count: 0, pages: 0, stopReason: STOP_FETCH_ERROR, note: provider.id + ': could not build a board URL (' + (e && e.message ? e.message : String(e)) + ')' };
      }
      if (!listUrl) {
        return { jobs: [], status: 'error', count: 0, pages: 0, stopReason: STOP_FETCH_ERROR, note: provider.id + ': this entry has no ' + (provider.id === 'greenhouse' || provider.id === 'lever' || provider.id === 'ashby' ? 'board token' : 'host') + ' and no URL to derive one from' };
      }
      // Some providers return { url, tenant, site } for their detail route.
      const base = isPlainObject(listUrl) ? listUrl.url : String(listUrl);
      const detailCtx = Object.assign({}, ctx);
      if (isPlainObject(listUrl)) {
        if (provider.id === 'workday') {
          const host = hostnameOf(base);
          detailCtx.workdayDetailUrl = 'https://' + host + '/wday/cxs/' + encodeURIComponent(listUrl.tenant) + '/' + encodeURIComponent(listUrl.site) + '/jobDetail';
          detailCtx.tenantLabel = listUrl.tenant;
        }
        if (provider.id === 'icims') detailCtx.icimsBase = 'https://' + hostnameOf(base);
      }

      const isHtml = HTML_ATS_PROVIDERS.has(provider.id);
      const maxPages = resolveMaxPages(entry);
      const maxJobs = ctx.maxPerBoard || MAX_JOBS_PER_BOARD;

      const jobs = [];
      const seen = new Set();
      let pages = 0;
      let stopReason = STOP_COMPLETE;
      let lastError = null;
      let lastStatus = 0;

      for (let page = 1; page <= maxPages; page++) {
        const httpOpts = providerHttpOptions(entry, provider);
        // A provider that pages through a POST route (Workday CXS) supplies its own
        // request; otherwise page 2+ rebuilds the URL for the source's own scheme.
        let res;
        if (typeof provider.request === 'function') {
          res = await provider.request(base, page, httpOpts);
        } else {
          const url = provider.paginated && page > 1 ? provider.pageUrl(base, page) : base;
          res = isHtml ? await fetchHtml(url, httpOpts) : await getJson(url, httpOpts);
        }
        if (!res.ok) {
          lastError = res.error;
          lastStatus = res.status || 0;
          // Keep the pages already collected and report honestly, rather than
          // failing the whole target: a source that breaks on page 4 still gave us
          // three good pages.
          stopReason = STOP_FETCH_ERROR;
          if (page === 1) {
            return { jobs: [], status: 'error', count: 0, pages: 0, stopReason: stopReason, note: atsFailureNote(provider, entry, res, ctx.pinned) };
          }
          break;
        }

        pages = page;
        let rows;
        try {
          rows = provider.rows(res.data, entry, detailCtx);
        } catch (e) {
          // A parse failure is the source changing shape. That is a failure of this
          // system, not an empty board, and it must not be reported as a zero.
          if (page === 1) {
            return { jobs: [], status: 'error', count: 0, pages: pages, stopReason: STOP_PARSE_ERROR, note: provider.id + ': could not read the response \u2014 ' + (e && e.message ? e.message : String(e)) };
          }
          stopReason = STOP_PARSE_ERROR;
          lastError = e && e.message ? e.message : String(e);
          break;
        }

        const before = rows.length;
        for (const row of rows) {
          if (jobs.length >= maxJobs) break;
          if (!isUsableJob(row)) continue;
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          jobs.push(row);
        }

        // Inter-page delay. Only between pages, and via the shared sleep so a
        // caller-supplied clock is honoured.
        if (INTER_REQUEST_DELAY_MS > 0 && page < maxPages) await sleep(INTER_REQUEST_DELAY_MS);

        // The short-page stop compares the row count the SOURCE returned, never a
        // count already narrowed by dropping malformed rows or by de-duping. The
        // filtered version would end the walk one row short the moment a full page
        // carries one bad row.
        if (!provider.paginated) break;
        if (before === 0) break;
        if (page === maxPages) stopReason = STOP_CAP;
      }

      // Enrichment: opt-in, bounded, paced, and skipped entirely while a liveness
      // probe runs (the probe has no use for it and it would cost real requests).
      let enriched = 0;
      if (provider.detail && ctx.enrich && !ctx.probeOnly && jobs.length) {
        enriched = await enrichDescriptions(provider, jobs, entry, ctx, Math.min(jobs.length, ctx.detailLimit || 20));
      }

      if (!jobs.length) {
        if (stopReason === STOP_COMPLETE) {
          return { jobs: [], status: 'no-match', count: 0, pages: pages, stopReason: stopReason, note: provider.id + ': read ' + pages + ' page(s) successfully; the board carries no listings for this entry' };
        }
        return { jobs: [], status: 'error', count: 0, pages: pages, stopReason: stopReason, note: provider.id + ': ' + (lastError ? lastError : 'walk stopped early (' + stopReason + ')') };
      }

      let note = provider.id + ': read ' + pages + ' page(s), ' + jobs.length + ' usable listing' + (jobs.length === 1 ? '' : 's');
      if (enriched) note += ', ' + enriched + ' enriched with descriptions';
      if (stopReason === STOP_CAP) {
        note += '. Stopped at the ' + maxPages + '-page ceiling for this entry, so this is a partial view of the board \u2014 raise max_pages on this entry in portals.json for the full inventory';
      } else if (stopReason === STOP_FETCH_ERROR) {
        note += '. Stopped early: ' + (lastError || 'fetch error') + ' after page ' + pages + '. The pages collected so far are complete; later pages were not read';
      }
      return { jobs: jobs, status: 'ok', count: jobs.length, pages: pages, stopReason: stopReason, note: note };
    }

    // Fetches per-posting descriptions with a bounded worker pool.
    //
    // Enrichment is best-effort by construction: a detail fetch that exhausts retry
    // leaves that listing exactly as the list endpoint returned it and the sweep
    // continues. It is never fatal to the target.
    async function enrichDescriptions(provider, jobs, entry, ctx, limit) {
      const targets = jobs.slice(0, limit);
      if (!targets.length) return 0;
      let cursor = 0;
      let done = 0;
      const workerCount = Math.min(ENRICH_CONCURRENCY, targets.length);
      const workers = [];
      for (let w = 0; w < workerCount; w++) {
        workers.push((async function () {
          while (cursor < targets.length) {
            const idx = cursor++;
            const job = targets[idx];
            if (INTER_REQUEST_DELAY_MS > 0) await sleep(INTER_REQUEST_DELAY_MS);
            try {
              await provider.detail(job, entry, ctx);
              if (job.description) done++;
            } catch (e) {
              // Keep the listing as the list endpoint gave it to us.
            }
          }
        })());
      }
      await Promise.all(workers);
      return done;
    }

    function atsFailureNote(provider, entry, res, pinned) {
      const detail = res.error ? ' (' + res.error + ')' : (res.status ? ' (HTTP ' + res.status + ')' : ' (no response)');
      if (res.status === 404) {
        // A 404 is a real answer: no board of that name exists under that
        // provider. When the entry was pinned, say so; when it was auto-probed,
        // say nothing, because "this employer is not on Greenhouse" is not a
        // retrieval failure of any source we were asked to read.
        return pinned
          ? 'The board does not exist: ' + provider.id + ' returned HTTP 404 for board "' + (entry.name || entry.token) + '". A definitive answer, not a retrieval failure.'
          : null;
      }
      return (pinned ? 'Pinned board could not be retrieved' : 'Source could not be retrieved') + detail + '. This source was never read, so nothing is known about what it lists.';
    }

    // Runs a company-agnostic public feed.
    async function collectFeed(feed, ctx) {
      const opts = { allowedHosts: [hostnameOf(feed.url)].filter(Boolean) };
      const isRss = feed.kind === 'rss';
      const maxPages = feed.paginated ? Math.min(ctx.maxPages || DEFAULT_MAX_PAGES, MAX_PAGES_CAP) : 1;

      const jobs = [];
      const seen = new Set();
      let pages = 0;
      let stopReason = STOP_COMPLETE;
      let lastError = null;

      for (let page = 1; page <= maxPages; page++) {
        const url = feed.paginated && page > 1 ? feed.pageUrl(feed.url, page) : feed.url;
        const res = isRss ? await fetchHtml(url, opts) : await getJson(url, opts);
        if (!res.ok) {
          lastError = res.error;
          if (page === 1) {
            return { jobs: [], status: 'error', count: 0, pages: 0, stopReason: STOP_FETCH_ERROR, note: feed.label + ' could not be retrieved' + (res.error ? ' (' + res.error + ')' : '') + '. This source was never read, so nothing is known about what it lists.' };
          }
          stopReason = STOP_FETCH_ERROR;
          break;
        }
        pages = page;

        let rows;
        try {
          rows = feed.rows(res.data);
        } catch (e) {
          if (page === 1) {
            return { jobs: [], status: 'error', count: 0, pages: pages, stopReason: STOP_PARSE_ERROR, note: feed.label + ' could not be read \u2014 ' + (e && e.message ? e.message : String(e)) };
          }
          stopReason = STOP_PARSE_ERROR;
          lastError = e && e.message ? e.message : String(e);
          break;
        }

        const before = rows.length;
        for (const row of rows) {
          if (jobs.length >= MAX_JOBS_PER_BOARD) break;
          if (!isUsableJob(row)) continue;
          if (seen.has(row.id)) continue;
          seen.add(row.id);
          jobs.push(row);
        }

        if (INTER_REQUEST_DELAY_MS > 0 && page < maxPages) await sleep(INTER_REQUEST_DELAY_MS);
        if (!feed.paginated) break;
        if (before === 0) break;
        if (page === maxPages) stopReason = STOP_CAP;
      }

      if (!jobs.length) {
        if (stopReason === STOP_COMPLETE) {
          return { jobs: [], status: 'no-match', count: 0, pages: pages, stopReason: stopReason, note: feed.label + ': read ' + pages + ' page(s) successfully; it currently publishes no listings' };
        }
        return { jobs: [], status: 'error', count: 0, pages: pages, stopReason: stopReason, note: feed.label + ': ' + (lastError || 'walk stopped early (' + stopReason + ')') };
      }

      let note = feed.label + ': read ' + pages + ' page(s), ' + jobs.length + ' listing' + (jobs.length === 1 ? '' : 's');
      if (stopReason === STOP_CAP) note += '. Stopped at the page ceiling, so this is a partial view of the feed';
      else if (stopReason === STOP_FETCH_ERROR) note += '. Stopped early: ' + (lastError || 'fetch error');
      return { jobs: jobs, status: 'ok', count: jobs.length, pages: pages, stopReason: stopReason, note: note };
    }

    // Runs several collectors with a bounded concurrency, never letting one
    // failure abort the others. Returns { jobs, ledger }.
    async function runCollectors(tasks, concurrency) {
      const results = [];
      const ledger = [];
      const limit = Math.max(1, concurrency || 4);
      let cursor = 0;
      const workers = [];
      for (let w = 0; w < limit; w++) {
        workers.push((async function () {
          while (cursor < tasks.length) {
            const idx = cursor++;
            const task = tasks[idx];
            let outcome;
            try {
              outcome = await task.run();
            } catch (e) {
              // A task that throws outright is recorded as a failure and the sweep
              // continues. Losing the entire target to one bad source is the exact
              // outcome this guards.
              outcome = { jobs: [], status: 'error', count: 0, pages: 0, stopReason: STOP_FETCH_ERROR, note: task.label + ' raised an unexpected error: ' + (e && e.message ? e.message : String(e)) };
            }
            // Preserve any sub-ledger a collector produced. The ATS probe reports
            // one aggregate entry here and the per-company detail in outcome.ledger;
            // dropping the latter would leave a run reporting "ok" against a single
            // opaque board name.
            ledger[idx] = { board: task.label, status: outcome.status, count: outcome.count, note: outcome.note, subLedger: outcome.ledger || null };
            for (const j of outcome.jobs || []) results.push(j);
          }
        })());
      }
      await Promise.all(workers);
      return { jobs: results, ledger: ledger.filter(Boolean) };
    }

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
    const portalsPath = ctx.store.getFilePath('portals');
    const profilePath = ctx.store.getFilePath('profiles/' + profileId);
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
      return {
        success: false,
        status: 'blocked',
        data: null,
        error: 'Nothing to search. Supply "queries" (job titles), or "companies", or configure employers in ' + portalsPath + ', or set up a candidate profile at ' + profilePath + ' with preferences.targetRoles and resume text so the search can be derived from it.',
        present: [{
          id: 'discovery-blocked', title: 'Nothing to search', kind: 'text',
          body: 'Discovery could not run because there was no search criterion and nothing in the stored profile to derive one from.\n\nProvide any one of:\n  - queries: job titles to search for\n  - companies: employers to read their ATS board\n  - tracked_companies in ' + portalsPath + '\n  - a profile at ' + profilePath + ' with preferences.targetRoles and resume text\n\nCompany-agnostic public feeds (RemoteOK, Remotive, Arbeitnow, Jobicy, We Work Remotely, Himalayas) need only a role, not a company.',
        }],
      };;
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
    ctx.store.save('listings/default', {
      listings: listings,
      total: listings.length,
      byBoard: byBoard,
      failures: failures.map(function (b) { return { board: b.board, status: b.status, note: b.note }; }),
      failureCount: failures.length,
      generatedAt: new Date().toISOString(),
    });


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

    return {
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
    };;

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


  },
});
