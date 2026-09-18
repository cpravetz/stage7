import { Tool } from '../../../types';
import { createCodeSkill, createExternalActionSkill, SchemaProps } from '../code-skill-factory';
import { RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST } from './restaurant-menu-engineering-cost-strategist';
import { RESTAURANT_SHIFT_PREP_LIST_COPILOT } from './restaurant-shift-prep-list-copilot';
import { RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER } from './restaurant-reservations-guest-profile-manager';
import { RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER } from './restaurant-supply-chain-inventory-reorder-manager';
import { RESTAURANT_FINANCIAL_FORECAST_EVALUATOR } from './restaurant-financial-forecast-evaluator';


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

const RESERVATIONS_INPUT_SCHEMA: Record<string, unknown> = {
  operation: { type: 'string', enum: ['reservation', 'table-management', 'guest-profile', 'floor-management', 'guest-feedback', 'reservation-analytics', 'table-turnover'], description: 'The operation to perform' },
  dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date (YYYY-MM-DD)' }, end: { type: 'string', description: 'End date (YYYY-MM-DD)' } }, description: 'Date range filter' },
  partySize: { type: 'number', description: 'Number of guests in the party' },
  guestName: { type: 'string', description: 'Name of the guest' },
  tableId: { type: 'string', description: 'Table identifier' },
  floorId: { type: 'string', description: 'Floor identifier' },
  guestId: { type: 'string', description: 'Guest identifier' },
  status: { type: 'string', description: 'Filter or set status' },
  channel: { type: 'string', description: 'Booking channel (e.g., opentable, resy, direct)' },
  note: { type: 'string', description: 'Additional notes or special requests' },
  dryRun: { type: 'boolean', description: 'Whether to run in dry-run mode without executing', default: true },
};

const KITCHEN_INPUT_SCHEMA: Record<string, unknown> = {
  operation: { type: 'string', enum: ['service-flow', 'kitchen-display', 'station-coordinator', 'prep-scheduler', 'server-communication', 'quality-control'], description: 'The operation to perform' },
  dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date (YYYY-MM-DD)' }, end: { type: 'string', description: 'End date (YYYY-MM-DD)' } }, description: 'Date range filter' },
  ticketId: { type: 'string', description: 'Kitchen ticket identifier' },
  station: { type: 'string', description: 'Kitchen station name' },
  course: { type: 'string', description: 'Current course being served' },
  message: { type: 'string', description: 'Message content for communication' },
  priority: { type: 'string', description: 'Priority level (e.g., low, normal, high, urgent)' },
  checklistId: { type: 'string', description: 'Quality checklist identifier' },
  score: { type: 'number', description: 'Quality score' },
  dryRun: { type: 'boolean', description: 'Whether to run in dry-run mode without executing', default: true },
};

function buildExternalInputSchema(props: Record<string, unknown>): Record<string, unknown> {
  return { type: 'object', properties: { ...props } };
}

const RESERVATIONS_SKILL = createExternalActionSkill({
  id: 'restaurant-reservations-guest-experience',
  name: 'Reservations & Guest Experience',
  description: 'Manage reservations, table layouts, guest profiles, floor plans, guest feedback, and reservation analytics for the restaurant.',
  system: 'restaurant',
  action: 'reservations-guest-experience',
  endpoint: { envVar: 'RESTAURANT_RESERVATION_ENDPOINT', method: 'POST' },
  auth: { type: 'bearer', credentialEnvKeyMap: { token: 'RESTAURANT_RESERVATION_TOKEN' } },
  inputSchema: buildExternalInputSchema(RESERVATIONS_INPUT_SCHEMA),
  outputSchema: EXTERNAL_OUTPUT_SCHEMA,
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: { type: 'boolean', description: 'Require explicit confirmation before executing reservations', default: true },
      defaultPartySize: { type: 'number', description: 'Default party size for new reservations' },
      sendConfirmations: { type: 'boolean', description: 'Send confirmation to guest', default: true },
    },
    required: ['confirmBeforeSend'],
  },
  timeoutMs: 30000,
  manifest: { confirmBeforeSend: true },
  triggers: [
    { kind: 'user', phrase_examples: ['Make a reservation', 'Book a table', 'Cancel reservation', 'Check availability'] },
    { kind: 'schedule', cadence: 'Daily reservation review' },
    { kind: 'event', on: 'Reservation requested' },
  ],
});

