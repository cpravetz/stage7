// Collector engine: runs one provider against one entry and reports an honest
// outcome.
//
// The contract every collector honours, and the reason this file exists
// separately from the providers themselves:
//
//   ok        - the source was read AND at least one usable listing came back
//   no-match  - the source was read, its structure was recognised, and it
//               genuinely had nothing matching. A real answer.
//   error     - the source could NOT be retrieved, or was retrieved but its
//               structure could NOT be recognised. Nothing is known about what
//               it lists.
//
// The failure mode this exists to prevent: a provider that cannot parse its
// source returns [] and the run reports a clean zero, which reads as "the
// market has no matching roles" when the truth is "we could not read the
// board". Every path below keeps those apart.

export const CAREER_COLLECTOR_SOURCE = String.raw`
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
`;
