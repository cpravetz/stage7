import { Tool } from "../../../types";
import { createCodeSkill, SchemaProps } from "../code-skill-factory";

const RESTAURANT_SHIFT_PREP_LIST_COPILOT_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const baseDir = process.env.RESTAURANT_HOME || '/tmp/restaurant';
  const operation = input.operation || 'shift-prep';
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(baseDir, 'shift-prep');
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'prep-list.json');
  let prepList = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  if (operation === 'shift-prep') {
    const date = input.date || new Date().toISOString().split('T')[0];
    const forecastCovers = Number(input.forecastCovers || 0);
    const prepRatios = input.prepRatios || {};
    const currentStock = input.currentStock || {};
    const shift = input.shift || 'all';
    const items = Object.keys(prepRatios).map(name => {
      const ratio = Number(prepRatios[name] || 0);
      const needed = Math.ceil(forecastCovers * ratio);
      const onHand = Number(currentStock[name] || 0);
      return { name, forecastCovers, prepRatio: ratio, quantityNeeded: needed, quantityOnHand: onHand, shortage: Math.max(0, needed - onHand), orderQty: Math.max(0, needed - onHand) };
    });
    const totalNeeded = items.reduce((s, i) => s + i.quantityNeeded, 0);
    const totalOnHand = items.reduce((s, i) => s + i.quantityOnHand, 0);
    const totalShortage = items.reduce((s, i) => s + i.shortage, 0);
    const prep = { id: 'prep_' + date + '_' + shift, date, shift, forecastCovers, items, totals: { items: items.length, quantityNeeded: totalNeeded, quantityOnHand: totalOnHand, shortage: totalShortage } };
    prepList.push(prep);
    fs.writeFileSync(storePath, JSON.stringify(prepList, null, 2));
    console.log(JSON.stringify({ success: true, operation, data: prep }));
  } else if (operation === 'shift-allocation') {
    const date = input.date || new Date().toISOString().split('T')[0];
    const openCovers = Number(input.openCovers || 0);
    const serviceDuration = Number(input.serviceDuration || 90);
    const staffPerCover = Number(input.staffPerCover || 0.2);
    const availableStaff = Number(input.availableStaff || 0);
    const requiredStaff = Math.ceil(openCovers * staffPerCover);
    const coverageRatio = availableStaff > 0 ? Math.min(1, availableStaff / Math.max(1, requiredStaff)) : 0;
    const gap = Math.max(0, requiredStaff - availableStaff);
    console.log(JSON.stringify({ success: true, operation, data: { date, openCovers, requiredStaff, availableStaff, coverageRatio: Math.round(coverageRatio * 10000) / 100, gap } }));
  } else {
    console.log(JSON.stringify({ success: false, operation, error: 'Unknown operation: ' + operation }));
  }
})();`;

const RESTAURANT_SHIFT_PREP_LIST_COPILOT_CONFIG = {
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require confirmation before submitting prep orders",
      "default": false
    },
    "defaultShift": {
      "type": "string",
      "description": "Default shift for prep generation",
      "default": "all"
    },
    "autoReorderThreshold": {
      "type": "number",
      "description": "Auto-reorder when shortage exceeds this value",
      "default": 0
    }
  }
};

const RESTAURANT_SHIFT_PREP_LIST_COPILOT_INPUT = {
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "shift-prep",
        "shift-allocation"
      ],
      "description": "Shift prep operation"
    },
    "date": {
      "type": "string",
      "description": "Date (YYYY-MM-DD)"
    },
    "forecastCovers": {
      "type": "number",
      "description": "Forecasted number of covers"
    },
    "prepRatios": {
      "type": "object",
      "description": "Prep quantity ratio per cover by item name"
    },
    "currentStock": {
      "type": "object",
      "description": "Current stock levels by item name"
    },
    "shift": {
      "type": "string",
      "description": "Shift name (breakfast, lunch, dinner, all)"
    },
    "openCovers": {
      "type": "number",
      "description": "Expected open covers for allocation"
    },
    "serviceDuration": {
      "type": "number",
      "description": "Service duration in minutes",
      "default": 90
    },
    "staffPerCover": {
      "type": "number",
      "description": "Staff required per cover",
      "default": 0.2
    },
    "availableStaff": {
      "type": "number",
      "description": "Available staff count"
    }
  }
};

const RESTAURANT_SHIFT_PREP_LIST_COPILOT_OUTPUT = {
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the operation succeeded"
    },
    "operation": {
      "type": "string",
      "description": "The operation performed"
    },
    "data": {
      "type": "object",
      "description": "Prep or allocation result data"
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

export const RESTAURANT_SHIFT_PREP_LIST_COPILOT = createCodeSkill({
  id: "restaurant-shift-prep-list-copilot",
  name: "Restaurant Shift Prep List Copilot",
  description: "Generate shift prep lists from forecasted covers and prep ratios, compute shortages, and allocate staff based on cover volume and service duration with deterministic calculations.",
  manifest: { language: "javascript", entrypoint: "index.js", sourceCode: RESTAURANT_SHIFT_PREP_LIST_COPILOT_SOURCE, configSchema: RESTAURANT_SHIFT_PREP_LIST_COPILOT_CONFIG },
  inputSchema: RESTAURANT_SHIFT_PREP_LIST_COPILOT_INPUT,
  outputSchema: RESTAURANT_SHIFT_PREP_LIST_COPILOT_OUTPUT,
  triggers: [
    {
      "kind": "user",
      "phrase_examples": [
        "Generate prep list",
        "Check shift inventory",
        "Plan prep for tomorrow",
        "Allocate staff"
      ]
    },
    {
      "kind": "schedule",
      "cadence": "Daily prep generation"
    },
    {
      "kind": "event",
      "on": "Shift schedule change"
    }
  ],
});