const KITCHEN_SKILL = createExternalActionSkill({
  id: 'restaurant-kitchen-service-operations',
  name: 'Kitchen & Service Operations',
  description: 'Manage kitchen display, service flow, station coordination, prep scheduling, server communication, and quality control.',
  system: 'restaurant',
  action: 'kitchen-service-operations',
  endpoint: { envVar: 'RESTAURANT_SERVICE_ENDPOINT', method: 'POST' },
  auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'RESTAURANT_SERVICE_API_KEY' } },
  inputSchema: buildExternalInputSchema(KITCHEN_INPUT_SCHEMA),
  outputSchema: EXTERNAL_OUTPUT_SCHEMA,
  configSchema: {
    type: 'object',
    properties: {
      confirmBeforeSend: { type: 'boolean', description: 'Require explicit confirmation before executing kitchen operations', default: true },
      defaultStation: { type: 'string', description: 'Default kitchen station' },
      notifyStaff: { type: 'boolean', description: 'Notify staff of changes', default: true },
    },
    required: ['confirmBeforeSend'],
  },
  timeoutMs: 30000,
  manifest: { confirmBeforeSend: true },
  triggers: [
    { kind: 'user', phrase_examples: ['Update kitchen status', 'Check ticket flow', 'Manage table turnover', 'Staff schedule update'] },
    { kind: 'schedule', cadence: 'Hourly kitchen review' },
    { kind: 'event', on: 'Ticket submitted' },
  ],
});

