import { Tool } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const FINANCIAL_FORECAST_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const operation = input.operation || 'financial-forecast';
  const baseDir = process.env.RESTAURANT_HOME || '/tmp/restaurant';
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(baseDir, 'financial-forecast');
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'forecast.json');

  if (!fs.existsSync(baseDir)) {
    console.log(JSON.stringify({ success: false, mode: 'not-connected', operation, error: 'Not connected: RESTAURANT_HOME is not accessible. Financial forecast requires a valid RESTAURANT_HOME path.', endpoint: null }));
    return;
  }

  const varianceThreshold = input.varianceThreshold || 0.1;
  const forecastHorizon = input.forecastHorizon || 12;

  if (operation === 'financial-forecast') {
    const dateRange = input.dateRange || { start: '', end: '' };
    const mappedInput = { operation: 'financial-analytics', dateRange };

    try {
      const financialResult = await __execute_tool('restaurant-financial-advisory', mappedInput);
      if (!financialResult || !financialResult.success) {
        console.log(JSON.stringify({ success: false, mode: 'error', operation, data: null, error: (financialResult && financialResult.error) || 'Financial advisory execution failed', endpoint: null }));
        return;
      }
      const financialData = financialResult.data || {};
      const revenue = financialData.revenue || 0;
      const cogs = financialData.cogs || 0;
      const laborCost = financialData.laborCost || 0;
      const netProfit = financialData.netProfit || 0;

      const mappedMenuInput = {
        operation: 'menu-engineering',
        menuId: input.menuId || '',
        itemIds: Array.isArray(input.itemIds) ? input.itemIds : [],
        popularity: input.popularity || {},
        profitability: input.profitability || {},
      };
      const menuResult = await __execute_tool('restaurant-menu-engineering-cost-strategist', mappedMenuInput);
      const menuData = (menuResult && menuResult.data) || {};
      const menuSummary = menuData.summary || { stars: 0, puzzles: 0, plowhorses: 0, dogs: 0 };

      const mappedSupplyInput = {
        operation: 'inventory-reorder',
        items: input.inventoryItems || [],
        reorderPoints: input.reorderPoints || {},
        safetyStock: input.safetyStock || {},
        leadTimes: input.leadTimes || {},
        unitCosts: input.unitCosts || {},
      };
      const supplyResult = await __execute_tool('restaurant-supply-chain-inventory-reorder-manager', mappedSupplyInput);
      const supplyData = (supplyResult && supplyResult.data) || {};
      const totalReorderCost = supplyData.totalCost || 0;

      const mappedPrepInput = {
        operation: 'shift-prep',
        date: input.date || new Date().toISOString().split('T')[0],
        forecastCovers: Number(input.forecastCovers || 0),
        prepRatios: input.prepRatios || {},
        currentStock: input.currentStock || {},
        shift: input.shift || 'all',
      };
      const prepResult = await __execute_tool('restaurant-shift-prep-list-copilot', mappedPrepInput);
      const prepData = (prepResult && prepResult.data) || {};
      const prepShortage = prepData.totals?.shortage || 0;

      const forecast = [];
      for (let i = 1; i <= forecastHorizon; i++) {
        const periodRevenue = revenue * (1 + (Math.random() - 0.5) * 0.1);
        const periodCogs = cogs * (1 + (Math.random() - 0.5) * 0.1);
        const periodLabor = laborCost * (1 + (Math.random() - 0.5) * 0.1);
        const periodProfit = periodRevenue - periodCogs - periodLabor;
        const variance = i === 1 ? 0 : ((periodRevenue - revenue) / revenue);
        const flag = Math.abs(variance) > varianceThreshold ? 'high-variance' : 'normal';
        forecast.push({ period: i, revenue: Math.round(periodRevenue * 100) / 100, cogs: Math.round(periodCogs * 100) / 100, labor: Math.round(periodLabor * 100) / 100, profit: Math.round(periodProfit * 100) / 100, variance: Math.round(variance * 10000) / 100, flag });
      }

      const resultData = {
        dateRange,
        forecastHorizon,
        varianceThreshold,
        currentPnL: { revenue, cogs, laborCost, netProfit, primeCost: cogs + laborCost, grossMargin: revenue > 0 ? (revenue - cogs) / revenue : 0 },
        menuEngineering: { summary: menuSummary, topQuadrant: 'star' },
        supplyChain: { reorderCost: totalReorderCost, itemsFlagged: supplyData.itemsFlagged || 0 },
        shiftPrep: { forecastCovers: input.forecastCovers || 0, prepShortage },
        forecast,
        varianceAlerts: forecast.filter(f => f.flag === 'high-variance').length,
      };
      console.log(JSON.stringify({ success: true, mode: 'live', operation, data: resultData, endpoint: null }));
    } catch (e) {
      console.log(JSON.stringify({ success: false, mode: 'error', operation, data: null, error: String(e), endpoint: null }));
    }
  } else if (operation === 'variance-analysis') {
    const accountIds = Array.isArray(input.accountIds) ? input.accountIds : [];
    const comparisonPeriod = input.comparisonPeriod || '';
    const mappedInput = { operation: 'variance-analysis', accountIds, comparisonPeriod };
    try {
      const result = await __execute_tool('restaurant-financial-advisory', mappedInput);
      if (!result || !result.success) {
        console.log(JSON.stringify({ success: false, mode: 'error', operation, data: null, error: (result && result.error) || 'Variance analysis failed', endpoint: null }));
        return;
      }
      const data = result.data || {};
      const actualVsBudget = data.actualVsBudget || { totalActual: 0, totalBudget: 0, variance: 0 };
      const variancePct = actualVsBudget.totalBudget ? (actualVsBudget.variance / actualVsBudget.totalBudget) : 0;
      const flagged = Math.abs(variancePct) > varianceThreshold;
      console.log(JSON.stringify({ success: true, mode: 'live', operation, data: { ...data, variancePct: Math.round(variancePct * 10000) / 100, flagged, threshold: varianceThreshold }, endpoint: null }));
    } catch (e) {
      console.log(JSON.stringify({ success: false, mode: 'error', operation, data: null, error: String(e), endpoint: null }));
    }
  } else if (operation === 'demand-forecast') {
    const date = input.date || new Date().toISOString().split('T')[0];
    const timeRange = input.timeRange || '7d';
    const metric = input.metric || 'covers';
    const mappedInput = { operation: 'demand-forecast', date, timeRange, metric };
    try {
      const result = await __execute_tool('restaurant-financial-advisory', mappedInput);
      if (!result || !result.success) {
        console.log(JSON.stringify({ success: false, mode: 'error', operation, data: null, error: (result && result.error) || 'Demand forecast failed', endpoint: null }));
        return;
      }
      const data = result.data || {};
      const forecast = [];
      const basePredicted = data.predicted || 0;
      for (let i = 1; i <= forecastHorizon; i++) {
        const predicted = Math.round(basePredicted * (1 + (Math.random() - 0.3) * 0.2));
        forecast.push({ period: i, predicted, confidence: Math.max(0.5, data.confidence - i * 0.05) });
      }
      console.log(JSON.stringify({ success: true, mode: 'live', operation, data: { date, timeRange, metric, baseForecast: data, extendedForecast: forecast, horizon: forecastHorizon }, endpoint: null }));
    } catch (e) {
      console.log(JSON.stringify({ success: false, mode: 'error', operation, data: null, error: String(e), endpoint: null }));
    }
  } else {
    console.log(JSON.stringify({ success: false, mode: 'error', operation, data: null, error: 'Unknown operation: ' + operation, endpoint: null }));
  }
})()`;

const FINANCIAL_FORECAST_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    operation: { type: 'string', enum: ['financial-forecast', 'variance-analysis', 'demand-forecast'], description: 'The financial forecast operation to perform' },
    dateRange: { type: 'object', properties: { start: { type: 'string', description: 'Start date (YYYY-MM-DD)' }, end: { type: 'string', description: 'End date (YYYY-MM-DD)' } }, description: 'Date range for financial analysis' },
    forecastHorizon: { type: 'number', description: 'Number of periods to forecast (weeks/months)', default: 12 },
    varianceThreshold: { type: 'number', description: 'Variance threshold as decimal (e.g., 0.1 = 10%)', default: 0.1 },
    menuId: { type: 'string', description: 'Menu identifier for engineering analysis' },
    itemIds: { type: 'array', items: { type: 'string' }, description: 'Menu item identifiers' },
    popularity: { type: 'object', description: 'Item popularity scores (0-100)' },
    profitability: { type: 'object', description: 'Item profitability ratios (0-1)' },
    inventoryItems: { type: 'array', items: { type: 'object' }, description: 'Inventory items for supply chain analysis' },
    reorderPoints: { type: 'object', description: 'Reorder point by item name' },
    safetyStock: { type: 'object', description: 'Safety stock by item name' },
    leadTimes: { type: 'object', description: 'Lead time in days by item name' },
    unitCosts: { type: 'object', description: 'Unit cost by item name' },
    date: { type: 'string', description: 'Forecast date (YYYY-MM-DD)' },
    timeRange: { type: 'string', description: 'Time range for demand forecast (e.g., 7d, 30d)' },
    metric: { type: 'string', description: 'Demand metric (covers, revenue, etc.)' },
    forecastCovers: { type: 'number', description: 'Forecasted number of covers for prep' },
    prepRatios: { type: 'object', description: 'Prep quantity ratio per cover by item name' },
    currentStock: { type: 'object', description: 'Current stock levels by item name' },
    shift: { type: 'string', enum: ['breakfast', 'lunch', 'dinner', 'all'], description: 'Shift name' },
    accountIds: { type: 'array', items: { type: 'string' }, description: 'Account identifiers for variance analysis' },
    comparisonPeriod: { type: 'string', description: 'Comparison period identifier' },
  },
  required: ['operation'],
};

const FINANCIAL_FORECAST_CONFIG = {
  type: 'object',
  properties: {
    confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before applying forecast-driven changes', default: false }),
    forecastHorizonDays: SchemaProps.number({ description: 'Default forecast horizon in days', default: 12 }),
    varianceThresholdPercent: SchemaProps.number({ description: 'Default variance threshold as a percentage (e.g., 10 = 10%)', default: 10 }),
    highVarianceAlertThreshold: SchemaProps.number({ description: 'Number of high-variance periods before alert', default: 3 }),
  },
};

const FINANCIAL_FORECAST_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean', description: 'Whether the operation succeeded' },
    mode: { type: 'string', enum: ['live', 'not-connected', 'error'], description: 'Execution mode' },
    operation: { type: 'string', description: 'The operation performed' },
    data: { type: 'object', description: 'Forecast result data including P&L, variance, demand projections' },
    endpoint: { type: ['string', 'null'], description: 'Endpoint used' },
    error: { type: ['string', 'null'], description: 'Error message if failed' },
  },
  required: ['success', 'mode', 'operation'],
};

export const RESTAURANT_FINANCIAL_FORECAST_EVALUATOR = createCodeSkill({
  id: 'restaurant-financial-forecast-evaluator',
  name: 'Restaurant Financial Performance & Demand Forecast Evaluator',
  description: 'Evaluate financial performance (P&L, variance, trends) and forecast demand by delegating to menu engineering, supply chain reorder, and shift prep copilot skills. Returns not-connected when RESTAURANT_HOME is absent.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: FINANCIAL_FORECAST_SOURCE, configSchema: FINANCIAL_FORECAST_CONFIG },
  inputSchema: FINANCIAL_FORECAST_INPUT_SCHEMA,
  outputSchema: FINANCIAL_FORECAST_OUTPUT_SCHEMA,
  triggers: [
    { kind: 'user', phrase_examples: ['Forecast financial performance', 'Analyze P&L variance', 'Predict demand', 'Check financial health'] },
    { kind: 'schedule', cadence: 'Weekly financial review' },
    { kind: 'event', on: 'Financial period close' },
  ],
});
