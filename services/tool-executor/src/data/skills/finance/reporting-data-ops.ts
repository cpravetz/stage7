import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const reportingDataOpsInputSchema = createSchemaRecord({
  operation: SchemaProps.select(['reporting', 'data', 'cleaning', 'documents'], { description: 'Operation type: reporting for report generation, data for data retrieval, cleaning for data cleaning, documents for document management' }),
  endpointUrl: SchemaProps.url({ description: 'Override endpoint URL for the external service' }),
  reportType: SchemaProps.select(['income-statement', 'balance-sheet', 'cash-flow', 'board-pack', 'kpi-dashboard', 'custom'], { description: 'Type of report to generate' }),
  dateRange: SchemaProps.object({
    start: SchemaProps.text({ description: 'Start date (ISO 8601)' }),
    end: SchemaProps.text({ description: 'End date (ISO 8601)' }),
  }, { description: 'Date range for the report or query' }),
  format: SchemaProps.select(['json', 'csv', 'pdf', 'xlsx'], { description: 'Output format' }),
  metrics: SchemaProps.stringArray({ description: 'Specific metrics or KPIs to include' }),
  dataSource: SchemaProps.text({ description: 'Identifier for the financial data source' }),
  filters: SchemaProps.object({}, { description: 'Key-value filters for data retrieval', additionalProperties: true }),
  cleaningRules: SchemaProps.objectArray(SchemaProps.object({
    field: SchemaProps.text({ description: 'Field name to clean' }),
    rule: SchemaProps.select(['trim', 'normalize', 'deduplicate', 'validate', 'fill-missing'], { description: 'Cleaning rule to apply' }),
    value: SchemaProps.text({ description: 'Replacement or validation value' }),
  }), { description: 'Data cleaning rules' }),
  documentIds: SchemaProps.stringArray({ description: 'Document identifiers to manage' }),
  documentAction: SchemaProps.select(['upload', 'tag', 'search', 'retrieve', 'delete'], { description: 'Document management action' }),
  tags: SchemaProps.stringArray({ description: 'Tags to apply to documents' }),
}, { required: ['operation'] });

const reportingDataOpsOutputSchema = createSchemaRecord({
  success: SchemaProps.boolean(),
  operation: SchemaProps.text(),
  mode: SchemaProps.select(['dry-run', 'live', 'error'], { description: 'Execution mode' }),
  report: SchemaProps.object({
    properties: {
      id: SchemaProps.text(),
      reportType: SchemaProps.text(),
      reportFormat: SchemaProps.text(),
      generatedAt: SchemaProps.text(),
      data: SchemaProps.object({}, { description: 'Report data payload' }),
      sections: SchemaProps.objectArray(SchemaProps.object({
        title: SchemaProps.text(),
        content: SchemaProps.object({}),
      })),
    },
  }),
  dataResult: SchemaProps.object({
    properties: {
      records: SchemaProps.objectArray(SchemaProps.object({})),
      totalCount: SchemaProps.integer(),
      source: SchemaProps.text(),
      cleanedAt: SchemaProps.text(),
    },
  }),
  cleaningResult: SchemaProps.object({
    properties: {
      inputRecords: SchemaProps.integer(),
      outputRecords: SchemaProps.integer(),
      changesApplied: SchemaProps.objectArray(SchemaProps.object({
        field: SchemaProps.text(),
        rule: SchemaProps.text(),
        before: SchemaProps.text(),
        after: SchemaProps.text(),
      })),
      transformationId: SchemaProps.text(),
    },
  }),
  documentResult: SchemaProps.object({
    properties: {
      documents: SchemaProps.objectArray(SchemaProps.object({
        id: SchemaProps.text(),
        name: SchemaProps.text(),
        tags: SchemaProps.stringArray(),
        status: SchemaProps.text(),
      })),
      total: SchemaProps.integer(),
    },
  }),
  error: SchemaProps.text(),
});

const reportingDataOpsSkill = createCodeSkill({
  id: 'reporting-data-ops',
  name: 'Reporting & Data Ops',
  description: 'Generate financial reports, retrieve and transform financial data, clean and reconcile datasets, and manage financial documents through connected reporting and data systems.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', format: 'uri', description: 'Base URL for the finance reporting and data service' },
        apiKey: { type: 'string', description: 'API key for the finance reporting and data service' },
        provider: { type: 'string', description: 'Provider identifier (e.g., snowflake, bigquery, custom)' },
      },
      required: ['baseUrl', 'apiKey', 'provider'],
    },
    sourceCode: `
const input = __tool_input || {};
const operation = input.operation || 'reporting';
const endpointUrl = input.endpointUrl || (globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_REPORTING_ENDPOINT) || '';
const apiKey = globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_API_KEY || '';
const provider = globalThis.process && globalThis.process.env && globalThis.process.env.FINANCE_PROVIDER || 'default';

if (!endpointUrl) {
  console.log(JSON.stringify({ success: true, operation, mode: 'dry-run', report: null, dataResult: null, cleaningResult: null, documentResult: null, error: null }));
  return;
}

const headers = { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey };
const body = JSON.stringify({ operation, ...input });

try {
  const res = await fetch(endpointUrl, { method: 'POST', headers, body });
  const contentType = res.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) { data = await res.json(); }
  else { const text = await res.text(); data = text ? { text } : null; }
  console.log(JSON.stringify({ success: res.ok, operation, mode: 'live', report: operation === 'reporting' ? data : null, dataResult: operation === 'data' ? data : null, cleaningResult: operation === 'cleaning' ? data : null, documentResult: operation === 'documents' ? data : null, error: null }));
} catch (err) {
  console.log(JSON.stringify({ success: false, operation, mode: 'error', error: err instanceof Error ? err.message : String(err), report: null, dataResult: null, cleaningResult: null, documentResult: null }));
}
`,
  },
  inputSchema: reportingDataOpsInputSchema,
  outputSchema: reportingDataOpsOutputSchema,
});

reportingDataOpsSkill.triggers = [
  { kind: 'user', phrase_examples: ['Generate a report', 'Retrieve financial data', 'Clean data', 'Manage documents'] },
  { kind: 'schedule', cadence: 'Monthly reporting cycle' },
  { kind: 'event', on: 'New accounting period' },
];

export { reportingDataOpsSkill };
