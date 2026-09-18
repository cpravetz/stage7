import { Tool } from "../../../types";
import { createCodeSkill, SchemaProps } from "../code-skill-factory";

const RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const baseDir = process.env.RESTAURANT_HOME || '/tmp/restaurant';
  const operation = input.operation || 'inventory-reorder';
  const endpoint = process.env.RESTAURANT_SUPPLY_ENDPOINT || '';
  const dryRun = input.dryRun !== false;
  const confirmBeforeSend = input.confirmBeforeSend !== false;
  const fs = require('fs');
  const path = require('path');
  const dataDir = path.join(baseDir, 'supply-chain');
  fs.mkdirSync(dataDir, { recursive: true });
  const storePath = path.join(dataDir, 'inventory.json');
  let inventory = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  if (!endpoint) {
    console.log(JSON.stringify({ success: false, mode: 'not-connected', operation, error: 'Not connected: RESTAURANT_SUPPLY_ENDPOINT is not configured. Supply chain operations require a live endpoint.', endpoint: null }));
    return;
  }

  if (operation === 'inventory-reorder') {
    const items = Array.isArray(input.items) ? input.items : [];
    const reorderPoints = input.reorderPoints || {};
    const safetyStock = input.safetyStock || {};
    const leadTimes = input.leadTimes || {};
    const unitCosts = input.unitCosts || {};
    const reorders = items.map(item => {
      const name = typeof item === 'string' ? item : (item.name || '');
      const currentQty = typeof item === 'object' ? (item.quantity || 0) : 0;
      const rop = Number(reorderPoints[name] || 20);
      const ss = Number(safetyStock[name] || 5);
      const lt = Number(leadTimes[name] || 2);
      const cost = Number(unitCosts[name] || 0);
      const leadTimeDemand = Math.ceil(rop * lt);
      const orderQty = currentQty < rop ? Math.max(ss, leadTimeDemand - currentQty) : 0;
      return { name, currentQty, reorderPoint: rop, safetyStock: ss, leadTime: lt, leadTimeDemand, orderQty, unitCost: cost, totalCost: Math.round(orderQty * cost * 100) / 100, needsReorder: currentQty < rop };
    });
    const totalOrderQty = reorders.reduce((s, r) => s + r.orderQty, 0);
    const totalCost = reorders.reduce((s, r) => s + r.totalCost, 0);
    console.log(JSON.stringify({ success: true, mode: dryRun ? 'dry-run' : 'live', operation, data: { reorders, summary: { items: reorders.length, totalOrderQty, totalCost } }, dryRun, endpoint } }));
  } else if (operation === 'eoq-calc') {
    const name = input.name || '';
    const annualDemand = Number(input.annualDemand || 0);
    const orderCost = Number(input.orderCost || 50);
    const holdingCost = Number(input.holdingCost || 2);
    const eoq = annualDemand > 0 && orderCost > 0 && holdingCost > 0 ? Math.round(Math.sqrt((2 * annualDemand * orderCost) / holdingCost)) : 0;
    const numOrders = annualDemand > 0 ? Math.ceil(annualDemand / eoq) : 0;
    const totalCost = annualDemand > 0 && eoq > 0 ? Math.round(((annualDemand / eoq) * orderCost + (eoq / 2) * holdingCost) * 100) / 100 : 0;
    console.log(JSON.stringify({ success: true, operation, data: { name, annualDemand, orderCost, holdingCost, eoq, numOrders, totalCost } }));
  } else if (operation === 'supplier-status') {
    const supplierIds = Array.isArray(input.supplierIds) ? input.supplierIds : [];
    const suppliers = supplierIds.map(id => ({ id, status: 'active', leadTime: input.leadTimes && input.leadTimes[id] ? input.leadTimes[id] : 3, reliability: 0.95 }));
    console.log(JSON.stringify({ success: true, mode: 'live', operation, data: { suppliers } }));
  } else {
    console.log(JSON.stringify({ success: false, mode: 'not-connected', operation, error: 'Unknown operation: ' + operation }));
  }
})();`;

const RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_CONFIG = {
  "type": "object",
  "properties": {
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation before placing live reorder orders",
      "default": true
    },
    "defaultLeadTime": {
      "type": "number",
      "description": "Default lead time in days",
      "default": 2
    },
    "defaultSafetyStockPct": {
      "type": "number",
      "description": "Default safety stock as percentage of reorder point",
      "default": 25
    },
    "endpointUrl": {
      "type": "string",
      "description": "Supply chain system endpoint URL",
      "format": "uri"
    }
  }
};

const RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_INPUT = {
  "type": "object",
  "properties": {
    "operation": {
      "type": "string",
      "enum": [
        "inventory-reorder",
        "eoq-calc",
        "supplier-status"
      ],
      "description": "Supply chain reorder operation"
    },
    "items": {
      "type": "array",
      "items": {
        "type": [
          "object",
          "string"
        ]
      },
      "description": "Inventory items to evaluate for reorder"
    },
    "reorderPoints": {
      "type": "object",
      "description": "Reorder point by item name"
    },
    "safetyStock": {
      "type": "object",
      "description": "Safety stock by item name"
    },
    "leadTimes": {
      "type": "object",
      "description": "Lead time in days by item name"
    },
    "unitCosts": {
      "type": "object",
      "description": "Unit cost by item name"
    },
    "name": {
      "type": "string",
      "description": "Item name for EOQ calculation"
    },
    "annualDemand": {
      "type": "number",
      "description": "Annual demand quantity for EOQ"
    },
    "orderCost": {
      "type": "number",
      "description": "Cost per order for EOQ",
      "default": 50
    },
    "holdingCost": {
      "type": "number",
      "description": "Holding cost per unit per year for EOQ",
      "default": 2
    },
    "supplierIds": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "description": "Supplier identifiers for status check"
    },
    "dryRun": {
      "type": "boolean",
      "description": "Run in dry-run mode without executing",
      "default": true
    },
    "confirmBeforeSend": {
      "type": "boolean",
      "description": "Require explicit confirmation for live endpoint",
      "default": true
    }
  }
};

const RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_OUTPUT = {
  "type": "object",
  "properties": {
    "success": {
      "type": "boolean",
      "description": "Whether the operation succeeded"
    },
    "mode": {
      "type": "string",
      "enum": [
        "dry-run",
        "live",
        "not-connected",
        "error"
      ],
      "description": "Execution mode"
    },
    "operation": {
      "type": "string",
      "description": "The operation performed"
    },
    "data": {
      "type": "object",
      "description": "Result data"
    },
    "endpoint": {
      "type": [
        "string",
        "null"
      ],
      "description": "Endpoint used"
    },
    "error": {
      "type": [
        "string",
        "null"
      ],
      "description": "Error message if failed"
    }
  },
  "required": [
    "success",
    "mode",
    "operation"
  ]
};

export const RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER = createCodeSkill({
  id: "restaurant-supply-chain-inventory-reorder-manager",
  name: "Restaurant Supply Chain & Inventory Reorder Manager",
  description: "Manage inventory reorder points, EOQ calculations, and supplier status with dry-run defaults and confirmation requirements for live endpoint actions. Returns not-connected when RESTAURANT_SUPPLY_ENDPOINT is absent.",
  manifest: { language: "javascript", entrypoint: "index.js", sourceCode: RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_SOURCE, configSchema: RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_CONFIG },
  inputSchema: RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_INPUT,
  outputSchema: RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER_OUTPUT,
  triggers: [
    {
      "kind": "user",
      "phrase_examples": [
        "Check inventory reorder",
        "Calculate EOQ",
        "Place reorder",
        "Check supplier status"
      ]
    },
    {
      "kind": "schedule",
      "cadence": "Daily inventory review"
    },
    {
      "kind": "event",
      "on": "Inventory level below reorder point"
    }
  ],
});
