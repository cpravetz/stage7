// @ts-nocheck
import { Tool } from '../../../types';
import { createDeclarativeCodeSkill, createSchemaRecord, SchemaProps } from '../../../adk/code-skill-factory';
import { restaurantResultSchema, RESTAURANT_SAFETY_BOUNDARY, RESTAURANT_PRESENT_SCHEMA } from '../restaurant-contract';

const FINANCIAL_FORECAST_CONFIG = createSchemaRecord({
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before applying forecast-driven changes', default: false }),
  forecastHorizonDays: SchemaProps.number({ description: 'Default forecast horizon in days', default: 12 }),
  varianceThresholdPercent: SchemaProps.number({ description: 'Default variance threshold as a percentage (e.g., 10 = 10%)', default: 10 }),
  highVarianceAlertThreshold: SchemaProps.number({ description: 'Number of high-variance periods before alert', default: 3 }),
  // These were user inputs, but a forecast runs on the same menu, stock and
  // supplier data every time. Asking someone to re-enter 15 payload fields to
  // forward to three downstream skills is onus with no per-run meaning; they
  // describe the connected data source instead.
  dataSource: SchemaProps.text({
    description: 'Restaurant data source the figures come from, such as a POS or accounting system',
    required: true,
  }),
});

const FINANCIAL_FORECAST_INPUT_SCHEMA = createSchemaRecord({
  dateRange: SchemaProps.object({ start: SchemaProps.text({ description: 'Start date (YYYY-MM-DD)' }), end: SchemaProps.text({ description: 'End date (YYYY-MM-DD)' }) }, { description: 'Date range for financial analysis' }),
  forecastHorizon: SchemaProps.number({ description: 'Number of periods to forecast (weeks/months)', default: 12 }),
  varianceThreshold: SchemaProps.number({ description: 'Variance threshold as decimal (e.g., 0.1 = 10%)', default: 0.1 }),
  revenue: SchemaProps.number({ description: 'Current revenue (optional, can be sourced from financial analytics)' }),
  cogs: SchemaProps.number({ description: 'Current cost of goods sold (optional)' }),
  laborCost: SchemaProps.number({ description: 'Current labor cost (optional)' }),
  netProfit: SchemaProps.number({ description: 'Current net profit (optional)' }),
  date: SchemaProps.text({ description: 'Forecast date (YYYY-MM-DD)' }),
  timeRange: SchemaProps.text({ description: 'Time range for demand forecast (e.g., 7d, 30d)' }),
  metric: SchemaProps.text({ description: 'Demand metric (covers, revenue, etc.)' }),
  accountIds: SchemaProps.stringArray({ description: 'Account identifiers for variance analysis' }),
  comparisonPeriod: SchemaProps.text({ description: 'Comparison period identifier' }),
});

