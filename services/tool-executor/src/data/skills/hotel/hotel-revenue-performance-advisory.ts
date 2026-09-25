import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory';

const HOTEL_HOME = process.env.HOTEL_HOME || '/tmp/hotel';

const REVENUE_INPUT_SCHEMA = createSchemaRecord({
  propertyId: SchemaProps.text({ description: 'Hotel property identifier', required: true }),
  dateRange: SchemaProps.object({
    start: SchemaProps.text({ description: 'Analysis range start date or timestamp' }),
    end: SchemaProps.text({ description: 'Analysis range end date or timestamp' }),
  }, { description: 'Date range for analytics and recommendations' }),
  granularity: SchemaProps.select(['hourly', 'daily', 'weekly', 'monthly', 'quarterly'], {
    description: 'Time granularity for aggregation and forecasting',
  }),
  currency: SchemaProps.text({ description: 'Reporting currency code, such as USD or EUR' }),
  metrics: SchemaProps.stringArray({ description: 'Metrics to include, such as occupancy, adr, revpar, labor cost, or satisfaction' }),
  dimensions: SchemaProps.stringArray({ description: 'Dimensions for grouping results, such as channel, department, or segment' }),
  records: SchemaProps.objectArray(SchemaProps.object({
    date: SchemaProps.text({ description: 'Record date or timestamp' }),
    revenue: SchemaProps.number({ description: 'Record revenue', minimum: 0 }),
    roomsSold: SchemaProps.integer({ description: 'Rooms sold in the record', minimum: 0 }),
    availableRooms: SchemaProps.integer({ description: 'Available rooms in the record', minimum: 0 }),
    adr: SchemaProps.number({ description: 'Average daily rate for the record', minimum: 0 }),
    channel: SchemaProps.text({ description: 'Booking or sales channel' }),
    department: SchemaProps.text({ description: 'Operating department' }),
    staffId: SchemaProps.text({ description: 'Staff member associated with the record' }),
    tasksCompleted: SchemaProps.integer({ description: 'Tasks completed by the staff member', minimum: 0 }),
    guestSatisfaction: SchemaProps.number({ description: 'Guest satisfaction score', minimum: 0, maximum: 5 }),
  }, {}), { description: 'Supplied PMS, operational, or staff records for grounded analysis' }),
  channels: SchemaProps.stringArray({ description: 'Booking channels to compare' }),
  staffing: SchemaProps.objectArray(SchemaProps.object({
    staffId: SchemaProps.text({ description: 'Staff member identifier' }),
    department: SchemaProps.text({ description: 'Staff department' }),
    shifts: SchemaProps.integer({ description: 'Completed or scheduled shifts', minimum: 0 }),
    hoursWorked: SchemaProps.number({ description: 'Hours worked', minimum: 0 }),
    tasksCompleted: SchemaProps.integer({ description: 'Completed tasks', minimum: 0 }),
    guestSatisfaction: SchemaProps.number({ description: 'Guest satisfaction score', minimum: 0, maximum: 5 }),
  }, {}), { description: 'Staff performance records' }),
  staffId: SchemaProps.text({ description: 'Staff member to analyze' }),
  department: SchemaProps.text({ description: 'Department to filter or analyze' }),
  baselineRevenue: SchemaProps.number({ description: 'Baseline revenue used for variance or forecast calculations', minimum: 0 }),
  growthRate: SchemaProps.number({ description: 'Expected revenue growth rate as a percentage' }),
  targetOccupancy: SchemaProps.number({ description: 'Target occupancy percentage', minimum: 0, maximum: 100 }),
  targetAdr: SchemaProps.number({ description: 'Target average daily rate', minimum: 0 }),
  params: SchemaProps.object({}, { description: 'Additional advisory parameters', additionalProperties: true }),
  dryRun: SchemaProps.boolean({ description: 'Return an advisory draft without persisting or sending changes', default: true }),
}, { required: ['propertyId'] });

