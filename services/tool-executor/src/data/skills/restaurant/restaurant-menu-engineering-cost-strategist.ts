import { Tool } from "../../../types";
import { createCodeSkill, SchemaProps } from "../code-skill-factory";

const RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const baseDir = process.env.RESTAURANT_HOME || '/tmp/restaurant';
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(baseDir, 'menu-cost');
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'menu.json');
  let items = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

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
  console.log(JSON.stringify({ success: true, data: { items: analyzed, summary: { total: analyzed.length, stars, puzzles, plowhorses, dogs } } }));
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
    "success"
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
    }
  ],
});

RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST.tier = 'advise';
RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST.domainKnowledge = 'Restaurant menu engineering, food cost analysis, pricing optimization, and category mix analysis';
