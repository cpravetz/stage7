import { Tool } from '../../../types';
import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory';
import { restaurantResultSchema, RESTAURANT_SAFETY_BOUNDARY, RESTAURANT_PRESENT_SCHEMA } from './restaurant-contract';

const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';
  const SAFETY = ${JSON.stringify(RESTAURANT_SAFETY_BOUNDARY)};

  function fail(status, message, title) {
    console.log(JSON.stringify({
      success: false,
      status: status,
      error: message,
      data: null,
      present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }],
    }));
  }

  const itemIds = Array.isArray(input.itemIds) ? input.itemIds : [];
  const popularity = input.popularity || {};
  const profitability = input.profitability || {};

  if (!itemIds.length && !input.items) {
    fail('not-connected', 'Not connected: no menu items were supplied. Provide itemIds and popularity/profitability mappings, or an items array.', 'Input required');
    return;
  }

  const items = Array.isArray(input.items) ? input.items : itemIds.map((id) => ({ id, revenue: Number(popularity[id]) || 0, cost: Number(profitability[id]) || 0 }));
  const popMap = input.popularity || {};
  const profMap = input.profitability || {};
  const analyzed = items.map((item) => {
    const id = typeof item === 'string' ? item : (item.id || '');
    const pop = Number(popMap[id] !== undefined ? popMap[id] : (typeof item === 'object' ? (item.popularity || item.revenueScore) : undefined)) || 50;
    const prof = Number(profMap[id] !== undefined ? profMap[id] : (typeof item === 'object' ? (item.profitability || item.profitMargin) : undefined)) || 0.3;
    const revenue = typeof item === 'object' ? Number(item.revenue || 0) : 0;
    const cost = typeof item === 'object' ? Number(item.cost || 0) : 0;
    const foodCostPct = revenue > 0 ? Math.round(cost / revenue * 10000) / 100 : 0;
    const margin = revenue > 0 ? Math.round((revenue - cost) / revenue * 10000) / 100 : 0;
    const quadrant = pop > 50 && prof > 0.3 ? 'star' : pop > 50 ? 'puzzle' : prof > 0.3 ? 'plowhorse' : 'dog';
    return { id, popularity: pop, profitability: prof, revenue, cost, foodCostPct, margin, quadrant, score: Math.round((pop * 0.4 + prof * 0.6) * 100) / 100 };
  });
  const stars = analyzed.filter(i => i.quadrant === 'star').length;
  const puzzles = analyzed.filter(i => i.quadrant === 'puzzle').length;
  const plowhorses = analyzed.filter(i => i.quadrant === 'plowhorse').length;
  const dogs = analyzed.filter(i => i.quadrant === 'dog').length;
  const summary = { total: analyzed.length, stars, puzzles, plowhorses, dogs };
  const totalRevenue = Math.round(analyzed.reduce((s, i) => s + i.revenue, 0) * 100) / 100;
  const totalCost = Math.round(analyzed.reduce((s, i) => s + i.cost, 0) * 100) / 100;
  const overallMargin = totalRevenue > 0 ? Math.round((totalRevenue - totalCost) / totalRevenue * 10000) / 100 : 0;
  const lowPerformers = analyzed.filter(i => i.score < 30).map(i => i.id);
  const resultData = { items: analyzed, summary, financials: { totalRevenue, totalCost, overallMargin }, lowPerformers };
  const menuSummary = analyzed.reduce((acc, i) => {
    acc.stars += i.quadrant === 'star' ? 1 : 0;
    acc.puzzles += i.quadrant === 'puzzle' ? 1 : 0;
    acc.plowhorses += i.quadrant === 'plowhorse' ? 1 : 0;
    acc.dogs += i.quadrant === 'dog' ? 1 : 0;
    return acc;
  }, { stars: 0, puzzles: 0, plowhorses: 0, dogs: 0 });

  // ---- Report ------------------------------------------------------------------
  const lines = [];
  lines.push('Menu engineering analysis (local computation from supplied inputs).');
  lines.push('');
  lines.push('BCG-style quadrant summary:');
  lines.push('  Stars: ' + stars + '  Puzzles: ' + puzzles + '  Plow horses: ' + plowhorses + '  Dogs: ' + dogs);
  lines.push('  Total items: ' + analyzed.length + ', Overall margin: ' + overallMargin + '%');
  lines.push('');
  if (analyzed.length > 0) {
    lines.push('Per-item breakdown:');
    analyzed.forEach(function (a) {
      lines.push('  ' + a.id + ': popularity=' + a.popularity + ', profitability=' + (a.profitability * 100) + '%, foodCost=' + a.foodCostPct + '%, margin=' + a.margin + '%, quadrant=' + a.quadrant + ', score=' + a.score);
    });
    if (lowPerformers.length > 0) {
      lines.push('');
      lines.push('Low-scoring items (score < 30, candidates for promotion or removal): ' + lowPerformers.join(', '));
    }
  } else {
    lines.push('No items to analyze.');
  }
  lines.push('');
  lines.push(SAFETY);

  console.log(JSON.stringify({
    success: true,
    status: 'local',
    data: resultData,
    present: [{ id: 'menu-engineering-report', title: 'Menu Engineering & Cost Strategy', kind: 'text', body: lines.join(NL) }],
  }));
})()`;

const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_CONFIG = createSchemaRecord({
  confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before applying menu changes', default: false }),
  defaultTargetMargin: SchemaProps.number({ description: 'Default target margin for pricing', default: 0.7 }),
  lowMenuHighlightThreshold: SchemaProps.number({ description: 'Score threshold below which items are flagged', default: 30 }),
});

const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_INPUT = createSchemaRecord({
  itemIds: SchemaProps.stringArray({ description: 'Menu item identifiers' }),
  popularity: SchemaProps.object({}, { description: 'Popularity scores by item id (0-100)' }),
  profitability: SchemaProps.object({}, { description: 'Profitability ratios by item id (0-1)' }),
  ingredientCosts: SchemaProps.object({}, { description: 'Ingredient costs by name' }),
  sellingPrice: SchemaProps.number({ description: 'Current selling price' }),
  targetFoodCostPct: SchemaProps.number({ description: 'Target food cost percentage', default: 30 }),
  targetMargin: SchemaProps.number({ description: 'Target profit margin (0-1)', default: 0.7 }),
  competitorPrices: SchemaProps.object({}, { description: 'Competitor prices by item id' }),
  items: SchemaProps.objectArray(SchemaProps.object({ id: SchemaProps.text({ description: 'Item identifier' }) }), { description: 'Menu items with id and revenue' }),
  categories: SchemaProps.object({}, { description: 'Category assignments by item id' }),
  quantities: SchemaProps.object({}, { description: 'Ingredient quantities by name' }),
});

export const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST = createCodeSkill({
  id: 'restaurant-menu-engineering-cost-strategist',
  name: 'Restaurant Menu Engineering & Cost Strategist',
  description: 'Perform menu engineering analysis (BCG-style quadrant classification), food cost calculation, pricing optimization, and category mix analysis with deterministic cost-based computations.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_SOURCE, configSchema: RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_CONFIG },
  inputSchema: RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_INPUT,
  outputSchema: restaurantResultSchema('Menu items with quadrant classification, food cost, margin, score, and low-performing recommendations'),
  triggers: [
    {
      kind: 'user',
      phrase_examples: [
        'Analyze menu profitability',
        'Check food costs',
        'Optimize menu pricing',
        'Classify menu items',
      ],
    },
  ],
  isSkill: true,
  tier: 'advise',
  domainKnowledge: 'Restaurant menu engineering, food cost analysis, pricing optimization, and category mix analysis',
  confirmBeforeSend: false,
});
