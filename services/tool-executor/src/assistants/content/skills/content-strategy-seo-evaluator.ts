// @ts-nocheck

import { createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';
import { contentResultSchema } from '../content-contract';

export const CONTENT_STRATEGY_SEO_EVALUATOR = createDeclarativeCodeSkill({
  id: 'content-strategy-seo-evaluator',
  name: 'Content Strategy & SEO Evaluator',
  description:
    'Evaluates supplied content performance records (or records returned by connected analytics) and ranks them by a relative engagement index. Measures CTR and conversion rate from the supplied impressions, clicks, and conversions; excludes any metric the caller did not supply instead of scoring it as zero, and states which inputs are missing. Queries no search-volume or ranking data, so the index is relative to the supplied set only.',
  persistenceEnvVar: 'CONTENT_HOME',
  tier: 'advise',
  domainKnowledge:
    'Content performance measurement: CTR and conversion-rate derivation, relative engagement indexing, search-intent and keyword-match evaluation, and editorial performance benchmarking',
  inputSchema: {
    type: 'object',
    properties: {
      contentItems: {
        type: 'array',
        description: 'Content performance records with impressions, clicks, conversions, and optionally keywordMatch',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string' },
            impressions: { type: 'number' },
            clicks: { type: 'number' },
            conversions: { type: 'number' },
            keywordMatch: { type: 'number' },
          },
        },
      },
      contentIds: { type: 'array', items: { type: 'string' }, description: 'Content identifiers to request from connected analytics' },
      channel: { type: 'string', description: 'Channel or platform' },
      platform: { type: 'string', description: 'Specific analytics platform' },
      metrics: { type: 'array', items: { type: 'string' }, description: 'Metrics to request from connected analytics' },
      dateRange: { type: 'object', description: 'Analysis date range' },
      keywordMatch: { type: 'number', description: 'Fallback search-intent match score (0-100) applied to records that do not carry their own' },
    },
    required: [],
  },
  outputSchema: contentResultSchema('Evaluated records, averages, and the coverage of connected analytics'),
  triggers: [
    { kind: 'schedule', cadence: 'weekly editorial performance review against the prior cycle' },
    { kind: 'user', phrase_examples: ['evaluate content strategy', 'which content is working', 'review content performance'] },
  ],
  isSkill: true,
  manifest: {
    ui: { view: 'content-strategy' }
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const ANALYTICS_TOOL = 'content-performance-seo';

      const fail = (status, message, title, extra) => {
        const base = { success: false, status: status, error: message, data: null };
        if (extra) { for (const key in extra) { base[key] = extra[key]; } }
        base.present = [{ id: 'notice', title: title, kind: 'text', body: message }];
        return base;
      };

      const items = Array.isArray(input.contentItems) ? input.contentItems.filter(function (i) { return i && typeof i === 'object'; }) : [];
      const contentIds = Array.isArray(input.contentIds) ? input.contentIds.filter(function (v) { return typeof v === 'string' && v.length > 0; }) : [];
      const defaultKeywordMatch = typeof input.keywordMatch === 'number' ? input.keywordMatch : null;

      // ---- Delegation ---------------------------------------------------------------
      // content-performance-seo is the connected-analytics path. Its outcome is recorded either way so
      // the report can state coverage, and a failure is never silently folded into a success.
      let analyticsAttempted = false;
      let analyticsError = null;
      let analyticsConnected = false;
      let analyticsRecords = [];

      const wantsAnalytics = contentIds.length > 0 || items.length === 0;
      if (wantsAnalytics) {
        analyticsAttempted = true;
        try {
          const result = await ctx.delegate(ANALYTICS_TOOL, {
            contentIds: contentIds.length > 0 ? contentIds : [],
            channel: input.channel,
            platform: input.platform,
            metrics: Array.isArray(input.metrics) && input.metrics.length > 0 ? input.metrics : ['impressions', 'clicks', 'conversions'],
            dateRange: input.dateRange,
            dryRun: true,
          });
          // content-performance-seo is a createExternalActionSkill, which emits
          // { success, system, action, request, response, error }. There is no
          // top-level data key: the analytics payload arrives at response.data.
          // Reading result.data alone left this guard permanently false, so the
          // connected analytics path never ran and every run reported "not connected".
          const analyticsPayload = result
            ? (result.response && result.response.data ? result.response.data : result.data)
            : null;
          if (result && result.success && analyticsPayload) {
            analyticsConnected = true;
            const payload = analyticsPayload;
            const records = Array.isArray(payload.records) ? payload.records
              : (Array.isArray(payload) ? payload : null);
            if (records) analyticsRecords = records;
          } else {
            analyticsError = (result && (result.error || result.message)) || 'Connected analytics returned no records.';
          }
        } catch (error) {
          analyticsError = error && error.message ? error.message : String(error);
        }
      }

      const records = items.length > 0 ? items : analyticsRecords;
      const source = items.length > 0 ? 'supplied records' : (analyticsConnected ? 'connected analytics' : 'none');

      if (!records.length) {
        return fail('not-connected',
          'Not connected: no content performance records were supplied and connected analytics returned nothing to evaluate.',
          'No data to evaluate',
          {
            coverage: {
              suppliedRecords: items.length,
              analyticsTool: ANALYTICS_TOOL,
              analyticsAttempted: analyticsAttempted,
              analyticsConnected: analyticsConnected,
              analyticsError: analyticsError,
            },
          });
      }

      // ---- Derivation ----------------------------------------------------------------
      const num = (value) => {
        const n = Number(value);
        return Number.isFinite(n) ? n : null;
      };

      const analysed = records.map(function (item) {
        const impressions = num(item.impressions);
        const clicks = num(item.clicks);
        const conversions = num(item.conversions);
        const keywordMatch = num(item.keywordMatch) !== null ? num(item.keywordMatch) : defaultKeywordMatch;

        const ctr = (impressions !== null && impressions > 0 && clicks !== null) ? Math.round((clicks / impressions) * 10000) / 100 : null;
        const conversionRate = (clicks !== null && clicks > 0 && conversions !== null) ? Math.round((conversions / clicks) * 10000) / 100 : null;

        const metrics = {};
        if (ctr !== null) metrics.ctr = ctr;
        if (conversionRate !== null) metrics.conversionRate = conversionRate;
        if (keywordMatch !== null) metrics.keywordMatch = keywordMatch;

        const missing = [];
        if (ctr === null) missing.push(impressions === null ? 'impressions' : 'clicks');
        if (conversionRate === null) missing.push(conversions === null ? 'conversions' : 'clicks');
        if (keywordMatch === null) missing.push('keywordMatch');

        return {
          id: item.id || item.contentId || null,
          title: item.title || item.name || null,
          impressions: impressions,
          clicks: clicks,
          conversions: conversions,
          keywordMatch: keywordMatch,
          ctr: ctr,
          conversionRate: conversionRate,
          metrics: metrics,
          availableMetrics: Object.keys(metrics),
          missingMetrics: missing,
        };
      });

      // Relative index: each available metric is scaled against the best value in this set and the
      // scales are averaged. An input that was never supplied is left out rather than scored as zero.
      const metricNames = ['ctr', 'conversionRate', 'keywordMatch'];
      const maxima = {};
      metricNames.forEach(function (name) {
        const values = analysed.map(function (row) { return row.metrics[name]; })
          .filter(function (v) { return v !== undefined; });
        maxima[name] = values.length > 0 ? Math.max.apply(null, values) : null;
      });

      let scoredRows = 0;
      analysed.forEach(function (row) {
        const scales = [];
        metricNames.forEach(function (name) {
          const value = row.metrics[name];
          if (value === undefined) return;
          const max = maxima[name];
          scales.push(max !== null && max > 0 ? Math.round((value / max) * 1000) / 10 : 0);
        });
        row.index = scales.length > 0 ? Math.round((scales.reduce(function (a, b) { return a + b; }, 0) / scales.length) * 10) / 10 : null;
        if (row.index !== null) scoredRows += 1;
      });

      analysed.forEach(function (row) {
        if (row.index === null) {
          row.verdict = 'not scorable';
          row.action = 'Supply impressions, clicks, or conversions for this record so it can be ranked.';
        } else if (row.index >= 75) {
          row.verdict = 'strongest in this set';
          row.action = 'Expand distribution: add internal links, and reuse this angle on adjacent topics.';
        } else if (row.index >= 50) {
          row.verdict = 'mid-pack in this set';
          row.action = 'Test a new title and meta description; the body is earning clicks, the snippet may not be.';
        } else {
          row.verdict = 'weakest in this set';
          row.action = 'Check that the page matches the search intent it targets before rewriting it.';
        }
      });

      const sorted = analysed.slice().sort(function (a, b) { return (b.index === null ? -1 : b.index) - (a.index === null ? -1 : a.index); });
      const scorable = analysed.filter(function (row) { return row.index !== null; });
      const averages = {};
      metricNames.forEach(function (name) {
        const values = analysed.map(function (row) { return row.metrics[name]; }).filter(function (v) { return v !== undefined; });
        averages[name] = values.length > 0
          ? Math.round((values.reduce(function (a, b) { return a + b; }, 0) / values.length) * 100) / 100
          : null;
      });

      // ---- Report ---------------------------------------------------------------------
      const L = [];
      L.push('Evaluated ' + analysed.length + ' content record' + (analysed.length === 1 ? '' : 's') + ' from ' + source + '.');
      L.push('');
      L.push('Measured rates');
      analysed.forEach(function (row) {
        const label = row.title || row.id || '(untitled record)';
        const parts = [];
        parts.push(row.ctr === null ? 'CTR not computable' : 'CTR ' + row.ctr + '%');
        parts.push(row.conversionRate === null ? 'conversion rate not computable' : 'conversion rate ' + row.conversionRate + '%');
        if (row.keywordMatch !== null) parts.push('keyword match ' + row.keywordMatch);
        L.push('  ' + label);
        L.push('    ' + parts.join('   |   '));
        if (row.index !== null) {
          L.push('    Relative index ' + row.index + ' (of 100 against the best record in this set) - ' + row.verdict);
        } else {
          L.push('    Not scorable - no comparable metric was supplied.');
        }
        L.push('    Action: ' + row.action);
        if (row.missingMetrics.length > 0) {
          L.push('    Not supplied, and excluded from the index rather than scored as zero: ' + row.missingMetrics.join(', '));
        }
      });
      L.push('');
      L.push('Set averages');
      metricNames.forEach(function (name) {
        if (averages[name] !== null) {
          L.push('  ' + name + ': ' + averages[name] + (name === 'ctr' || name === 'conversionRate' ? '%' : ''));
        }
      });
      if (scoredRows < analysed.length) {
        L.push('  ' + (analysed.length - scoredRows) + ' record' + (analysed.length - scoredRows === 1 ? '' : 's') + ' could not be scored for lack of a supplied metric.');
      }
      L.push('');
      L.push('Ranked strongest first');
      sorted.forEach(function (row, index) {
        L.push('  ' + (index + 1) + '. ' + (row.title || row.id || '(untitled record)')
          + (row.index !== null ? '  -  index ' + row.index : '  -  not scorable'));
      });
      if (sorted.length > 0 && sorted[0].index !== null) {
        L.push('');
        L.push('  Lead with "' + (sorted[0].title || sorted[0].id) + '" in the next planning cycle; it is the strongest record you supplied.');
      }

      const coverageLines = [];
      coverageLines.push('Records came from: ' + source + '.');
      if (analyticsAttempted) {
        coverageLines.push(ANALYTICS_TOOL + ' was called: ' + (analyticsConnected ? 'returned data.' : 'did not return data (' + (analyticsError || 'no error detail') + ').'));
      } else {
        coverageLines.push(ANALYTICS_TOOL + ' was not called - you supplied records directly, so no connected analytics was consulted.');
      }
      if (!analyticsAttempted || !analyticsConnected) {
        coverageLines.push('Unassessed without that connection: keyword search volume, competitor ranking, and traffic outside the supplied records.');
      }
      coverageLines.push('The relative index is measured only against the records in this set. It is not a benchmark against search volume, ranking, or any market average.');

      const blocks = [
        { id: 'report', title: 'Content performance review', kind: 'text', body: L.join(NL) },
        { id: 'coverage', title: 'Coverage and data scope', kind: 'text', body: coverageLines.map(function (line) { return '- ' + line; }).join(NL) },
      ];

      return {
        success: true,
        status: analyticsConnected || items.length > 0 ? 'ok' : 'partial',
        error: null,
        data: {
          evaluated: analysed,
          summary: {
            records: analysed.length,
            scored: scoredRows,
            unscored: analysed.length - scoredRows,
            averages: averages,
            topId: sorted.length > 0 ? (sorted[0].id || null) : null,
            topIndex: sorted.length > 0 ? sorted[0].index : null,
          },
          source: source,
          coverage: {
            suppliedRecords: items.length,
            analyticsTool: ANALYTICS_TOOL,
            analyticsAttempted: analyticsAttempted,
            analyticsConnected: analyticsConnected,
            analyticsError: analyticsError,
            metricsScored: metricNames.filter(function (name) { return maxima[name] !== null; }),
            metricsExcluded: metricNames.filter(function (name) { return maxima[name] === null; }),
          },
          scope: 'relative-to-supplied-set',
        },
        present: blocks,
      };
    }
  });