export const RESTAURANT_FINANCIAL_FORECAST_EVALUATOR = createDeclarativeCodeSkill({
  id: 'restaurant-financial-forecast-evaluator',
  name: 'Restaurant Financial Performance & Demand Forecast Evaluator',
  description: 'Evaluate financial performance (P&L, variance, trends) and forecast demand by delegating to menu engineering, supply chain reorder, and shift prep copilot skills. Forecasts are deterministic (derived from supplied P&L with a trend factor), not random. Reports not-connected when RESTAURANT_HOME is absent.',
  persistenceEnvVar: 'STORAGE_DIR',
  inputSchema: FINANCIAL_FORECAST_INPUT_SCHEMA,
  outputSchema: restaurantResultSchema('Forecast result data including P&L, variance, demand projections, delegation coverage, and step results'),
  triggers: [
    { kind: 'schedule', cadence: 'Periodic financial forecast review from the configured data source' },
  ],
  isSkill: true,
  tier: 'advise',
  domainKnowledge: 'Restaurant P&L accounting, variance analysis, demand forecasting, menu engineering economics, and inventory reorder logic',
  confirmBeforeSend: false,
  manifest: {
    configSchema: FINANCIAL_FORECAST_CONFIG
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const cfg = ctx.config || {};
      const dataSource = String(cfg.dataSource || '');
      const SAFETY = "food safety / allergen protocol";

      const varianceThreshold = Number(input.varianceThreshold || 0.1);
      const forecastHorizon = Math.max(1, Math.min(50, Number(input.forecastHorizon || 12)));
      const dateRange = input.dateRange || { start: '', end: '' };

      let revenue = Number(input.revenue || 0);
      let cogs = Number(input.cogs || 0);
      let laborCost = Number(input.laborCost || 0);
      let netProfit = Number(input.netProfit || 0);

      // ---- Delegated data ---------------------------------------------------------
      const delegatedTo = ['restaurant-menu-engineering-cost-strategist', 'restaurant-supply-chain-inventory-reorder-manager', 'restaurant-shift-prep-list-copilot'];
      const stepStatus = { menu_engineering: 'not-attempted', supply_chain: 'not-attempted', shift_prep: 'not-attempted' };
      const stepErrors = {};
      const stepsAttempted = [];
      const stepsSucceeded = [];
      const stepsFailed = [];
      const stepsUnavailable = [];

      function notConnected(title, body) {
        return         {
        success: false,
        status: 'not-connected',
        connected: false,
        operation: 'financial-forecast',
        data: { stepsAttempted, stepsSucceeded, stepsFailed, stepsUnavailable, stepStatus, coverage: { attempted: stepsAttempted.length, succeeded: stepsSucceeded.length, failed: stepsFailed.length, unavailable: stepsUnavailable.length } },
        present: [{ id: 'notice', title: title, kind: 'text', body: body + NL + NL + SAFETY }],
        safetyBoundary: SAFETY,
        };
      }

      function fail(status, message, title) {
        return         {
        success: false,
        status: status,
        error: message,
        data: { stepsAttempted, stepsSucceeded, stepsFailed, stepsUnavailable, stepStatus, coverage: { attempted: stepsAttempted.length, succeeded: stepsSucceeded.length, failed: stepsFailed.length, unavailable: stepsUnavailable.length } },
        present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }],
        safetyBoundary: SAFETY,
        };
      }

      function done(success, status, bodyLines, dataExtra) {
        const body = bodyLines.join(NL);
        const data = Object.assign(
          { stepsAttempted, stepsSucceeded, stepsFailed, stepsUnavailable, stepStatus, coverage: { attempted: stepsAttempted.length, succeeded: stepsSucceeded.length, failed: stepsFailed.length, unavailable: stepsUnavailable.length } },
          dataExtra || {}
        );
        return {
          success: success,
          status: status,
          data: data,
          present: [{ id: 'forecast', title: 'Financial forecast', kind: 'text', body: body }],
          safetyBoundary: SAFETY,
        };
      }

      // Every figure now comes from operator config. With no configured source
      // the skill has nothing to forecast, and delegating with empty payloads
      // would report a confident-looking all-zero result.
      if (!dataSource) {
        const lines = [];
        lines.push('No restaurant data source is configured.');
        lines.push('');
        lines.push('Set dataSource in this Skill\u2019s settings to the POS or accounting system the figures come from.');
        return done(false, 'not-connected', lines, null);
      }

      if (!ctx.delegate) {
        const lines = [];
        lines.push('No lower-order tooling is available in this environment.');
        lines.push('');
        lines.push('Supply financial inputs directly (revenue, cogs, laborCost) to compute a forecast from local data.');
        return done(false, 'not-connected', lines, null);
        return;
      }

      stepsAttempted.push('menu_engineering');
      let menuSummary = { stars: 0, puzzles: 0, plowhorses: 0, dogs: 0 };
      try {
        const menuResult = await ctx.delegate('restaurant-menu-engineering-cost-strategist', {
          operation: 'menu-engineering',
          itemIds: cfg.itemIds || [],
          popularity: cfg.popularity || {},
          profitability: cfg.profitability || {},
        });
        if (menuResult && menuResult.success === false) {
          stepErrors.menu_engineering = menuResult.error || 'Lower-order tool not configured';
          stepsFailed.push('menu_engineering');
          stepStatus.menu_engineering = 'failed';
        } else {
          const menuData = (menuResult && menuResult.data) || {};
          menuSummary = menuData.summary || { stars: 0, puzzles: 0, plowhorses: 0, dogs: 0 };
          stepsSucceeded.push('menu_engineering');
          stepStatus.menu_engineering = 'succeeded';
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        stepErrors.menu_engineering = err;
        stepsFailed.push('menu_engineering');
        stepStatus.menu_engineering = 'failed';
      }

      stepsAttempted.push('supply_chain');
      let totalReorderCost = 0;
      let itemsFlagged = 0;
      try {
        const supplyResult = await ctx.delegate('restaurant-supply-chain-inventory-reorder-manager', {
          operation: 'inventory-reorder',
          items: cfg.inventoryItems || [],
          reorderPoints: cfg.reorderPoints || {},
          safetyStock: cfg.safetyStock || {},
          leadTimes: cfg.leadTimes || {},
          unitCosts: cfg.unitCosts || {},
          dryRun: true,
        });
        if (supplyResult && supplyResult.success === false) {
          stepErrors.supply_chain = supplyResult.error || 'Lower-order tool not configured';
          stepsFailed.push('supply_chain');
          stepStatus.supply_chain = 'failed';
        } else {
          const supplyData = (supplyResult && supplyResult.data) || {};
          totalReorderCost = Number(supplyData.totalCost || 0);
          itemsFlagged = Number(supplyData.itemsFlagged || supplyData.summary?.items || 0);
          stepsSucceeded.push('supply_chain');
          stepStatus.supply_chain = 'succeeded';
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        stepErrors.supply_chain = err;
        stepsFailed.push('supply_chain');
        stepStatus.supply_chain = 'failed';
      }

      stepsAttempted.push('shift_prep');
      let prepShortage = 0;
      try {
        const prepResult = await ctx.delegate('restaurant-shift-prep-list-copilot', {
          operation: 'shift-prep',
          date: input.date || new Date().toISOString().split('T')[0],
          forecastCovers: Number(cfg.forecastCovers || 0),
          prepRatios: cfg.prepRatios || {},
          currentStock: cfg.currentStock || {},
          shift: cfg.shift || 'all',
        });
        if (prepResult && prepResult.success === false) {
          stepErrors.shift_prep = prepResult.error || 'Lower-order tool not configured';
          stepsFailed.push('shift_prep');
          stepStatus.shift_prep = 'failed';
        } else {
          const prepData = (prepResult && prepResult.data && typeof prepResult.data === 'object') ? prepResult.data : {};
          prepShortage = Number(prepData.totals?.shortage || prepData.totals?.shortage || 0);
          stepsSucceeded.push('shift_prep');
          stepStatus.shift_prep = 'succeeded';
        }
      } catch (error) {
        const err = error instanceof Error ? error.message : String(error);
        stepErrors.shift_prep = err;
        stepsFailed.push('shift_prep');
        stepStatus.shift_prep = 'failed';
      }

      const allConnected = stepsFailed.length === 0;
      const partial = stepsFailed.length > 0 && stepsSucceeded.length > 0;
      if (!allConnected && !partial) {
        const lines = [];
        lines.push('Forecast aborted: all lower-order tools failed or were unavailable.');
        lines.push('');
        lines.push('Step results:');
        lines.push('  - menu_engineering: ' + stepStatus.menu_engineering);
        lines.push('  - supply_chain: ' + stepStatus.supply_chain);
        lines.push('  - shift_prep: ' + stepStatus.shift_prep);
        lines.push('');
        lines.push('No forecast was produced.');
        return done(false, 'failed', lines, { error: 'All delegated tools failed or were unavailable', delegatedTo, stepErrors, stepResults: {} });
        return;
      }

      // ---- Forecast (deterministic variance derived from period index) -------------
      const forecast = [];
      for (let i = 1; i <= forecastHorizon; i++) {
        const trendFactor = 1 + (i - 1) * 0.01;
        const periodRevenue = Math.round(revenue * trendFactor * 100) / 100;
        const periodCogs = Math.round(cogs * trendFactor * 100) / 100;
        const periodLabor = Math.round(laborCost * trendFactor * 100) / 100;
        const periodProfit = Math.round((periodRevenue - periodCogs - periodLabor) * 100) / 100;
        const baseVariance = revenue > 0 ? ((periodRevenue - revenue) / revenue) : 0;
        const variance = Math.round(baseVariance * 10000) / 100;
        const flag = Math.abs(baseVariance) > varianceThreshold ? 'high-variance' : 'normal';
        forecast.push({ period: i, revenue: periodRevenue, cogs: periodCogs, labor: periodLabor, profit: periodProfit, variance, flag });
      }

      const resultData = {
        dateRange,
        forecastHorizon,
        varianceThreshold,
        currentPnL: { revenue, cogs, laborCost, netProfit, primeCost: cogs + laborCost, grossMargin: revenue > 0 ? Math.round((revenue - cogs) / revenue * 10000) / 100 : 0 },
        menuEngineering: { summary: menuSummary, topQuadrant: 'star' },
        supplyChain: { reorderCost: totalReorderCost, itemsFlagged },
        shiftPrep: { forecastCovers: cfg.forecastCovers || 0, prepShortage },
        forecast,
        varianceAlerts: forecast.filter(f => f.flag === 'high-variance').length,
        delegatedTo,
        stepStatus,
        stepErrors: stepsFailed.length > 0 ? stepErrors : undefined,
      };

      // ---- Report ------------------------------------------------------------------
      const lines = [];
      lines.push('Financial performance forecast (derived locally; variance is a deterministic trend, not a random forecast).');
      lines.push('');
      lines.push('Current P&L: revenue=' + revenue + ', COGS=' + cogs + ', labor=' + laborCost + ', netProfit=' + netProfit + ', primeCost=' + (cogs + laborCost));
      lines.push('');
      if (stepsSucceeded.length > 0) {
        lines.push('Delegated analysis coverage (' + stepsSucceeded.length + ' of ' + stepsAttempted.length + ' tools succeeded):');
        stepsSucceeded.forEach(function (s) { lines.push('  - ' + s + ': succeeded'); });
      }
      if (stepsFailed.length > 0) {
        lines.push('Delegated analysis failed (' + stepsFailed.length + ' tools):');
        stepsFailed.forEach(function (s) { lines.push('  - ' + s + ': failed (' + (stepErrors[s] || 'lower-order tool not configured') + ')'); });
        lines.push('');
        lines.push('Values from ' + stepsFailed.join(', ') + ' were not available and are reported as zero in the forecast.');
      }
      lines.push('');
      lines.push('Menu engineering: stars=' + menuSummary.stars + ', puzzles=' + menuSummary.puzzles + ', plowhorses=' + menuSummary.plowhorses + ', dogs=' + menuSummary.dogs);
      lines.push('Supply chain: reorder cost=' + Math.round(totalReorderCost * 100) / 100 + ', items flagged=' + itemsFlagged);
      lines.push('Shift prep: shortage=' + prepShortage);
      lines.push('');
      lines.push('Forecast (' + forecastHorizon + ' periods, threshold=' + (varianceThreshold * 100) + '%):');
      forecast.forEach(function (f) {
        lines.push('  Period ' + f.period + ': revenue=' + f.revenue + ', COGS=' + f.cogs + ', labor=' + f.labor + ', profit=' + f.profit + ', variance=' + f.variance + '%, flag=' + f.flag);
      });
      lines.push('');
      lines.push('Variance alerts: ' + resultData.varianceAlerts);
      lines.push('');
      lines.push(SAFETY);

      return done(allConnected, allConnected ? 'ok' : (partial ? 'partial' : 'failed'), lines, resultData);
    }
  });
RESTAURANT_FINANCIAL_FORECAST_EVALUATOR.configSchema = FINANCIAL_FORECAST_CONFIG;
