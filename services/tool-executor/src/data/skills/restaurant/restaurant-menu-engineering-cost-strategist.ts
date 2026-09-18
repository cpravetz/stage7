import { Tool } from "../../../types";
import { createCodeSkill, SchemaProps } from "../code-skill-factory";

const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const baseDir = process.env.RESTAURANT_HOME || '/tmp/restaurant';
  const operation = input.operation || 'menu-engineering';
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(baseDir, 'menu-cost');
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'menu.json');
  let items = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  if (operation === 'menu-engineering') {
    const itemIds = Array.isArray(input.itemIds) ? input.itemIds : [];
    const popularity = input.popularity || {};
    const profitability = input.profitability || {};
    const analyzed = itemIds.map(id => {
      const pop = Number(popularity[id] || 50);
      const prof = Number(profitability[id] || 0.3);
      const quadrant = pop > 50 && prof > 0.3 ? 'star' : pop > 50 ? 'puzzle' : prof > 0.3 ? 'plowhorse' : 'dog';
      return { id, popularity: pop, profitability: prof, quadrant, score: Math.round((pop * 0.4 + prof * 0.6) * 100) / 100 };
    });
    const stars = analyzed.filter(i => i.quadrant === 'star').length;
    const puzzles = analyzed.filter(i => i.quadrant === 'puzzle').length;
    const plowhorses = analyzed.filter(i => i.quadrant === 'plowhorse').length;
    const dogs = analyzed.filter(i => i.quadrant === 'dog').length;
    console.log(JSON.stringify({ success: true, operation, data: { items: analyzed, summary: { total: analyzed.length, stars, puzzles, plowhorses, dogs } } }));
  } else if (operation === 'cost-analysis') {
    const itemId = input.itemId || '';
    const ingredientCosts = input.ingredientCosts || {};
    const sellingPrice = Number(input.sellingPrice || 0);
    let totalCost = 0;
    for (const name of Object.keys(ingredientCosts)) {
      totalCost += Number(ingredientCosts[name]) * (input.quantities && input.quantities[name] !== undefined ? input.quantities[name] : 1);
    }
    const foodCostPct = sellingPrice > 0 ? Math.round((totalCost / sellingPrice) * 10000) / 100 : 0;
    const targetPct = Number(input.targetFoodCostPct || 30);
    const idealPrice = totalCost > 0 ? Math.round((totalCost / (targetPct / 100)) * 100) / 100 : 0;
    console.log(JSON.stringify({ success: true, operation, data: { itemId, totalCost: Math.round(totalCost * 100) / 100, foodCostPct, targetFoodCostPct: targetPct, idealPrice } }));
  } else if (operation === 'pricing-optimizer') {
    const itemIds = Array.isArray(input.itemIds) ? input.itemIds : [];
    const costs = input.costs || {};
    const targetMargin = Number(input.targetMargin || 0.7);
    const competitorPrices = input.competitorPrices || {};
    const optimized = itemIds.map(id => {
      const cost = Number(costs[id] || 0);
      const targetPrice = cost > 0 ? Math.round((cost / (1 - targetMargin)) * 100) / 100 : 0;
      const compPrice = Number(competitorPrices[id] || targetPrice);
      const finalPrice = Math.min(targetPrice, compPrice);
      return { id, cost, targetPrice, competitorPrice: compPrice, finalPrice, margin: cost > 0 ? Math.round((1 - cost / finalPrice) * 10000) / 100 : 0 };
    });
    console.log(JSON.stringify({ success: true, operation, data: { items: optimized, targetMargin } }));
  } else if (operation === 'menu-mix-analysis') {
    const items = Array.isArray(input.items) ? input.items : [];
    const categories = input.categories || {};
    const categoryTotals = {};
    const categoryCounts = {};
    for (const item of items) {
      const cat = categories[item.id] || 'uncategorized';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (item.revenue || 0);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
    const totalRevenue = Object.values(categoryTotals).reduce((s, v) => s + v, 0);
    const mix = Object.keys(categoryTotals).map(cat => ({
      category: cat, revenue: categoryTotals[cat], pctOfRevenue: totalRevenue > 0 ? Math.round((categoryTotals[cat] / totalRevenue) * 10000) / 100 : 0, itemCount: categoryCounts[cat],
    }));
    console.log(JSON.stringify({ success: true, operation, data: { mix, totalRevenue } }));
  } else {
    console.log(JSON.stringify({ success: false, operation, error: 'Unknown operation: ' + operation }));
  }
})();`;

const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_CONFIG = {
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require confirmation before applying menu changes",
      "default": false
    },
    "defaultTargetMargin": {
      "type": "number",
      "description": "Default target margin for pricing",
      "default": 0.7
    },
    "lowMenuHighlightThreshold": {
      "type": "number",
      "description": "Score threshold below which items are flagged",
      "default": 30
    }
  }
};

const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_INPUT = {
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "menu-engineering",
        "cost-analysis",
        "pricing-optimizer",
        "menu-mix-analysis"
      ],
      "description": "Menu cost optimization operation"
    },
    "itemIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Menu item identifiers"
    },
    "popularity": {
      "type": "object",
      "description": "Popularity scores by item id (0-100)"
    },
    "profitability": {
      "type": "object",
      "description": "Profitability ratios by item id (0-1)"
    },
    "ingredientCosts": {
      "type": "object",
      "description": "Ingredient costs by name"
    },
    "sellingPrice": {
      "type": "number",
      "description": "Current selling price"
    },
    "targetFoodCostPct": {
      "type": "number",
      "description": "Target food cost percentage",
      "default": 30
    },
    "targetMargin": {
      "type": "number",
      "description": "Target profit margin (0-1)",
      "default": 0.7
    },
    "competitorPrices": {
      "type": "object",
      "description": "Competitor prices by item id"
    },
    "items": {
      "type": "array",
      "items": {
        "type": "object"
      },
      "description": "Menu items with id and revenue"
    },
    "categories": {
      "type": "object",
      "description": "Category assignments by item id"
    },
    "quantities": {
      "type": "object",
      "description": "Ingredient quantities by name"
    }
  }
};

const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_OUTPUT = {
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the analysis succeeded"
    },
    "operation": {
      "type": "string",
      "description": "The operation performed"
    },
    "data": {
      "type": "object",
      "description": "Analysis result data"
    },
    "error": {
      "type": "string",
      "description": "Error message if failed"
    }
  },
  "required": [
    "success",
    "operation"
  ]
};

export const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST = createCodeSkill({
  id: "restaurant-menu-engineering-cost-strategist",
  name: "Restaurant Menu Engineering & Cost Strategist",
  description: "Perform menu engineering analysis (BCG-style quadrant classification), food cost calculation, pricing optimization, and category mix analysis with deterministic cost-based computations.",
  manifest: { language: "javascript", entrypoint: "index.js", sourceCode: RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_SOURCE, configSchema: RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_CONFIG },
  inputSchema: RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_INPUT,
  outputSchema: RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_OUTPUT,
  triggers: [
    {
      "kind": "user",
      "phrase_examples": [
        "Analyze menu profitability",
        "Check food costs",
        "Optimize menu pricing",
        "Classify menu items"
      ]
    },
    {
      "kind": "schedule",
      "cadence": "Weekly menu review"
    },
    {
      "kind": "event",
      "on": "Menu item added or updated"
    }
  ],
});