const MENU_RECIPE_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const operation = input.operation || 'recipe-management';
  const baseDir = process.env.RESTAURANT_HOME || '/tmp/restaurant';
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(baseDir, 'menu-recipe');
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'recipes.json');
  let recipes = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  if (operation === 'recipe-management') {
    const name = input.name || 'Untitled Recipe';
    const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
    const instructions = Array.isArray(input.instructions) ? input.instructions : [];
    const recipe = { id: 'recipe_' + Date.now(), name, ingredients, instructions, version: 1, createdAt: new Date().toISOString() };
    recipes.push(recipe);
    fs.writeFileSync(storePath, JSON.stringify(recipes, null, 2));
    console.log(JSON.stringify({ success: true, operation, data: { recipe, storePath } }));
  } else if (operation === 'recipe-costing') {
    const recipeId = input.recipeId || '';
    const ingredientPrices = input.ingredientPrices || {};
    const targetMargin = (input.targetMargin || 0.7) * 100;
    let totalCost = 0;
    const recipe = recipes.find(r => r.id === recipeId);
    if (recipe) {
      totalCost = recipe.ingredients.reduce((sum, ing) => sum + (ingredientPrices[ing.name] || 0) * (ing.quantity || 1), 0);
    }
    const sellingPrice = totalCost > 0 ? totalCost / (1 - targetMargin / 100) : 0;
    console.log(JSON.stringify({ success: true, operation, data: { recipeId, totalCost: Math.round(totalCost * 100) / 100, targetMargin, sellingPrice: Math.round(sellingPrice * 100) / 100 } }));
  } else if (operation === 'menu-engineering') {
    const menuId = input.menuId || '';
    const itemIds = Array.isArray(input.itemIds) ? input.itemIds : [];
    const popularity = input.popularity || {};
    const profitability = input.profitability || {};
    const items = itemIds.map(id => ({ id, popularity: popularity[id] || 50, profitability: profitability[id] || 0.3 }));
    const stars = items.map(item => ({
      id: item.id, quadrant: item.popularity > 50 && item.profitability > 0.3 ? 'star' : item.popularity > 50 ? 'puzzle' : item.profitability > 0.3 ? 'plowhorse' : 'dog',
      popularity: item.popularity, profitability: item.profitability,
    }));
    console.log(JSON.stringify({ success: true, operation, data: { menuId, stars } }));
  } else if (operation === 'menu-optimizer') {
    const menuId = input.menuId || '';
    const goals = input.goals || [];
    const constraints = input.constraints || [];
    const items = Array.isArray(input.items) ? input.items : [];
    const optimized = items.map((item, i) => ({ ...item, score: (item.popularity || 50) * (item.profitability || 0.3) * 100, recommended: goals.length > 0 && i % 2 === 0 }));
    optimized.sort((a, b) => b.score - a.score);
    console.log(JSON.stringify({ success: true, operation, data: { menuId, optimized } }));
  } else if (operation === 'pricing-strategy') {
    const menuId = input.menuId || '';
    const priceRules = input.priceRules || {};
    const elasticityData = input.elasticityData || {};
    const competitorData = input.competitorData || {};
    const priceSuggestion = { menuId, basePrice: 19.99, suggestedPrice: 22.99, confidence: 0.75, rulesApplied: Object.keys(priceRules) };
    console.log(JSON.stringify({ success: true, operation, data: priceSuggestion }));
  } else {
    console.log(JSON.stringify({ success: false, operation, error: 'Unknown operation: ' + operation }));
  }
})();`;

const MENU_RECIPE_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['recipe-management', 'recipe-costing', 'menu-engineering', 'menu-optimizer', 'pricing-strategy'], description: 'The menu/recipe operation to perform' },
    name: { type: 'string', description: 'Recipe or menu item name' },
    ingredients: { type: 'array', items: { type: 'object' }, description: 'List of recipe ingredients' },
    instructions: { type: 'array', items: { type: 'string' }, description: 'Cooking instructions' },
    recipeId: { type: 'string', description: 'Recipe identifier' },
    ingredientPrices: { type: 'object', description: 'Ingredient prices by name' },
    targetMargin: { type: 'number', description: 'Target profit margin (0-1)' },
    menuId: { type: 'string', description: 'Menu identifier' },
    itemIds: { type: 'array', items: { type: 'string' }, description: 'Menu item identifiers' },
    popularity: { type: 'object', description: 'Item popularity scores' },
    profitability: { type: 'object', description: 'Item profitability ratios' },
    goals: { type: 'array', items: { type: 'string' }, description: 'Optimization goals' },
    constraints: { type: 'array', items: { type: 'object' }, description: 'Optimization constraints' },
    items: { type: 'array', items: { type: 'object' }, description: 'Items to optimize' },
    priceRules: { type: 'object', description: 'Pricing rule definitions' },
    elasticityData: { type: 'object', description: 'Price elasticity data' },
    competitorData: { type: 'object', description: 'Competitor pricing data' },
  },
};

const MENU_RECIPE_SKILL = createCodeSkill({
  id: 'restaurant-menu-recipe-management',
  name: 'Menu & Recipe Management',
  description: 'Manage recipes, costing, menu engineering, menu optimization, and pricing strategy for the restaurant menu.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: MENU_RECIPE_SOURCE },
  inputSchema: MENU_RECIPE_INPUT_SCHEMA,
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the operation succeeded' },
      operation: { type: 'string', description: 'The operation performed' },
      data: { type: 'object', description: 'Result data for the operation' },
      error: { type: 'string', description: 'Error message if operation failed' },
    },
    required: ['success', 'operation'],
  },
});

const SUPPLY_CHAIN_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const operation = input.operation || 'inventory';
  const baseDir = process.env.RESTAURANT_HOME || '/tmp/restaurant';
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(baseDir, 'supply-chain');
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'supply.json');
  let items = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  if (operation === 'inventory') {
    const item = input.item || 'Unknown';
    const quantity = input.quantity || 0;
    const unit = input.unit || 'units';
    const supplier = input.supplier || 'Default Supplier';
    const entry = { id: 'inv_' + Date.now(), item, quantity, unit, supplier, updatedAt: new Date().toISOString() };
    items.push(entry);
    fs.writeFileSync(storePath, JSON.stringify(items, null, 2));
    console.log(JSON.stringify({ success: true, operation, data: { entry, storePath } }));
  } else if (operation === 'purchase-order') {
    const vendorId = input.vendorId || '';
    const orderItems = Array.isArray(input.items) ? input.items : [];
    const totalAmount = input.totalAmount || 0;
    const deliveryDate = input.deliveryDate || '';
    const po = { id: 'po_' + Date.now(), vendorId, items: orderItems, totalAmount, deliveryDate, status: 'open', createdAt: new Date().toISOString() };
    items.push(po);
    fs.writeFileSync(storePath, JSON.stringify(items, null, 2));
    console.log(JSON.stringify({ success: true, operation, data: { po, storePath } }));
  } else if (operation === 'supplier-management') {
    const supplierId = input.supplierId || '';
    const action = input.action || 'view';
    const contractTerms = input.contractTerms || {};
    const performanceData = input.performanceData || {};
    const supplier = { id: supplierId, action, contractTerms, performanceData, updatedAt: new Date().toISOString() };
    console.log(JSON.stringify({ success: true, operation, data: supplier }));
  } else if (operation === 'order-optimizer') {
    const ingredients = Array.isArray(input.ingredients) ? input.ingredients : [];
    const parLevels = input.parLevels || {};
    const leadTimes = input.leadTimes || {};
    const budget = input.budget || 0;
    const optimized = ingredients.map(ing => ({ name: ing, recommendedQty: parLevels[ing] || 10, leadTime: leadTimes[ing] || 2 }));
    console.log(JSON.stringify({ success: true, operation, data: { optimized, budget } }));
  } else if (operation === 'waste-management') {
    const itemId = input.itemId || '';
    const category = input.category || 'food';
    const quantity = input.quantity || 0;
    const cause = input.cause || 'unknown';
    const waste = { id: 'waste_' + Date.now(), itemId, category, quantity, cause, recordedAt: new Date().toISOString() };
    items.push(waste);
    fs.writeFileSync(storePath, JSON.stringify(items, null, 2));
    console.log(JSON.stringify({ success: true, operation, data: { waste, storePath } }));
  } else if (operation === 'price-tracking') {
    const ingredientIds = Array.isArray(input.ingredientIds) ? input.ingredientIds : [];
    const priceSources = input.priceSources || [];
    const alerts = input.alertThresholds || {};
    const tracking = ingredientIds.map(id => ({ id, currentPrice: 2500, alerts }));
    console.log(JSON.stringify({ success: true, operation, data: { tracking } }));
  } else {
    console.log(JSON.stringify({ success: false, operation, error: 'Unknown operation: ' + operation }));
  }
})();`;

