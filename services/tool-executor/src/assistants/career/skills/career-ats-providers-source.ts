// Applicant Tracking System providers.
//
// This is the tier that actually returns jobs. Every provider here reads a
// public, no-auth, structured JSON endpoint published by a single employer's
// ATS. That is why these sources work where Indeed/Glassdoor do not: they are
// machine-readable feeds with no bot wall, no client-side rendering, and no
// paywall — the employer published them for exactly this purpose.
//
// career-ops's insight, which we are adopting: breadth comes from adding
// providers, not from scraping more aggregators. Each provider is a small
// module with the same shape, so the registry grows without touching the
// orchestration.
//
// Each provider exposes:
//   id        unique provider id
//   list()    async (entry, ctx) => { rows, detail?, note? }
// where ctx carries { maxPerBoard, enrich, probeOnly, sleep }.
//
// A provider returns rows already normalized through makeJob(). A provider
// that cannot read its source throws or returns { rows: [], failed: true, ... }
// — never a bare [] — so "broken" stays distinguishable from "empty". That
// distinction is the whole point of the ledger and it is easy to lose by
// accident.

import { SchemaRecord } from '../../../types';

const CAREER_BASE_CONFIG_SCHEMA: SchemaRecord = { type: 'object', properties: {} };

// Providers are emitted as source text because the skill runs as one spawned
// program. Each is self-contained apart from the shared runtime (httpGet,
// getJson, makeJob, helpers).
export const CAREER_ATS_PROVIDERS_SOURCE = String.raw`
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
`;
