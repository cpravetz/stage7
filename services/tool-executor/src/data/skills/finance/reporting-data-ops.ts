import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';
import { financeResultSchema } from './finance-contract';

const REPORTING_ENDPOINT_ENV = 'FINANCE_REPORTING_ENDPOINT';
const REPORTING_API_KEY_ENV = 'FINANCE_REPORTING_API_KEY';

/**
 * Reporting and data ops.
 *
 * The skill assembles a financial report from the ledger lines it is given, on a periodic schedule,
 * and may publish it to a configured board-reporting destination. Three properties are deliberate:
 *
 * 1. Totals are derived from the supplied lines rather than trusted from a stated figure. A report
 *    that echoes an unchecked input total is worse than no report, because it reads as verified.
 * 2. The publish step is confirmation-gated and dry-run by default. A scheduled report that silently
 *    emailed the board on every tick would be a governance incident, not a feature.
 * 3. When no reporting destination is configured the report is still rendered from local data and the
 *    publish is marked not connected, so the periodic tick produces something a human can read.
 */
const REPORTING_DATA_OPS_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';
  const ENDPOINT_ENV = ${JSON.stringify(REPORTING_ENDPOINT_ENV)};
  const API_KEY_ENV = ${JSON.stringify(REPORTING_API_KEY_ENV)};

  function emit(success, status, data, error, present) {
    console.log(JSON.stringify({
      success: success, status: status, data: data || null, error: error || null, present: present || [],
    }));
  }

  function round2(n) { return Math.round(n * 100) / 100; }
  function round4(n) { return Math.round(n * 10000) / 10000; }
  function num(value) { return typeof value === 'number' && isFinite(value) ? value : null; }

  const dryRun = input.dryRun === true || input.dryRun === undefined;
  const liveRequested = input.dryRun === false;
  const confirmed = input.confirmation === true;

  const reportType = String(input.reportType || 'profit-and-loss');
  const dataRange = input.dataRange || {};
  const lines = Array.isArray(input.lines) ? input.lines : [];

  // Lines are grouped by section so a P&L, cash-flow and balance-sheet report can share one input
  // shape. Revenue and expense sections are kept apart because a mixed total is meaningless.
  const REVENUE_SECTIONS = ['revenue', 'income'];
  const EXPENSE_SECTIONS = ['cost', 'expense', 'opex', 'cogs'];

  const sections = {};
  const order = [];
  lines.forEach(function (line) {
    if (!line || typeof line !== 'object') return;
    const section = String(line.section || 'other');
    const label = String(line.label || section);
    const amount = num(line.amount);
    if (amount === null) return;
    if (!sections[section]) { sections[section] = { section: section, total: 0, count: 0 }; order.push(section); }
    sections[section].total = round2(sections[section].total + amount);
    sections[section].count += 1;
  });

  const renderedSections = order.map(function (key) {
    return { section: key, total: sections[key].total, count: sections[key].count };
  });

  const sumOf = function (names) {
    return round2(order.reduce(function (total, key) {
      if (names.indexOf(key) === -1) return total;
      return total + sections[key].total;
    }, 0));
  };

  const revenue = sumOf(REVENUE_SECTIONS);
  const expense = sumOf(EXPENSE_SECTIONS);
  const net = round2(revenue - expense);
  const netMargin = revenue > 0 ? round4(net / revenue) : null;

  const other = order.filter(function (key) {
    return REVENUE_SECTIONS.indexOf(key) === -1 && EXPENSE_SECTIONS.indexOf(key) === -1;
  });
  const unattributed = round2(other.reduce(function (total, key) { return total + sections[key].total; }, 0));

  const statedRevenue = num(input.statedRevenue);
  const statedExpense = num(input.statedExpense);
  const revenueDisagreement = statedRevenue !== null && Math.abs(statedRevenue - revenue) > 0.005;
  const expenseDisagreement = statedExpense !== null && Math.abs(statedExpense - expense) > 0.005;

  const report = {
    reportType: reportType,
    entity: input.entity || null,
    dataRange: {
      start: dataRange.start || null,
      end: dataRange.end || null,
      label: dataRange.label || null,
    },
    sections: renderedSections,
    totals: {
      revenue: revenue,
      expense: expense,
      net: net,
      netMargin: netMargin,
      unattributed: unattributed,
    },
    dataQuality: {
      lineCount: renderedSections.reduce(function (sum, s) { return sum + s.count; }, 0),
      statedRevenue: statedRevenue,
      statedExpense: statedExpense,
      revenueDisagreement: revenueDisagreement,
      expenseDisagreement: expenseDisagreement,
      unattributedSections: other,
    },
    basis: input.basis || 'accrual',
    currency: input.currency || 'USD',
  };

  function renderReport(r) {
    const out = [];
    out.push(r.reportType.replace(/-/g, ' ') + (r.entity ? ' - ' + r.entity : ''));
    out.push('Range: ' + (r.dataRange.label || ((r.dataRange.start || '?') + ' to ' + (r.dataRange.end || '?'))));
    out.push('Basis: ' + r.basis + ' | Currency: ' + r.currency);
    out.push('');
    if (!r.sections.length) {
      out.push('No ledger lines were supplied, so no report totals could be derived.');
    } else {
      r.sections.forEach(function (s) {
        out.push('  ' + s.section + ': ' + s.total + ' (' + s.count + ' line' + (s.count === 1 ? '' : 's') + ')');
      });
    }
    out.push('');
    out.push('Revenue: ' + r.totals.revenue + ' | Expense: ' + r.totals.expense + ' | Net: ' + r.totals.net);
    if (r.totals.netMargin !== null) out.push('Net margin: ' + (r.totals.netMargin * 100).toFixed(1) + '%');
    if (r.dataQuality.unattributedSections.length) {
      out.push('');
      out.push('Sections not classified as revenue or expense: ' + r.dataQuality.unattributedSections.join(', '));
    }
    if (r.dataQuality.revenueDisagreement || r.dataQuality.expenseDisagreement) {
      out.push('');
      out.push('WARNING: a stated total does not match the sum of its lines. The lines above are the derived figures.');
    }
    return out;
  }

  function renderRequest(r) {
    return [
      'Destination: ' + (input.channel || 'board reporting') + ' (' + (input.system || 'reporting store') + ')',
      'Report: ' + r.reportType,
      'Range: ' + (r.dataRange.label || ((r.dataRange.start || '?') + ' to ' + (r.dataRange.end || '?'))),
      'Recipients: ' + (Array.isArray(input.recipients) && input.recipients.length ? input.recipients.join(', ') : 'none listed'),
    ];
  }

  const endpoint = String(input.endpoint || process.env[ENDPOINT_ENV] || '').trim();
  const reportLines = renderReport(report);

  if (!lines.length) {
    emit(false, 'blocked', { report: report, sent: false },
      'No ledger lines were supplied, so no report could be produced.',
      [{ id: 'reporting-data-ops-blocked', title: 'Reporting has no source data', kind: 'text', body: reportLines.join(NL) }]);
    return;
  }

  if (!endpoint) {
    emit(false, 'not-connected', { report: report, endpoint: null, sent: false },
      'Not connected: ' + ENDPOINT_ENV + ' is not configured',
      [{ id: 'reporting-data-ops-summary', title: 'Financial report', kind: 'text', body: reportLines.concat([
        '',
        'No reporting destination is configured, so nothing was published. Set ' + ENDPOINT_ENV
        + ' to deliver this report to the board-reporting store.',
      ]).join(NL) }]);
    return;
  }

  if (liveRequested && !confirmed) {
    emit(false, 'confirmation-required', { report: report, endpoint: endpoint, sent: false },
      'Confirmation required before publishing the report',
      [{ id: 'reporting-data-ops-staged', title: 'Report publish staged', kind: 'text', body: renderRequest(report).concat([
        '',
        'This publish was not sent: a live report delivery needs dryRun false and confirmation true.',
      ]).join(NL) }]);
    return;
  }

  if (dryRun) {
    emit(true, 'dry-run', { report: report, endpoint: endpoint, sent: false }, null,
      [{ id: 'reporting-data-ops-staged', title: 'Report publish staged', kind: 'text', body: renderRequest(report).concat([
        '',
        'Dry run: the report above was assembled locally and nothing was sent.',
      ]).join(NL) }]);
    return;
  }

  const headers = { 'Content-Type': 'application/json' };
  const apiKey = String(input.apiKey || process.env[API_KEY_ENV] || '').trim();
  if (apiKey) headers['Authorization'] = 'Bearer ' + apiKey;
  const body = JSON.stringify({ operation: 'reporting-data-ops', report: report, recipients: input.recipients || [], format: input.format || 'markdown' });

  try {
    const res = await fetch(endpoint, { method: 'POST', headers: headers, body: body });
    const responseText = await res.text();
    let responseData = null;
    if (responseText) { try { responseData = JSON.parse(responseText); } catch (e) { responseData = { text: responseText }; } }

    const sendLines = renderRequest(report).concat(['', 'Endpoint responded: ' + res.status, ''], reportLines);
    emit(res.ok, res.ok ? 'ok' : 'failed',
      { report: report, endpoint: endpoint, sent: true, responseStatus: res.status, responseData: responseData },
      res.ok ? null : 'The reporting endpoint responded with status ' + res.status,
      [{ id: 'reporting-data-ops-summary', title: 'Financial report', kind: 'text', body: sendLines.join(NL) }]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    emit(false, 'failed', { report: report, endpoint: endpoint, sent: true }, message,
      [{ id: 'reporting-data-ops-failed', title: 'Report publish failed', kind: 'text',
        body: ['The reporting endpoint could not be reached: ' + message, '', 'The report was not published.', '']
          .concat(reportLines).join(NL) }]);
  }
})();`;

const reportingDataOpsInputSchema = createSchemaRecord({
  reportType: SchemaProps.select(['profit-and-loss', 'balance-sheet', 'cash-flow', 'budget-variance', 'management-summary'], {
    description: 'Type of financial report to produce', default: 'profit-and-loss',
  }),
  dataRange: SchemaProps.object({
    start: SchemaProps.text({ description: 'Start of the reporting range (ISO 8601 date)' }),
    end: SchemaProps.text({ description: 'End of the reporting range (ISO 8601 date)' }),
    label: SchemaProps.text({ description: 'Human-readable range label (e.g. 2026-Q3)' }),
  }, { description: 'Reporting range the report covers' }),
  entity: SchemaProps.text({ description: 'Entity the report covers' }),
  lines: SchemaProps.objectArray(SchemaProps.object({
    section: SchemaProps.text({ description: 'Section the line belongs to (revenue, cost, other)' }),
    label: SchemaProps.text({ description: 'Line item label' }),
    amount: SchemaProps.number({ description: 'Amount for the line' }),
  }), { description: 'Ledger lines the report totals are derived from' }),
  statedRevenue: SchemaProps.number({ description: 'Stated revenue total, cross-checked against the sum of the lines' }),
  statedExpense: SchemaProps.number({ description: 'Stated expense total, cross-checked against the sum of the lines' }),
  basis: SchemaProps.select(['accrual', 'cash'], { description: 'Accounting basis for the report', default: 'accrual' }),
  currency: SchemaProps.text({ description: 'Reporting currency', default: 'USD' }),
  channel: SchemaProps.select(['email', 'portal', 'api', 'file'], { description: 'Channel the report is published through' }),
  system: SchemaProps.select(['netsuite', 'quickbooks', 'xero', 'custom'], { description: 'Reporting store the report is written to' }),
  recipients: SchemaProps.stringArray({ description: 'Recipients of the published report' }),
  format: SchemaProps.select(['markdown', 'json', 'csv'], { description: 'Published report format', default: 'markdown' }),
  endpoint: SchemaProps.url({ description: 'Reporting endpoint override for this call' }),
  apiKey: SchemaProps.password({ description: 'Optional API key override for the reporting endpoint' }),
  dryRun: SchemaProps.boolean({ description: 'Assemble the report without publishing it; defaults to true', default: true }),
  confirmation: SchemaProps.boolean({ description: 'Explicit approval for a live report publish; required when dryRun is false', default: false }),
});

const reportingDataOpsOutputSchema = financeResultSchema(
  'Assembled financial report: section totals, revenue/expense/net summary with net margin, the reporting range '
  + 'and basis, data-quality cross-checks against any stated totals, and whether anything was actually published',
);

const reportingDataOpsSkill = createCodeSkill({
  id: 'reporting-data-ops',
  name: 'Reporting & Data Ops',
  description: 'Assemble periodic financial reports from ledger lines, deriving section and net totals and cross-checking any stated figure, then stage the report for a configured board-reporting destination behind an explicit confirmation gate. With no destination configured it renders the report from local data and marks the publish as not connected.',
  tier: 'represent',
  domainKnowledge: 'US GAAP/IFRS reporting standards, board reporting templates, and financial statement preparation',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: REPORTING_DATA_OPS_SOURCE,
    configSchema: createSchemaRecord({
      endpointUrl: SchemaProps.url({ description: 'Reporting endpoint URL; may also be supplied at runtime through ' + REPORTING_ENDPOINT_ENV }),
      apiKey: SchemaProps.password({ description: 'API key for the reporting endpoint' }),
      channel: SchemaProps.select(['email', 'portal', 'api', 'file'], { description: 'Default delivery channel for published reports' }),
      system: SchemaProps.select(['netsuite', 'quickbooks', 'xero', 'custom'], { description: 'Reporting store the report is written to' }),
      defaultReportType: SchemaProps.select(['profit-and-loss', 'balance-sheet', 'cash-flow', 'budget-variance', 'management-summary'], { description: 'Default report type for scheduled runs' }),
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before publishing a report', default: true }),
      defaultDryRun: SchemaProps.boolean({ description: 'Default reporting to dry-run', default: true }),
    }),
    endpointEnvVar: REPORTING_ENDPOINT_ENV,
    // Deliberately no manifest credentialSource. Declaring one makes the core credential gate demand
    // the key before the skill runs, which would block the local-render path that publishes nothing.
    persistenceEnv: 'FINANCE_HOME',
    confirmBeforeSend: true,
    timeoutMs: 30000,
  },
  inputSchema: reportingDataOpsInputSchema,
  outputSchema: reportingDataOpsOutputSchema,
  triggers: [
    { kind: 'schedule', cadence: 'periodic reporting' },
  ],
  confirmBeforeSend: true,
  isSkill: true,
});

export { reportingDataOpsSkill };