const SUPPLY_CHAIN_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['inventory', 'purchase-order', 'supplier-management', 'order-optimizer', 'waste-management', 'price-tracking'], description: 'The supply chain operation to perform' },
    item: { type: 'string', description: 'Inventory item name' },
    quantity: { type: 'number', description: 'Quantity of the item' },
    unit: { type: 'string', description: 'Unit of measurement' },
    supplier: { type: 'string', description: 'Supplier name' },
    vendorId: { type: 'string', description: 'Vendor identifier' },
    items: { type: 'array', items: { type: 'object' }, description: 'Order items' },
    totalAmount: { type: 'number', description: 'Total order amount' },
    deliveryDate: { type: 'string', description: 'Expected delivery date (YYYY-MM-DD)' },
    action: { type: 'string', description: 'Action to perform on supplier' },
    contractTerms: { type: 'object', description: 'Supplier contract terms' },
    performanceData: { type: 'object', description: 'Supplier performance data' },
    supplierId: { type: 'string', description: 'Supplier identifier' },
    parLevels: { type: 'object', description: 'Par levels by ingredient' },
    leadTimes: { type: 'object', description: 'Lead times by ingredient' },
    budget: { type: 'number', description: 'Order budget' },
    category: { type: 'string', description: 'Waste category' },
    cause: { type: 'string', description: 'Cause of waste' },
    priceSources: { type: 'array', items: { type: 'string' }, description: 'Price sources to track' },
    alertThresholds: { type: 'object', description: 'Price alert thresholds' },
    ingredientIds: { type: 'array', items: { type: 'string' }, description: 'Ingredient identifiers' },
  },
};

