import { Tool, SchemaProperty } from '../../../types';
import { createExternalActionSkill } from '../code-skill-factory';

const RESTAURANT_SKILLS: Tool[] = [
  {
    id: 'manage-inventory',
    name: 'Manage Inventory',
    description: 'Manage restaurant inventory with item, quantity, and unit.',
    type: 'code',
    manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const item = input.item || '';
const quantity = input.quantity || 0;
const unit = input.unit || '';
const baseDir = process.env.RESTAURANT_HOME || path.join('/tmp/restaurant');
const storePath = path.join(baseDir, 'inventory.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
const categories = { produce: ['kg', 'lbs', 'units'], meat: ['kg', 'lbs'], dairy: ['kg', 'lbs', 'units'], dry: ['kg', 'lbs', 'units'], beverage: ['liters', 'units', 'cases'], other: ['units'] };
const category = Object.keys(categories).find((c) => categories[c].includes(unit.toLowerCase())) || 'other';
const unitCost = Math.round(Math.random() * 50 + 5) * 100; // $5-55 in cents
const totalCost = (unitCost * quantity) / 100;
const parLevel = Math.max(10, Math.floor(quantity * 1.5));
const reorderPoint = Math.max(5, Math.floor(parLevel * 0.3));
const supplierNames = ['Sysco', 'US Foods', 'Performance Foodservice', 'Gordon Food Service', 'Local Farm Co.', 'Specialty Imports'];
const supplier = supplierNames[Math.floor(Math.random() * supplierNames.length)];
const shelfLife = { produce: 7, meat: 5, dairy: 14, dry: 180, beverage: 365, other: 90 }[category] || 30;
const expiryDate = new Date(Date.now() + shelfLife * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

const entry = {
  id: 'inv_' + Date.now(),
  item,
  quantity,
  unit,
  category,
  unitCost: unitCost / 100,
  totalCost: totalCost,
  parLevel: parLevel,
  reorderPoint: reorderPoint,
  supplier: supplier,
  expiryDate: expiryDate,
  status: quantity <= reorderPoint ? 'low' : quantity <= parLevel ? 'adequate' : 'well-stocked',
  createdAt: new Date().toISOString(),
  source: 'local'
};
store.push(entry);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: { entry, storePath, hint: 'Set RESTAURANT_POS_BASE_URL + RESTAURANT_POS_API_KEY to sync to POS' } }));
` },
    inputSchema: { type: 'object', properties: { item: { type: 'string', description: 'Inventory item name' }, quantity: { type: 'number', description: 'Quantity of the item' }, unit: { type: 'string', description: 'Unit of measurement (e.g., kg, lbs, units)' } } },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean', description: 'Whether the inventory entry was managed successfully' }, entry: { type: 'object', description: 'The inventory entry that was created or updated' }, storePath: { type: 'string', description: 'File path where the inventory data is stored' } }, required: ['success', 'entry', 'storePath'] },
    createdAt: new Date(), updatedAt: new Date(),
  },
];

const EXTERNAL_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

interface BearerSkillDef {
  readonly id: string;
  readonly name: string;
  readonly system: 'restaurant';
  readonly action: string;
  readonly envVar: string;
  readonly authType: 'bearer';
  readonly tokenEnv: string;
  readonly configProvider: readonly string[];
}

interface ApiKeySkillDef {
  readonly id: string;
  readonly name: string;
  readonly system: 'restaurant';
  readonly action: string;
  readonly envVar: string;
  readonly authType: 'api_key';
  readonly apiKeyEnv: string;
  readonly configProvider: readonly string[];
}

type SkillDef = BearerSkillDef | ApiKeySkillDef;

const skillDefs: readonly SkillDef[] = [
  { id: 'restaurant-reservation-system', name: 'Restaurant Reservation System', system: 'restaurant', action: 'reservation-system', envVar: 'RESTAURANT_RESERVATION_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_RESERVATION_TOKEN', configProvider: ['opentable', 'resy', 'sevenrooms', 'custom'] },
  { id: 'restaurant-table-management', name: 'Restaurant Table Management', system: 'restaurant', action: 'table-management', envVar: 'RESTAURANT_TABLE_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_TABLE_TOKEN', configProvider: ['opentable', 'resy', 'sevenrooms', 'custom'] },
  { id: 'restaurant-guest-profile', name: 'Restaurant Guest Profile', system: 'restaurant', action: 'guest-profile', envVar: 'RESTAURANT_GUEST_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_GUEST_TOKEN', configProvider: ['sevenrooms', 'opentable', 'custom'] },
  { id: 'restaurant-service-flow', name: 'Restaurant Service Flow', system: 'restaurant', action: 'service-flow', envVar: 'RESTAURANT_SERVICE_ENDPOINT', authType: 'api_key', apiKeyEnv: 'RESTAURANT_SERVICE_API_KEY', configProvider: ['toast', 'square', 'clover', 'custom'] },
  { id: 'restaurant-floor-management', name: 'Restaurant Floor Management', system: 'restaurant', action: 'floor-management', envVar: 'RESTAURANT_FLOOR_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_FLOOR_TOKEN', configProvider: ['sevenrooms', 'opentable', 'custom'] },
  { id: 'restaurant-staff-scheduler', name: 'Restaurant Staff Scheduler', system: 'restaurant', action: 'staff-scheduler', envVar: 'RESTAURANT_SCHEDULER_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_SCHEDULER_TOKEN', configProvider: ['7shifts', 'hot-schedules', 'deputy', 'custom'] },
  { id: 'restaurant-demand-forecast', name: 'Restaurant Demand Forecast', system: 'restaurant', action: 'demand-forecast', envVar: 'RESTAURANT_FORECAST_ENDPOINT', authType: 'api_key', apiKeyEnv: 'RESTAURANT_FORECAST_API_KEY', configProvider: ['crunch-time', 'teneo', 'custom'] },
  { id: 'restaurant-labor-analytics', name: 'Restaurant Labor Analytics', system: 'restaurant', action: 'labor-analytics', envVar: 'RESTAURANT_LABOR_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_LABOR_TOKEN', configProvider: ['7shifts', 'hot-schedules', 'custom'] },
  { id: 'restaurant-server-communication', name: 'Restaurant Server Communication', system: 'restaurant', action: 'server-communication', envVar: 'RESTAURANT_COMM_ENDPOINT', authType: 'api_key', apiKeyEnv: 'RESTAURANT_COMM_API_KEY', configProvider: ['toast', 'square', 'custom'] },
  { id: 'restaurant-prep-scheduler', name: 'Restaurant Prep Scheduler', system: 'restaurant', action: 'prep-scheduler', envVar: 'RESTAURANT_PREP_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_PREP_TOKEN', configProvider: ['marketman', 'xtraCHEF', 'custom'] },
  { id: 'restaurant-kitchen-display', name: 'Restaurant Kitchen Display', system: 'restaurant', action: 'kitchen-display', envVar: 'RESTAURANT_KDS_ENDPOINT', authType: 'api_key', apiKeyEnv: 'RESTAURANT_KDS_API_KEY', configProvider: ['toast', 'square', 'custom'] },
  { id: 'restaurant-station-coordinator', name: 'Restaurant Station Coordinator', system: 'restaurant', action: 'station-coordinator', envVar: 'RESTAURANT_STATION_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_STATION_TOKEN', configProvider: ['custom'] },
  { id: 'restaurant-recipe-management', name: 'Restaurant Recipe Management', system: 'restaurant', action: 'recipe-management', envVar: 'RESTAURANT_RECIPE_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_RECIPE_TOKEN', configProvider: ['marketman', 'xtraCHEF', 'custom'] },
  { id: 'restaurant-recipe-costing', name: 'Restaurant Recipe Costing', system: 'restaurant', action: 'recipe-costing', envVar: 'RESTAURANT_COSTING_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_COSTING_TOKEN', configProvider: ['marketman', 'xtraCHEF', 'custom'] },
  { id: 'restaurant-menu-engineering', name: 'Restaurant Menu Engineering', system: 'restaurant', action: 'menu-engineering', envVar: 'RESTAURANT_MENU_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_MENU_TOKEN', configProvider: ['upserve', 'marketman', 'custom'] },
  { id: 'restaurant-menu-optimizer', name: 'Restaurant Menu Optimizer', system: 'restaurant', action: 'menu-optimizer', envVar: 'RESTAURANT_MENU_OPT_ENDPOINT', authType: 'api_key', apiKeyEnv: 'RESTAURANT_MENU_OPT_API_KEY', configProvider: ['upserve', 'custom'] },
  { id: 'restaurant-pricing-strategy', name: 'Restaurant Pricing Strategy', system: 'restaurant', action: 'pricing-strategy', envVar: 'RESTAURANT_PRICING_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_PRICING_TOKEN', configProvider: ['custom'] },
  { id: 'restaurant-purchase-order', name: 'Restaurant Purchase Order', system: 'restaurant', action: 'purchase-order', envVar: 'RESTAURANT_PO_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_PO_TOKEN', configProvider: ['marketman', 'xtraCHEF', 'custom'] },
  { id: 'restaurant-supplier-management', name: 'Restaurant Supplier Management', system: 'restaurant', action: 'supplier-management', envVar: 'RESTAURANT_SUPPLIER_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_SUPPLIER_TOKEN', configProvider: ['marketman', 'xtraCHEF', 'custom'] },
  { id: 'restaurant-order-optimizer', name: 'Restaurant Order Optimizer', system: 'restaurant', action: 'order-optimizer', envVar: 'RESTAURANT_ORDER_OPT_ENDPOINT', authType: 'api_key', apiKeyEnv: 'RESTAURANT_ORDER_OPT_API_KEY', configProvider: ['marketman', 'custom'] },
  { id: 'restaurant-waste-management', name: 'Restaurant Waste Management', system: 'restaurant', action: 'waste-management', envVar: 'RESTAURANT_WASTE_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_WASTE_TOKEN', configProvider: ['leanpath', 'custom'] },
  { id: 'restaurant-price-tracking', name: 'Restaurant Price Tracking', system: 'restaurant', action: 'price-tracking', envVar: 'RESTAURANT_PRICE_ENDPOINT', authType: 'api_key', apiKeyEnv: 'RESTAURANT_PRICE_API_KEY', configProvider: ['marketman', 'xtraCHEF', 'custom'] },
  { id: 'restaurant-financial-analytics', name: 'Restaurant Financial Analytics', system: 'restaurant', action: 'financial-analytics', envVar: 'RESTAURANT_FIN_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_FIN_TOKEN', configProvider: ['restaurant365', 'compeat', 'custom'] },
  { id: 'restaurant-variance-analysis', name: 'Restaurant Variance Analysis', system: 'restaurant', action: 'variance-analysis', envVar: 'RESTAURANT_VAR_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_VAR_TOKEN', configProvider: ['restaurant365', 'compeat', 'custom'] },
  { id: 'restaurant-trend-analysis', name: 'Restaurant Trend Analysis', system: 'restaurant', action: 'trend-analysis', envVar: 'RESTAURANT_TREND_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_TREND_TOKEN', configProvider: ['upserve', 'toast', 'custom'] },
  { id: 'restaurant-sales-analytics', name: 'Restaurant Sales Analytics', system: 'restaurant', action: 'sales-analytics', envVar: 'RESTAURANT_SALES_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_SALES_TOKEN', configProvider: ['toast', 'square', 'upserve', 'custom'] },
  { id: 'restaurant-reservation-analytics', name: 'Restaurant Reservation Analytics', system: 'restaurant', action: 'reservation-analytics', envVar: 'RESTAURANT_RES_ANALYTICS_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_RES_ANALYTICS_TOKEN', configProvider: ['opentable', 'resy', 'sevenrooms', 'custom'] },
  { id: 'restaurant-table-turnover', name: 'Restaurant Table Turnover', system: 'restaurant', action: 'table-turnover', envVar: 'RESTAURANT_TURNOVER_ENDPOINT', authType: 'bearer', tokenEnv: 'RESTAURANT_TURNOVER_TOKEN', configProvider: ['opentable', 'sevenrooms', 'custom'] },
  { id: 'restaurant-quality-control', name: 'Restaurant Quality Control', system: 'restaurant', action: 'quality-control', envVar: 'RESTAURANT_QC_ENDPOINT', authType: 'api_key', apiKeyEnv: 'RESTAURANT_QC_API_KEY', configProvider: ['custom'] },
  { id: 'restaurant-guest-feedback', name: 'Restaurant Guest Feedback', system: 'restaurant', action: 'guest-feedback', envVar: 'RESTAURANT_FEEDBACK_ENDPOINT', authType: 'api_key', apiKeyEnv: 'RESTAURANT_FEEDBACK_API_KEY', configProvider: ['yelp', 'google-reviews', 'opentable', 'custom'] },
];

const CONFIG_SCHEMA_PROPS: Record<string, Record<string, unknown>> = {
  'reservation-system': { partySizeConfig: { type: 'object' }, timeSlotConfig: { type: 'object' }, specialRequestsConfig: { type: 'object' }, providerSpecificFields: { type: 'object' } },
  'table-management': { tableLayoutConfig: { type: 'object' }, capacityConfig: { type: 'object' }, mergeSplitConfig: { type: 'object' } },
  'guest-profile': { preferencesConfig: { type: 'object' }, allergiesConfig: { type: 'object' }, historyConfig: { type: 'object' }, loyaltyConfig: { type: 'object' } },
  'service-flow': { courseTimingConfig: { type: 'object' }, serverAssignmentsConfig: { type: 'object' }, pacingRulesConfig: { type: 'object' } },
  'floor-management': { floorPlanConfig: { type: 'object' }, sectionsConfig: { type: 'object' }, waitlistConfig: { type: 'object' } },
  'staff-scheduler': { shiftsConfig: { type: 'object' }, rolesConfig: { type: 'object' }, availabilityConfig: { type: 'object' }, laborRulesConfig: { type: 'object' } },
  'demand-forecast': { historicalDataConfig: { type: 'object' }, eventsConfig: { type: 'object' }, weatherConfig: { type: 'object' }, seasonalityConfig: { type: 'object' }, modelSelectionConfig: { type: 'object' } },
  'labor-analytics': { laborCostConfig: { type: 'object' }, productivityConfig: { type: 'object' }, overtimeConfig: { type: 'object' }, complianceConfig: { type: 'object' } },
  'server-communication': { messageTypesConfig: { type: 'object' }, channelsConfig: { type: 'object' }, priorityConfig: { type: 'object' }, readReceiptsConfig: { type: 'object' } },
  'prep-scheduler': { recipesConfig: { type: 'object' }, stationsConfig: { type: 'object' }, timingConfig: { type: 'object' }, batchSizesConfig: { type: 'object' }, wasteTrackingConfig: { type: 'object' } },
  'kitchen-display': { ticketRoutingConfig: { type: 'object' }, courseFiringConfig: { type: 'object' }, bumpLogicConfig: { type: 'object' }, timingAlertsConfig: { type: 'object' } },
  'station-coordinator': { stationAssignmentsConfig: { type: 'object' }, capacityConfig: { type: 'object' }, handoffsConfig: { type: 'object' }, expeditingConfig: { type: 'object' } },
  'recipe-management': { ingredientsConfig: { type: 'object' }, yieldsConfig: { type: 'object' }, costsConfig: { type: 'object' }, allergensConfig: { type: 'object' }, versioningConfig: { type: 'object' } },
  'recipe-costing': { ingredientPricesConfig: { type: 'object' }, yieldLossConfig: { type: 'object' }, marginTargetsConfig: { type: 'object' }, priceAlertsConfig: { type: 'object' } },
  'menu-engineering': { popularityConfig: { type: 'object' }, profitabilityConfig: { type: 'object' }, contributionMarginConfig: { type: 'object' }, designRulesConfig: { type: 'object' } },
  'menu-optimizer': { optimizationGoalsConfig: { type: 'object' }, constraintsConfig: { type: 'object' }, abTestingConfig: { type: 'object' }, rolloutConfig: { type: 'object' } },
  'pricing-strategy': { dynamicPricingConfig: { type: 'object' }, elasticityConfig: { type: 'object' }, competitorTrackingConfig: { type: 'object' }, rulesEngineConfig: { type: 'object' } },
  'purchase-order': { vendorsConfig: { type: 'object' }, catalogsConfig: { type: 'object' }, approvalWorkflowsConfig: { type: 'object' }, receivingConfig: { type: 'object' }, threeWayMatchConfig: { type: 'object' } },
  'supplier-management': { supplierProfilesConfig: { type: 'object' }, contractsConfig: { type: 'object' }, performanceConfig: { type: 'object' }, certificationsConfig: { type: 'object' }, diversityConfig: { type: 'object' } },
  'order-optimizer': { parLevelsConfig: { type: 'object' }, leadTimesConfig: { type: 'object' }, moqConfig: { type: 'object' }, caseSizesConfig: { type: 'object' }, splitOrdersConfig: { type: 'object' } },
  'waste-management': { wasteCategoriesConfig: { type: 'object' }, trackingConfig: { type: 'object' }, causesConfig: { type: 'object' }, reductionTargetsConfig: { type: 'object' }, reportingConfig: { type: 'object' } },
  'price-tracking': { priceHistoryConfig: { type: 'object' }, alertsConfig: { type: 'object' }, benchmarksConfig: { type: 'object' }, substitutionSuggestionsConfig: { type: 'object' } },
  'financial-analytics': { pnlConfig: { type: 'object' }, cogsConfig: { type: 'object' }, laborPercentConfig: { type: 'object' }, primeCostConfig: { type: 'object' }, benchmarksConfig: { type: 'object' }, varianceConfig: { type: 'object' } },
  'variance-analysis': { actualVsBudgetConfig: { type: 'object' }, mixAnalysisConfig: { type: 'object' }, priceVolumeVarianceConfig: { type: 'object' }, drillDownConfig: { type: 'object' } },
  'trend-analysis': { timeSeriesConfig: { type: 'object' }, seasonalityConfig: { type: 'object' }, forecastingConfig: { type: 'object' }, anomalyDetectionConfig: { type: 'object' } },
  'sales-analytics': { revenueByCategoryConfig: { type: 'object' }, daypartConfig: { type: 'object' }, channelConfig: { type: 'object' }, checkAvgConfig: { type: 'object' }, coversConfig: { type: 'object' }, trendsConfig: { type: 'object' } },
  'reservation-analytics': { bookingPaceConfig: { type: 'object' }, noShowRateConfig: { type: 'object' }, leadTimeConfig: { type: 'object' }, channelMixConfig: { type: 'object' }, yieldConfig: { type: 'object' } },
  'table-turnover': { turnTimesConfig: { type: 'object' }, occupancyConfig: { type: 'object' }, waitTimesConfig: { type: 'object' }, pacingConfig: { type: 'object' }, optimizationConfig: { type: 'object' } },
  'quality-control': { checklistsConfig: { type: 'object' }, standardsConfig: { type: 'object' }, scoresConfig: { type: 'object' }, correctiveActionsConfig: { type: 'object' }, trendsConfig: { type: 'object' } },
  'guest-feedback': { sentimentConfig: { type: 'object' }, topicsConfig: { type: 'object' }, responseTrackingConfig: { type: 'object' }, npsConfig: { type: 'object' }, resolutionConfig: { type: 'object' } },
};

const INPUT_SCHEMA_PROPS: Record<string, Record<string, unknown>> = {
  'reservation-system': { partySize: { type: 'object', description: 'Party size for reservation' }, reservationDate: { type: 'object', description: 'Reservation date and time' }, guestName: { type: 'object', description: 'Guest name' }, contactInfo: { type: 'object', description: 'Guest contact information' } },
  'table-management': { tableId: { type: 'object', description: 'Table identifier' }, action: { type: 'object', description: 'Action to perform on table' }, partySize: { type: 'object', description: 'Party size for table' }, timeSlot: { type: 'object', description: 'Time slot for reservation' } },
  'guest-profile': { guestId: { type: 'object', description: 'Guest identifier' }, name: { type: 'object', description: 'Guest name' }, preferences: { type: 'object', description: 'Guest preferences' }, allergies: { type: 'object', description: 'Guest allergies' }, contactInfo: { type: 'object', description: 'Guest contact information' } },
  'service-flow': { reservationId: { type: 'object', description: 'Reservation identifier' }, tableId: { type: 'object', description: 'Table identifier' }, course: { type: 'object', description: 'Current course being served' }, status: { type: 'object', description: 'Service status' } },
  'floor-management': { floorId: { type: 'object', description: 'Floor identifier' }, sectionId: { type: 'object', description: 'Section identifier' }, tableId: { type: 'object', description: 'Table identifier' }, action: { type: 'object', description: 'Action to perform' } },
  'staff-scheduler': { staffId: { type: 'object', description: 'Staff member identifier' }, shiftId: { type: 'object', description: 'Shift identifier' }, date: { type: 'object', description: 'Shift date' }, role: { type: 'object', description: 'Staff role' } },
  'demand-forecast': { date: { type: 'object', description: 'Forecast date' }, timeRange: { type: 'object', description: 'Time range for forecast' }, metric: { type: 'object', description: 'Metric to forecast' }, granularity: { type: 'object', description: 'Forecast granularity' } },
  'labor-analytics': { dateRange: { type: 'object', description: 'Date range for analytics' }, metric: { type: 'object', description: 'Labor metric' }, department: { type: 'object', description: 'Department' }, comparison: { type: 'object', description: 'Comparison period' } },
  'server-communication': { serverId: { type: 'object', description: 'Server identifier' }, message: { type: 'object', description: 'Message content' }, channelId: { type: 'object', description: 'Communication channel' }, priority: { type: 'object', description: 'Message priority' } },
  'prep-scheduler': { recipeId: { type: 'object', description: 'Recipe identifier' }, station: { type: 'object', description: 'Prep station' }, date: { type: 'object', description: 'Prep date' }, quantity: { type: 'object', description: 'Quantity to prepare' } },
  'kitchen-display': { ticketId: { type: 'object', description: 'Kitchen ticket identifier' }, station: { type: 'object', description: 'Kitchen station' }, action: { type: 'object', description: 'Action to perform' }, course: { type: 'object', description: 'Course for ticket' } },
  'station-coordinator': { stationId: { type: 'object', description: 'Station identifier' }, ticketId: { type: 'object', description: 'Ticket identifier' }, action: { type: 'object', description: 'Action to perform' }, status: { type: 'object', description: 'Station status' } },
  'recipe-management': { recipeId: { type: 'object', description: 'Recipe identifier' }, name: { type: 'object', description: 'Recipe name' }, ingredients: { type: 'object', description: 'Recipe ingredients' }, instructions: { type: 'object', description: 'Cooking instructions' } },
  'recipe-costing': { recipeId: { type: 'object', description: 'Recipe identifier' }, ingredientPrices: { type: 'object', description: 'Ingredient prices' }, yields: { type: 'object', description: 'Recipe yields' }, targetMargin: { type: 'object', description: 'Target profit margin' } },
  'menu-engineering': { menuId: { type: 'object', description: 'Menu identifier' }, itemIds: { type: 'object', description: 'Menu item identifiers' }, analysisType: { type: 'object', description: 'Type of analysis' }, period: { type: 'object', description: 'Analysis period' } },
  'menu-optimizer': { menuId: { type: 'object', description: 'Menu identifier' }, goals: { type: 'object', description: 'Optimization goals' }, constraints: { type: 'object', description: 'Optimization constraints' }, items: { type: 'object', description: 'Menu items to optimize' } },
  'pricing-strategy': { menuId: { type: 'object', description: 'Menu identifier' }, priceRules: { type: 'object', description: 'Pricing rules' }, elasticityData: { type: 'object', description: 'Price elasticity data' }, competitorData: { type: 'object', description: 'Competitor pricing data' } },
  'purchase-order': { vendorId: { type: 'object', description: 'Vendor identifier' }, items: { type: 'object', description: 'Order items' }, totalAmount: { type: 'object', description: 'Total order amount' }, deliveryDate: { type: 'object', description: 'Delivery date' } },
  'supplier-management': { supplierId: { type: 'object', description: 'Supplier identifier' }, action: { type: 'object', description: 'Action to perform' }, contractTerms: { type: 'object', description: 'Contract terms' }, performanceData: { type: 'object', description: 'Supplier performance data' } },
  'order-optimizer': { ingredients: { type: 'object', description: 'Ingredients to order' }, parLevels: { type: 'object', description: 'Par levels' }, leadTimes: { type: 'object', description: 'Lead times' }, budget: { type: 'object', description: 'Order budget' } },
  'waste-management': { itemId: { type: 'object', description: 'Item identifier' }, category: { type: 'object', description: 'Waste category' }, quantity: { type: 'object', description: 'Waste quantity' }, cause: { type: 'object', description: 'Waste cause' } },
  'price-tracking': { ingredientIds: { type: 'object', description: 'Ingredient identifiers' }, priceSources: { type: 'object', description: 'Price sources' }, alertThresholds: { type: 'object', description: 'Alert thresholds' } },
  'financial-analytics': { dateRange: { type: 'object', description: 'Date range for analytics' }, metric: { type: 'object', description: 'Financial metric' }, department: { type: 'object', description: 'Department' }, comparison: { type: 'object', description: 'Comparison period' } },
  'variance-analysis': { dateRange: { type: 'object', description: 'Date range for analysis' }, accountIds: { type: 'object', description: 'Account identifiers' }, comparisonPeriod: { type: 'object', description: 'Comparison period' } },
  'trend-analysis': { dateRange: { type: 'object', description: 'Date range for trends' }, metric: { type: 'object', description: 'Trend metric' }, granularity: { type: 'object', description: 'Trend granularity' }, forecastPeriod: { type: 'object', description: 'Forecast period' } },
  'sales-analytics': { dateRange: { type: 'object', description: 'Date range for sales' }, category: { type: 'object', description: 'Sales category' }, channel: { type: 'object', description: 'Sales channel' }, granularity: { type: 'object', description: 'Sales granularity' } },
  'reservation-analytics': { dateRange: { type: 'object', description: 'Date range for analytics' }, channel: { type: 'object', description: 'Booking channel' }, metric: { type: 'object', description: 'Analytics metric' }, comparison: { type: 'object', description: 'Comparison period' } },
  'table-turnover': { dateRange: { type: 'object', description: 'Date range for turnover' }, tableId: { type: 'object', description: 'Table identifier' }, metric: { type: 'object', description: 'Turnover metric' }, comparison: { type: 'object', description: 'Comparison period' } },
  'quality-control': { dateRange: { type: 'object', description: 'Date range for quality checks' }, checklistId: { type: 'object', description: 'Checklist identifier' }, station: { type: 'object', description: 'Kitchen station' }, metric: { type: 'object', description: 'Quality metric' } },
  'guest-feedback': { dateRange: { type: 'object', description: 'Date range for feedback' }, source: { type: 'object', description: 'Feedback source' }, sentiment: { type: 'object', description: 'Sentiment filter' }, topic: { type: 'object', description: 'Feedback topic' } },
};

function buildSkill(def: SkillDef): Tool {
  const actionKey = def.action;
  const configProps = CONFIG_SCHEMA_PROPS[actionKey] ?? {};
  const inputProps = INPUT_SCHEMA_PROPS[actionKey] ?? {};

  const authConfig =
    def.authType === 'bearer'
      ? { type: 'bearer' as const, credentialEnvKeyMap: { token: def.tokenEnv } }
      : { type: 'api_key' as const, header: 'X-API-Key', credentialEnvKeyMap: { apiKey: def.apiKeyEnv } };

  return createExternalActionSkill({
    id: def.id,
    name: def.name,
    description: `External action skill for ${def.name} (${def.system}).`,
    system: def.system,
    action: def.action,
    endpoint: { envVar: def.envVar, method: 'POST' },
    auth: authConfig,
    inputSchema: { type: 'object', properties: Object.fromEntries(Object.entries(inputProps).map(([k, v]) => [k, v as SchemaProperty])) },
    configSchema: { type: 'object', properties: Object.fromEntries(Object.entries(configProps).map(([k, v]) => [k, v as SchemaProperty])) },
    outputSchema: EXTERNAL_OUTPUT_SCHEMA,
    timeoutMs: 30000,
  });
}

const RESTAURANT_EXTERNAL_SKILLS: Tool[] = skillDefs.map(buildSkill);

export const restaurantSkills = [...RESTAURANT_SKILLS, ...RESTAURANT_EXTERNAL_SKILLS];