const REVENUE_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const propertyId = input.propertyId || 'default';
  const hotelHome = process.env.HOTEL_HOME || '/tmp/hotel';
  const fs = require('fs');
  const path = require('path');
  const isUrl = /^https?:\\/\\//.test(hotelHome);
  const baseDir = isUrl ? path.join(process.cwd(), 'hotel-revenue-performance') : path.join(hotelHome, 'revenue-performance');
  const storePath = path.join(baseDir, 'analytics.json');
  fs.mkdirSync(baseDir, { recursive: true });

  function asNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  function normalizeRecords(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      if (Array.isArray(value.records)) return value.records;
      if (Array.isArray(value.data)) return value.data;
      if (Array.isArray(value.rows)) return value.rows;
      if (Array.isArray(value.analyticsData)) return value.analyticsData;
    }
    return [];
  }

  function summarize(records) {
    const usable = Array.isArray(records) ? records : [];
    const revenue = usable.reduce((sum, row) => sum + asNumber(row.revenue ?? row.amount ?? row.total, 0), 0);
    const roomsSold = usable.reduce((sum, row) => sum + asNumber(row.roomsSold ?? row.bookedRooms, 0), 0);
    const availableRooms = usable.reduce((sum, row) => sum + asNumber(row.availableRooms ?? row.inventory, 0), 0);
    const occupancy = availableRooms ? (roomsSold / availableRooms) * 100 : 0;
    const adr = roomsSold ? revenue / roomsSold : 0;
    const revpar = availableRooms ? revenue / availableRooms : 0;
    return {
      recordCount: usable.length,
      revenue: Math.round(revenue * 100) / 100,
      roomsSold: Math.round(roomsSold * 100) / 100,
      availableRooms: Math.round(availableRooms * 100) / 100,
      occupancy: Math.round(occupancy * 100) / 100,
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(revpar * 100) / 100,
    };
  }

  let stored = [];
  try {
    stored = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  } catch (error) {
    stored = [];
  }

  const suppliedRecords = normalizeRecords(input.records);
  const analyticsRecords = normalizeRecords(input.analyticsData);
  const storedRecords = Array.isArray(stored) && stored.length && typeof stored[0] === 'object' && Array.isArray(stored[0].result?.records)
    ? stored[0].result.records
    : normalizeRecords(stored);
  const records = suppliedRecords.length ? suppliedRecords : analyticsRecords.length ? analyticsRecords : storedRecords;
  const recordSource = suppliedRecords.length || analyticsRecords.length ? 'supplied' : storedRecords.length ? 'local-cache' : 'none';

  async function readPmsData() {
    if (!isUrl || typeof fetch !== 'function') {
      return { connected: false, reason: 'not-configured', status: null, records: [], data: null };
    }
    const token = process.env.HOTEL_API_TOKEN || '';
    if (!token) {
      return { connected: false, reason: 'not-configured', status: null, records: [], data: null };
    }
    try {
      const url = hotelHome.replace(/\\/$/, '') + '/api/v1/hotel/analytics?propertyId=' + encodeURIComponent(propertyId);
      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      });
      if (!response.ok) {
        return { connected: false, reason: 'unavailable', status: response.status, records: [], data: null };
      }
      const payload = await response.json().catch(() => null);
      return { connected: true, reason: 'connected', status: response.status, records: normalizeRecords(payload), data: payload };
    } catch (error) {
      return { connected: false, reason: 'unavailable', status: null, records: [], data: null, error: error instanceof Error ? error.message : String(error) };
    }
  }

  const pms = await readPmsData();
  const effectiveRecords = records.length ? records : pms.records;
  const summary = summarize(effectiveRecords);

  if (!effectiveRecords.length) {
    const output = {
      success: false,
      status: 'not-connected',
      propertyId,
      data: {
        status: 'not-connected',
        summary: { recordCount: 0, revenue: 0, roomsSold: 0, availableRooms: 0, occupancy: 0, adr: 0, revpar: 0 },
        connector: { configured: isUrl, authenticated: Boolean(process.env.HOTEL_API_TOKEN), status: pms.reason },
      },
      source: 'not-connected',
      storePath,
      error: 'Hotel PMS is not connected and no supplied or local records are available. Configure HOTEL_HOME and HOTEL_API_TOKEN, or provide records for an advisory run.',
    };
    console.log(JSON.stringify(output));
    return output;
  }

  const growthRate = asNumber(input.growthRate, 0) / 100;
  const targetOccupancy = asNumber(input.targetOccupancy, summary.occupancy);
  const targetAdr = asNumber(input.targetAdr, summary.adr);
  const source = recordSource === 'supplied' ? 'supplied' : recordSource === 'local-cache' ? 'local-cache' : 'pms';
  const stale = recordSource === 'local-cache' && (!pms.connected || pms.records.length === 0);

  function buildResult() {
    const forecast = {
      revenue: Math.round(summary.revenue * (1 + growthRate) * 100) / 100,
      occupancy: Math.min(100, Math.round(targetOccupancy * 100) / 100),
      adr: Math.round(targetAdr * 100) / 100,
      assumptions: { growthRate: growthRate * 100, currency: input.currency || 'USD' },
    };
    return {
      summary,
      forecast,
      stale,
      recommendations: ['Compare the forecast with current pickup before changing rates.', 'Review channel mix and length-of-stay constraints before publishing a rate change.'],
    };
  }

  let result;
  try {
    result = buildResult();
  } catch (error) {
    const output = {
      success: false,
      status: 'error',
      propertyId,
      data: {},
      source,
      storePath,
      error: error instanceof Error ? error.message : String(error),
    };
    console.log(JSON.stringify(output));
    return output;
  }

  const output = {
    success: true,
    status: pms.connected && pms.records.length ? 'live' : 'dry-run',
    propertyId,
    data: {
      ...result,
      pmsData: pms.connected ? pms.data : null,
      connector: { configured: isUrl, authenticated: Boolean(process.env.HOTEL_API_TOKEN), status: pms.reason },
    },
    source,
    stale,
    storePath,
    note: stale ? 'PMS is unavailable; this analysis uses the local cache and must not be treated as current live data.' : (pms.connected && pms.records.length ? 'Analysis includes live PMS data.' : 'Analysis uses supplied records; no PMS data was required.'),
  };

  if (!input.dryRun) {
    stored.push({ propertyId, createdAt: new Date().toISOString(), records: effectiveRecords, result, source, stale });
    fs.writeFileSync(storePath, JSON.stringify(stored, null, 2));
  }
  console.log(JSON.stringify(output));
  return output;
})()`;

export const REVENUE_SKILL = createCodeSkill({
  id: 'hotel-revenue-performance-advisory',
  name: 'Revenue & Performance Advisory',
  description: 'Hybrid revenue, operational analytics, and staff-performance advisor grounded in supplied records, local hotel state, and the PMS configured through HOTEL_HOME.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: REVENUE_SOURCE,
    configSchema: createSchemaRecord({
      hotelHome: SchemaProps.text({ description: 'Hotel home directory or PMS base URL', default: HOTEL_HOME }),
      apiToken: SchemaProps.password({ description: 'Optional PMS bearer token' }),
      retentionDays: SchemaProps.integer({ description: 'Local analytics retention period in days', minimum: 1, default: 90 }),
    }),
    credentialSource: { token: { envVar: 'HOTEL_API_TOKEN', configKey: 'hotel.token' } },
  },
  inputSchema: REVENUE_INPUT_SCHEMA,
  tier: 'advise',
  domainKnowledge: 'Hotel revenue management, ADR, RevPAR, occupancy analytics, and staff performance',
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the advisory analysis completed' }),
    status: SchemaProps.select(['dry-run', 'live', 'not-connected', 'error'], { description: 'Execution and connector state' }),
    propertyId: SchemaProps.text({ description: 'Property analyzed' }),
    data: SchemaProps.object({}, { description: 'Grounded analytics and recommendations', additionalProperties: true }),
    source: SchemaProps.select(['supplied', 'local-cache', 'pms', 'not-connected', 'error'], { description: 'Data source used for the analysis' }),
    stale: SchemaProps.boolean({ description: 'Whether the analysis relies on stale local cache instead of live PMS data' }),
    storePath: SchemaProps.text({ description: 'Local analytics store path' }),
    note: SchemaProps.text({ description: 'Connector or data-source disclosure' }),
    error: SchemaProps.text({ description: 'Error message when analysis fails' }),
  }, { required: ['success', 'status', 'propertyId', 'data', 'source'] }),
  triggers: [
    { kind: 'schedule', cadence: 'Weekly revenue and performance review' },
  ],
isSkill: true,
});