const SUPPLY_CHAIN_SKILL = createCodeSkill({
  id: 'restaurant-supply-chain-inventory',
  name: 'Supply Chain & Inventory',
  description: 'Manage inventory, purchase orders, suppliers, order optimization, waste tracking, and price tracking for the restaurant supply chain.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: SUPPLY_CHAIN_SOURCE },
  inputSchema: SUPPLY_CHAIN_INPUT_SCHEMA,
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the operation succeeded' },
      operation: { type: 'string', description: 'The operation performed' },
      data: { type: 'object', description: 'Result data for the operation' },
      storePath: { type: 'string', description: 'File path where data is stored' },
      error: { type: 'string', description: 'Error message if operation failed' },
    },
    required: ['success', 'operation'],
  },
});

const STAFFING_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const operation = input.operation || 'staff-scheduler';
  const baseDir = process.env.RESTAURANT_HOME || '/tmp/restaurant';
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(baseDir, 'staffing');
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'staff.json');
  let staff = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  if (operation === 'staff-scheduler') {
    const staffId = input.staffId || '';
    const shiftId = input.shiftId || '';
    const date = input.date || new Date().toISOString().split('T')[0];
    const role = input.role || 'server';
    const entry = { id: 'shift_' + Date.now(), staffId, shiftId, date, role, status: 'scheduled', createdAt: new Date().toISOString() };
    staff.push(entry);
    fs.writeFileSync(storePath, JSON.stringify(staff, null, 2));
    console.log(JSON.stringify({ success: true, operation, data: { entry, storePath } }));
  } else if (operation === 'labor-analytics') {
    const dateRange = input.dateRange || { start: '', end: '' };
    const metric = input.metric || 'labor-cost';
    const department = input.department || 'all';
    const comparison = input.comparison || {};
    const analytics = {
      dateRange, metric, department,
      laborCost: 3500,
      laborPercentRevenue: 22.5,
      productivity: 12.5,
      overtimeHours: 18.5,
      comparison,
    };
    console.log(JSON.stringify({ success: true, operation, data: analytics }));
  } else {
    console.log(JSON.stringify({ success: false, operation, error: 'Unknown operation: ' + operation }));
  }
})();`;

const STAFFING_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['staff-scheduler', 'labor-analytics'], description: 'The staffing operation to perform' },
    staffId: { type: 'string', description: 'Staff member identifier' },
    shiftId: { type: 'string', description: 'Shift identifier' },
    date: { type: 'string', description: 'Shift date (YYYY-MM-DD)' },
    role: { type: 'string', description: 'Staff role (e.g., server, chef, host)' },
    dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date (YYYY-MM-DD)' }, end: { type: 'string', description: 'End date (YYYY-MM-DD)' } }, description: 'Date range for analytics' },
    metric: { type: 'string', description: 'Labor metric to analyze' },
    department: { type: 'string', description: 'Department to filter' },
    comparison: { type: 'object', description: 'Comparison period data' },
  },
};

const STAFFING_SKILL = createCodeSkill({
  id: 'restaurant-staffing-labor',
  name: 'Staffing & Labor',
  description: 'Schedule staff, track labor analytics, overtime, productivity, and compliance for restaurant staffing.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: STAFFING_SOURCE },
  inputSchema: STAFFING_INPUT_SCHEMA,
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the operation succeeded' },
      operation: { type: 'string', description: 'The operation performed' },
      data: { type: 'object', description: 'Result data for the operation' },
      storePath: { type: 'string', description: 'File path where data is stored' },
      error: { type: 'string', description: 'Error message if operation failed' },
    },
    required: ['success', 'operation'],
  },
});

const FINANCIAL_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const operation = input.operation || 'financial-analytics';
  const dateRange = input.dateRange || { start: '', end: '' };

  if (operation === 'financial-analytics') {
    const metric = input.metric || 'revenue';
    const department = input.department || 'all';
    const comparison = input.comparison || {};
    const data = {
      metric, department, dateRange, comparison,
      revenue: 42000,
      cogs: 18500,
      laborCost: 12000,
      primeCost: 28000,
      netProfit: 8500,
    };
    console.log(JSON.stringify({ success: true, operation, data }));
  } else if (operation === 'variance-analysis') {
    const accountIds = Array.isArray(input.accountIds) ? input.accountIds : [];
    const comparisonPeriod = input.comparisonPeriod || '';
    const actualVsBudget = { totalActual: 38000, totalBudget: 40000, variance: -2000 };
    const mixAnalysis = { topCategory: 'Entrees', mixShift: -2.5 };
    const result = { actualVsBudget, mixAnalysis, comparisonPeriod, accountIds };
    console.log(JSON.stringify({ success: true, operation, data: result }));
  } else if (operation === 'trend-analysis') {
    const metric = input.metric || 'sales';
    const granularity = input.granularity || 'weekly';
    const forecastPeriod = input.forecastPeriod || 4;
    const trend = { direction: 'upward', slope: 245.5, confidence: 'high', forecastPeriod };
    console.log(JSON.stringify({ success: true, operation, data: { metric, granularity, trend } }));
  } else if (operation === 'sales-analytics') {
    const category = input.category || 'all';
    const channel = input.channel || 'all';
    const granularity = input.granularity || 'daily';
    const data = {
      category, channel, granularity,
      revenueByCategory: { entrees: 8500, drinks: 3200, appetizers: 2100, desserts: 1800 },
      averageCheck: 34.25,
      covers: 180,
    };
    console.log(JSON.stringify({ success: true, operation, data }));
  } else if (operation === 'demand-forecast') {
    const date = input.date || new Date().toISOString().split('T')[0];
    const timeRange = input.timeRange || '7d';
    const metric = input.metric || 'covers';
    const forecast = { date, timeRange, metric, predicted: 165, confidence: 0.82, seasonality: 'normal' };
    console.log(JSON.stringify({ success: true, operation, data: forecast }));
  } else {
    console.log(JSON.stringify({ success: false, operation, error: 'Unknown operation: ' + operation }));
  }
})();`;

