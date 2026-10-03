import { SchemaProps } from '../../adk/code-skill-factory';

export const ANALYTICS_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    metric: SchemaProps.text({ description: 'Metric name to analyze, such as page_views, conversions, revenue, or occupancy' }),
    dataset: SchemaProps.text({ description: 'Dataset or metric alias used for trend analysis' }),
    period: SchemaProps.text({ description: 'Report period, such as 7d, 30d, 90d, YTD, or 1y', default: '30d' }),
    timeframe: SchemaProps.text({ description: 'Trend timeframe, such as 7d, 30d, 90d, or 1y', default: '30d' }),
    provider: SchemaProps.select(['snowflake', 'bigquery', 'redshift', 'postgres', 'mysql', 'clickhouse', 'looker', 'tableau', 'metabase', 'custom'], { description: 'Warehouse or BI provider override' }),
    database: SchemaProps.text({ description: 'Database or schema to query' }),
    warehouse: SchemaProps.text({ description: 'Warehouse or compute resource to use' }),
    queryTimeoutMs: SchemaProps.number({ description: 'Warehouse request timeout in milliseconds', default: 120000, minimum: 1000 }),
    metricsPath: SchemaProps.text({ description: 'Local metrics cache path override' }),
    warehouseConfigPath: SchemaProps.text({ description: 'Warehouse connector configuration path override' }),
    query: SchemaProps.textarea({ description: 'SQL or analytical query to execute when mode is query' }),
    warehouseQuery: SchemaProps.textarea({ description: 'Optional warehouse query override' }),
    parameters: SchemaProps.object({}, { description: 'Parameter values for the analytical query', additionalProperties: true }),
    dimensions: SchemaProps.stringArray({ description: 'Dimensions to include in grouping or explanation' }),
    filters: SchemaProps.object({}, { description: 'Metric or warehouse filters', additionalProperties: true }),
    sourceMode: SchemaProps.select(['auto', 'warehouse', 'local'], { description: 'Data source selection; auto tries the warehouse and then the local cache', default: 'auto' }),
    dryRun: SchemaProps.boolean({ description: 'Prepare the query plan without executing a warehouse request', default: false }),
  },
  required: [],
};

export const ANALYTICS_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether grounded analysis or a query plan was produced' },
    source: { type: 'string', enum: ['warehouse', 'local', 'local-fallback', 'query-plan', 'not-connected'], description: 'Data source used for the result' },
    warehouseConnected: { type: 'boolean', description: 'Whether a warehouse connector was available for this run' },
    connectorStatus: { type: 'string', enum: ['connected', 'not-configured', 'unavailable', 'not-executed'], description: 'Warehouse connector status' },
    data: { type: 'object', description: 'Metric insight, trend analysis, query result, or query plan' },
    error: { type: ['string', 'null'], description: 'Explicit failure reason when no grounded result is available' },
    note: { type: ['string', 'null'], description: 'Source, fallback, or freshness disclosure' },
  },
  required: ['success', 'source', 'warehouseConnected', 'connectorStatus', 'data', 'error', 'note'],
};

export const ANALYTICS_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    endpointUrl: SchemaProps.url({ description: 'Warehouse or BI query endpoint' }),
    provider: SchemaProps.select(['snowflake', 'bigquery', 'redshift', 'postgres', 'mysql', 'clickhouse', 'looker', 'tableau', 'metabase', 'custom'], { description: 'Warehouse or BI provider' }),
    defaultDatabase: SchemaProps.text({ description: 'Default database or schema' }),
    defaultWarehouse: SchemaProps.text({ description: 'Default compute warehouse or service' }),
    queryTimeoutMs: SchemaProps.number({ description: 'Warehouse query timeout in milliseconds', default: 120000 }),
    metricsPath: SchemaProps.text({ description: 'Local metric cache path', default: '/tmp/analytics/metrics.json' }),
    warehouseConfigPath: SchemaProps.text({ description: 'Optional JSON connector configuration path', default: '/tmp/analytics/warehouse-config.json' }),
  },
};
