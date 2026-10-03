// Company-agnostic public job feeds.
//
// This is the answer to "discover jobs regardless of company". The ATS tier
// needs to know a company to build a board URL; these feeds do not. Each is a
// public, no-auth, structured feed that aggregates many employers, published by
// its owner for public consumption — the same "job_boards" tier career-ops
// sources from.
//
// Why this tier exists at all: with only ATS providers, a query-only run has no
// company to build a URL from and returns nothing. That is the failure this
// tier removes. It is also the only tier that can answer "what CPO roles are
// open right now, anywhere".
//
// Eligibility, per source:
//   - employer-attributed listings, free for the candidate to read
//   - no login, no key
//   - complete inventory of what the feed publishes (these are the publisher's
//     own feeds, not a promoted view)
//   - the publisher invites programmatic consumption
//
// Every feed is paginated or capped by its own protocol. Page counts come from
// this file's constants, never from a source-reported total alone — see the
// page ceiling notes on collectFeed below.

export const CAREER_FEED_PROVIDERS_SOURCE = String.raw`
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
`;