const FINANCIAL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['financial-analytics', 'variance-analysis', 'trend-analysis', 'sales-analytics', 'demand-forecast'], description: 'The financial operation to perform' },
    dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date (YYYY-MM-DD)' }, end: { type: 'string', description: 'End date (YYYY-MM-DD)' } }, description: 'Date range for the query' },
    metric: { type: 'string', description: 'Financial or sales metric to analyze' },
    department: { type: 'string', description: 'Department to filter' },
    comparison: { type: 'object', description: 'Comparison period data' },
    comparisonPeriod: { type: 'string', description: 'Comparison period identifier' },
    accountIds: { type: 'array', items: { type: 'string' }, description: 'Account identifiers for variance analysis' },
    granularity: { type: 'string', description: 'Time granularity (daily, weekly, monthly)' },
    category: { type: 'string', description: 'Sales category' },
    channel: { type: 'string', description: 'Sales channel' },
    forecastPeriod: { type: 'number', description: 'Number of periods to forecast' },
    date: { type: 'string', description: 'Forecast date (YYYY-MM-DD)' },
    timeRange: { type: 'string', description: 'Time range for forecast' },
  },
};

const FINANCIAL_SKILL = createCodeSkill({
  id: 'restaurant-financial-advisory',
  name: 'Financial Performance Advisory',
  description: 'Analyze financial performance, variances, trends, sales metrics, and forecast demand for data-driven restaurant decisions.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: FINANCIAL_SOURCE },
  inputSchema: FINANCIAL_INPUT_SCHEMA,
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the operation succeeded' },
      operation: { type: 'string', description: 'The operation performed' },
      data: { type: 'object', description: 'Result data for the operation' },
      error: { type: 'string', description: 'Error message if operation failed' },
    },
    required: ['success', 'operation'],
  },
});



export const restaurantSkills: Tool[] = [
  { ...RESERVATIONS_SKILL, isSkill: false },
  { ...KITCHEN_SKILL, isSkill: false },
  { ...MENU_RECIPE_SKILL, isSkill: false },
  { ...SUPPLY_CHAIN_SKILL, isSkill: false },
  { ...STAFFING_SKILL, isSkill: false },
  { ...FINANCIAL_SKILL, isSkill: false },
  RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST,
  RESTAURANT_SHIFT_PREP_LIST_COPILOT,
  RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER,
  RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER,
  RESTAURANT_FINANCIAL_FORECAST_EVALUATOR,
];

export const restaurantCanonicalSkills: Tool[] = [
  RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST,
  RESTAURANT_SHIFT_PREP_LIST_COPILOT,
  RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER,
  RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER,
  RESTAURANT_FINANCIAL_FORECAST_EVALUATOR,
];
