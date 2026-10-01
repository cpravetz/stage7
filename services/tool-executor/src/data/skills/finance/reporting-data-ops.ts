// @ts-nocheck
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';
import { financeResultSchema } from './finance-contract';

const REPORTING_ENDPOINT_ENV = 'FINANCE_REPORTING_ENDPOINT';
const REPORTING_API_KEY_ENV = 'FINANCE_REPORTING_API_KEY';

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

const reportingDataOpsSkill = createDeclarativeCodeSkill({
  id: 'reporting-data-ops',
  name: 'Reporting & Data Ops',
  description: 'Assemble periodic financial reports from ledger lines, deriving section and net totals and cross-checking any stated figure, then stage the report for a configured board-reporting destination behind an explicit confirmation gate. With no destination configured it renders the report from local data and marks the publish as not connected.',
  persistenceEnvVar: 'STORAGE_DIR',
  tier: 'represent',
  domainKnowledge: 'US GAAP/IFRS reporting standards, board reporting templates, and financial statement preparation',
  inputSchema: reportingDataOpsInputSchema,
  outputSchema: reportingDataOpsOutputSchema,
  triggers: [
    { kind: 'schedule', cadence: 'periodic reporting' },
  ],
  confirmBeforeSend: true,
  isSkill: true,
  manifest: {
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
    timeoutMs: 30000
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const ENDPOINT_ENV = "FINANCE_REPORTING_ENDPOINT";
      const API_KEY_ENV = "FINANCE_REPORTING_API_KEY";

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
        return { success: false, status: 'blocked', data: { report: report, sent: false }, error: 'No ledger lines were supplied, so no report could be produced.', present: [{ id: 'reporting-data-ops-blocked', title: 'Reporting has no source data', kind: 'text', body: reportLines.join(NL) }] };
        return;
      }

      if (!endpoint) {
        return { success: false, status: 'not-connected', data: { report: report, endpoint: null, sent: false }, error: 'Not connected: ' + ENDPOINT_ENV + ' is not configured', present: [{ id: 'reporting-data-ops-summary', title: 'Financial report', kind: 'text', body: reportLines.concat([
            '',
            'No reporting destination is configured, so nothing was published. Set ' + ENDPOINT_ENV
            + ' to deliver this report to the board-reporting store.',
          ]).join(NL) }] };
        return;
      }

      if (liveRequested && !confirmed) {
        return { success: false, status: 'confirmation-required', data: { report: report, endpoint: endpoint, sent: false }, error: 'Confirmation required before publishing the report', present: [{ id: 'reporting-data-ops-staged', title: 'Report publish staged', kind: 'text', body: renderRequest(report).concat([
            '',
            'This publish was not sent: a live report delivery needs dryRun false and confirmation true.',
          ]).join(NL) }] };
        return;
      }

      if (dryRun) {
        return { success: true, status: 'dry-run', data: { report: report, endpoint: endpoint, sent: false }, error: null, present: [{ id: 'reporting-data-ops-staged', title: 'Report publish staged', kind: 'text', body: renderRequest(report).concat([
            '',
            'Dry run: the report above was assembled locally and nothing was sent.',
          ]).join(NL) }] };
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
        return { success: res.ok, status: res.ok ? 'ok' : 'failed', data: { report: report, endpoint: endpoint, sent: true, responseStatus: res.status, responseData: responseData }, error: res.ok ? null : 'The reporting endpoint responded with status ' + res.status, present: [{ id: 'reporting-data-ops-summary', title: 'Financial report', kind: 'text', body: sendLines.join(NL) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, status: 'failed', data: { report: report, endpoint: endpoint, sent: true }, error: message, present: [{ id: 'reporting-data-ops-failed', title: 'Report publish failed', kind: 'text',
            body: ['The reporting endpoint could not be reached: ' + message, '', 'The report was not published.', '']
              .concat(reportLines).join(NL) }] };
      }
    }
  });
reportingDataOpsSkill.configSchema = createSchemaRecord({
      endpointUrl: SchemaProps.url({ description: 'Reporting endpoint URL; may also be supplied at runtime through ' + REPORTING_ENDPOINT_ENV }),
      apiKey: SchemaProps.password({ description: 'API key for the reporting endpoint' }),
      channel: SchemaProps.select(['email', 'portal', 'api', 'file'], { description: 'Default delivery channel for published reports' }),
      system: SchemaProps.select(['netsuite', 'quickbooks', 'xero', 'custom'], { description: 'Reporting store the report is written to' }),
      defaultReportType: SchemaProps.select(['profit-and-loss', 'balance-sheet', 'cash-flow', 'budget-variance', 'management-summary'], { description: 'Default report type for scheduled runs' }),
      confirmBeforeSend: SchemaProps.boolean({ description: 'Require explicit confirmation before publishing a report', default: true }),
      defaultDryRun: SchemaProps.boolean({ description: 'Default reporting to dry-run', default: true }),
    });

export { reportingDataOpsSkill };
