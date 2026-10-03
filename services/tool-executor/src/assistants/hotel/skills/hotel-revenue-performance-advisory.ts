import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';

const REVENUE_INPUT_SCHEMA = createSchemaRecord({
  propertyId: SchemaProps.reference('hotel-properties', { description: 'Hotel property identifier', required: true }),
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
    staffId: SchemaProps.reference('hotel-staff', { description: 'Staff member associated with the record' }),
    tasksCompleted: SchemaProps.integer({ description: 'Tasks completed by the staff member', minimum: 0 }),
    guestSatisfaction: SchemaProps.number({ description: 'Guest satisfaction score', minimum: 0, maximum: 5 }),
  }, {}), { description: 'Supplied PMS, operational, or staff records for grounded analysis' }),
  channels: SchemaProps.stringArray({ description: 'Booking channels to compare' }),
  staffing: SchemaProps.objectArray(SchemaProps.object({
    staffId: SchemaProps.reference('hotel-staff', { description: 'Staff member identifier' }),
    department: SchemaProps.text({ description: 'Staff department' }),
    shifts: SchemaProps.integer({ description: 'Completed or scheduled shifts', minimum: 0 }),
    hoursWorked: SchemaProps.number({ description: 'Hours worked', minimum: 0 }),
    tasksCompleted: SchemaProps.integer({ description: 'Completed tasks', minimum: 0 }),
    guestSatisfaction: SchemaProps.number({ description: 'Guest satisfaction score', minimum: 0, maximum: 5 }),
  }, {}), { description: 'Staff performance records' }),
  staffId: SchemaProps.reference('hotel-staff', { description: 'Staff member to analyze' }),
  department: SchemaProps.text({ description: 'Department to filter or analyze' }),
  baselineRevenue: SchemaProps.number({ description: 'Baseline revenue used for variance or forecast calculations', minimum: 0 }),
  growthRate: SchemaProps.number({ description: 'Expected revenue growth rate as a percentage' }),
  targetOccupancy: SchemaProps.number({ description: 'Target occupancy percentage', minimum: 0, maximum: 100 }),
  targetAdr: SchemaProps.number({ description: 'Target average daily rate', minimum: 0 }),
  params: SchemaProps.object({}, { description: 'Additional advisory parameters', additionalProperties: true }),
  dryRun: SchemaProps.boolean({ description: 'Return an advisory draft without persisting or sending changes', default: true }),
}, { required: ['propertyId'] });

export const REVENUE_SKILL = createDeclarativeCodeSkill({
  id: 'hotel-revenue-performance-advisory',
  name: 'Revenue & Performance Advisory',
  description: 'Hybrid revenue, operational analytics, and staff-performance advisor grounded in supplied records, local hotel state, and the PMS configured through HOTEL_HOME.',
  persistenceEnvVar: 'HOTEL_HOME',
  inputSchema: REVENUE_INPUT_SCHEMA,
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
  tier: 'advise',
  domainKnowledge: 'Hotel revenue management, ADR, RevPAR, occupancy analytics, and staff performance',
  triggers: [
    { kind: 'user', phrase_examples: ['Run a revenue performance review', 'Analyse this property\u2019s revenue'] },
  ],
  isSkill: true,
  async handler(input, ctx) {
    const propertyId = input.propertyId || 'default';
    const records = input.records || ctx.store.load('hotel_analytics');

    function asNumber(value: any, fallback: number): number {
      const number = Number(value);
      return Number.isFinite(number) ? number : fallback;
    }

    const usable = Array.isArray(records) ? records : [];
    const revenue = usable.reduce((sum: number, row: any) => sum + asNumber(row.revenue ?? row.amount ?? row.total, 0), 0);
    const roomsSold = usable.reduce((sum: number, row: any) => sum + asNumber(row.roomsSold ?? row.bookedRooms, 0), 0);
    const availableRooms = usable.reduce((sum: number, row: any) => sum + asNumber(row.availableRooms ?? row.inventory, 0), 0);
    const occupancy = availableRooms ? (roomsSold / availableRooms) * 100 : 0;
    const adr = roomsSold ? revenue / roomsSold : 0;
    const revpar = availableRooms ? revenue / availableRooms : 0;

    const summary = {
      recordCount: usable.length,
      revenue: Math.round(revenue * 100) / 100,
      roomsSold: Math.round(roomsSold * 100) / 100,
      availableRooms: Math.round(availableRooms * 100) / 100,
      occupancy: Math.round(occupancy * 100) / 100,
      adr: Math.round(adr * 100) / 100,
      revpar: Math.round(revpar * 100) / 100,
    };

    if (!usable.length) {
      return {
        success: false,
        status: 'not-connected',
        propertyId,
        data: {
          status: 'not-connected',
          summary,
        },
        source: 'not-connected',
        error: 'Hotel PMS is not connected and no supplied or local records are available.',
      };
    }

    const growthRate = asNumber(input.growthRate, 0) / 100;
    const targetOccupancy = asNumber(input.targetOccupancy, summary.occupancy);
    const targetAdr = asNumber(input.targetAdr, summary.adr);

    const forecast = {
      revenue: Math.round(summary.revenue * (1 + growthRate) * 100) / 100,
      occupancy: Math.min(100, Math.round(targetOccupancy * 100) / 100),
      adr: Math.round(targetAdr * 100) / 100,
      assumptions: { growthRate: growthRate * 100, currency: input.currency || 'USD' },
    };

    const recommendations = [
      'Compare the forecast with current pickup before changing rates.',
      'Review channel mix and length-of-stay constraints before publishing a rate change.',
    ];

    if (!input.dryRun && input.records) {
      ctx.store.save('hotel_analytics', input.records);
    }

    return {
      success: true,
      status: 'dry-run',
      propertyId,
      data: {
        summary,
        forecast,
        recommendations,
      },
      source: input.records ? 'supplied' : 'local-cache',
      present: [
        ctx.render.text('revenue-summary', 'Revenue Advisory Summary', `Occupancy: ${summary.occupancy}%, ADR: $${summary.adr}, RevPAR: $${summary.revpar}.`),
      ],
    };
  },
});
