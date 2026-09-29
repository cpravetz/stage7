import { Tool } from '../types';
import { ToolExecutor } from '../services/ToolExecutor';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import { restaurantSkills } from '../data/skills/restaurant';
import { RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST } from '../data/skills/restaurant/restaurant-menu-engineering-cost-strategist';
import { RESTAURANT_SHIFT_PREP_LIST_COPILOT } from '../data/skills/restaurant/restaurant-shift-prep-list-copilot';
import { RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER } from '../data/skills/restaurant/restaurant-reservations-guest-profile-manager';
import { RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER } from '../data/skills/restaurant/restaurant-supply-chain-inventory-reorder-manager';
import { RESTAURANT_FINANCIAL_FORECAST_EVALUATOR } from '../data/skills/restaurant/restaurant-financial-forecast-evaluator';

describe('restaurantSkills', () => {
  it('exports exactly five skills', () => {
    expect(restaurantSkills).toHaveLength(5);
  });

  it('exports unique skill ids', () => {
    const ids = restaurantSkills.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has no legacy isSkill:false external tools', () => {
    const legacy = restaurantSkills.filter((s) => s.isSkill === false);
    expect(legacy).toHaveLength(0);
  });

  it('all exported skills are canonical skills (isSkill not false)', () => {
    const ho = restaurantSkills.filter((s) => s.isSkill !== false);
    expect(ho).toHaveLength(5);
    const hoIds = ho.map((s) => s.id).sort();
    expect(hoIds).toEqual([
      'restaurant-menu-engineering-cost-strategist',
      'restaurant-reservations-guest-profile-manager',
      'restaurant-shift-prep-list-copilot',
      'restaurant-supply-chain-inventory-reorder-manager',
      'restaurant-financial-forecast-evaluator',
    ].sort());
  });
});

interface PresentBlock {
  id: string;
  title?: string;
  body: string;
  kind?: string;
}

interface SkillResult {
  success?: boolean;
  status?: string;
  error?: string | null;
  data?: unknown;
  present?: PresentBlock[];
}

const CANONICAL_SKILLS: Tool[] = [
  RESTAURANT_MENU_ENGINEERING_COST_STRATEGIST,
  RESTAURANT_SHIFT_PREP_LIST_COPILOT,
  RESTAURANT_RESERVATIONS_GUEST_PROFILE_MANAGER,
  RESTAURANT_SUPPLY_CHAIN_INVENTORY_REORDER_MANAGER,
  RESTAURANT_FINANCIAL_FORECAST_EVALUATOR,
];

const CANONICAL_SKILLS_NO_DELEGATING: Tool[] = CANONICAL_SKILLS.filter(
  (t) => t.id !== 'restaurant-financial-forecast-evaluator',
);
async function run(
  tool: Tool,
  input: Record<string, unknown>,
  registryTools: Tool[] = [],
  env: Record<string, string | undefined> = {},
): Promise<{ result: SkillResult; exec: { status: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } }> {
  const registry = new Map<string, Tool>();
  for (const t of registryTools) registry.set(t.id, t);
  registry.set(tool.id, tool);

  const origEnv: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    origEnv[key] = process.env[key];
    if (value !== undefined) {
      process.env[key] = value;
    } else {
      delete process.env[key];
    }
  }
  try {
    const executor = new ToolExecutor(registry);
    const exec = await executor.execute(tool, input);
    const output = exec.output as { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } | undefined;
    let result: SkillResult = {};
    if (typeof output?.output === 'string') {
      try {
        result = JSON.parse(output.output) as SkillResult;
      } catch {
        throw new Error(`Skill ${tool.id} did not emit parseable JSON. Raw output:\n${String(output?.output).slice(0, 500)}`);
      }
    }
    return { result, exec: { status: exec.status, outputSchemaIssues: output?.outputSchemaIssues } };
  } finally {
    for (const [key, value] of Object.entries(origEnv)) {
      if (value !== undefined) {
        process.env[key] = value;
      } else {
        delete process.env[key];
      }
    }
  }
}
function seedInputFor(toolId: string): Record<string, unknown> {
  switch (toolId) {
    case 'restaurant-menu-engineering-cost-strategist':
      return {
        itemIds: ['burger', 'fries', 'salad', 'pasta'],
        popularity: { burger: 85, fries: 70, salad: 45, pasta: 60 },
        profitability: { burger: 0.75, fries: 0.65, salad: 0.4, pasta: 0.55 },
      };
    case 'restaurant-shift-prep-list-copilot':
      return {
        date: '2026-09-28',
        forecastCovers: 120,
        prepRatios: { onions: 0.5, peppers: 0.3, dressing: 1.2 },
        currentStock: { onions: 40, peppers: 20, dressing: 100 },
        shift: 'dinner',
      };
    case 'restaurant-reservations-guest-profile-manager':
      return {
        guestId: 'g-001',
        name: 'Jane Doe',
        phone: '555-1234',
        email: 'jane@example.com',
        preferences: { seating: 'window', dietary: 'vegetarian' },
        dryRun: true,
      };
    case 'restaurant-supply-chain-inventory-reorder-manager':
      return {
        items: [{ name: 'flour', quantity: 5 }, { name: 'tomatoes', quantity: 30 }, { name: 'cheese', quantity: 2 }],
        reorderPoints: { flour: 10, tomatoes: 50, cheese: 5 },
        safetyStock: { flour: 5, tomatoes: 10, cheese: 3 },
        leadTimes: { flour: 2, tomatoes: 1, cheese: 3 },
        unitCosts: { flour: 0.5, tomatoes: 0.3, cheese: 4.0 },
        dryRun: true,
      };
    case 'restaurant-financial-forecast-evaluator':
      return {
        revenue: 10000,
        cogs: 3000,
        laborCost: 4000,
        netProfit: 3000,
        forecastHorizon: 6,
        varianceThreshold: 0.1,
      };
    default:
      return { dryRun: true };
  }
}

function failureInputFor(toolId: string): Record<string, unknown> {
  switch (toolId) {
    case 'restaurant-menu-engineering-cost-strategist':
      return { dryRun: true };
    case 'restaurant-shift-prep-list-copilot':
      return { dryRun: true };
    case 'restaurant-reservations-guest-profile-manager':
      return { dryRun: true, confirmBeforeSend: true };
    case 'restaurant-supply-chain-inventory-reorder-manager':
      return { dryRun: true, confirmBeforeSend: true };
    case 'restaurant-financial-forecast-evaluator':
      return { dryRun: true };
    default:
      return {};
  }
}

function stubTool(id: string, source: string): Tool {
  return {
    id,
    name: id,
    description: 'stub',
    type: 'code',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: source,
    },
    isSkill: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function successStub(id: string, data: Record<string, unknown>): Tool {
  return stubTool(id, `console.log(JSON.stringify({ success: true, data: ${JSON.stringify(data)} }));`);
}

function failingStub(id: string, message: string): Tool {
  return stubTool(id, `console.log(JSON.stringify({ success: false, error: ${JSON.stringify(message)} }));`);
}

function assertPresentClean(result: SkillResult): void {
  expect(result.present).toBeDefined();
  expect(Array.isArray(result.present)).toBe(true);
  const blocks = result.present as PresentBlock[];
  expect(blocks.length).toBeGreaterThan(0);
  for (const block of blocks) {
    expect(block.id).toBeTruthy();
    expect(block.body).toBeTruthy();
    expect(block.body.trim()).not.toBe('');
    expect(block.body.toLowerCase()).not.toMatch(/lorem ipsum|\bTODO\b|\bTBD\b|placeholder/);
    if (block.title) {
      expect(block.body.trim().toLowerCase().startsWith(block.title.trim().toLowerCase())).toBe(false);
    }
  }
}

describe('Restaurant Operations skills emit presentation blocks', () => {
  it.each(CANONICAL_SKILLS_NO_DELEGATING.map((t) => [t.id, t] as const))(
    '%s emits a present block on its success path',
    async (_id, tool) => {
      const env = tool.id === 'restaurant-reservations-guest-profile-manager'
        ? { RESTAURANT_RESERVATION_ENDPOINT: 'http://test-endpoint.example.com' }
        : tool.id === 'restaurant-supply-chain-inventory-reorder-manager'
        ? { RESTAURANT_SUPPLY_ENDPOINT: 'http://test-supply.example.com' }
        : {};
      const { result } = await run(tool, seedInputFor(tool.id), [], env);
      expect(result.success).toBe(true);
      assertPresentClean(result);
    },
  );

  it.each(CANONICAL_SKILLS.map((t) => [t.id, t] as const))(
    '%s emits a present block on its validation-failure path',
    async (_id, tool) => {
      const { result } = await run(tool, failureInputFor(tool.id));
      expect(result.success).toBe(false);
      assertPresentClean(result);
    },
  );

  it.each(CANONICAL_SKILLS_NO_DELEGATING.map((t) => [t.id, t] as const))(
    '%s output satisfies its own declared outputSchema',
    async (_id, tool) => {
      for (const input of [failureInputFor(tool.id), seedInputFor(tool.id)]) {
        const { result, exec } = await run(tool, input);
        const issues = validateAgainstOutputSchema(result, tool.outputSchema);
        expect(issues).toEqual([]);
        expect(exec.outputSchemaIssues || []).toEqual([]);
      }
    },
  );

  it('every canonical skill declares present as required in its outputSchema', () => {
    for (const tool of CANONICAL_SKILLS) {
      const schema = tool.outputSchema as { required?: string[]; properties?: Record<string, unknown> } | undefined;
      expect(schema).toBeDefined();
      expect(schema?.required).toContain('present');
      const presentSchema = schema?.properties?.present as { items?: { required?: string[] } } | undefined;
      expect(presentSchema).toBeDefined();
      expect(presentSchema?.items?.required).toEqual(['id', 'body']);
    }
  });

  it('embedded skill sources survive template-literal escaping', () => {
    for (const tool of CANONICAL_SKILLS) {
      const source = (tool.manifest as Record<string, unknown> | undefined)?.sourceCode as string | undefined;
      expect(source).toBeTruthy();
      expect(() => new Function(source!)).not.toThrow();
    }
  });
});

describe('Restaurant financial forecast delegation', () => {
  it('reports failure when lower-order tools are unavailable', async () => {
    const { result } = await run(RESTAURANT_FINANCIAL_FORECAST_EVALUATOR, {
      revenue: 10000,
      cogs: 3000,
      laborCost: 4000,
      forecastHorizon: 6,
    });
    expect(result.success).toBe(false);
    assertPresentClean(result);
    const body = result.present!.map((b) => b.body).join('\n');
    expect(body).toMatch(/all lower-order tools failed/i);
  });

  it('succeeds when all lower-order tools return success', async () => {
    const stubs = [
      successStub('restaurant-menu-engineering-cost-strategist', { summary: { stars: 8, puzzles: 4, plowhorses: 3, dogs: 2 } }),
      successStub('restaurant-supply-chain-inventory-reorder-manager', { totalCost: 1500, itemsFlagged: 3, summary: { items: 5, totalOrderQty: 50, totalCost: 1500 } }),
      successStub('restaurant-shift-prep-list-copilot', { totals: { shortage: 12 } }),
    ];
    const { result } = await run(RESTAURANT_FINANCIAL_FORECAST_EVALUATOR, {
      revenue: 10000,
      cogs: 3000,
      laborCost: 4000,
      netProfit: 3000,
      forecastHorizon: 6,
      varianceThreshold: 0.1,
    }, stubs);
    expect(result.success).toBe(true);
    expect(result.status).toBe('ok');
    const body = result.present!.map((b) => b.body).join('\n');
    expect(body).toContain('succeeded');
  });

  it('propagates lower-order tool failure and does not report success', async () => {
    const stubs = [
      failingStub('restaurant-menu-engineering-cost-strategist', 'Lower-order tool not configured'),
      successStub('restaurant-supply-chain-inventory-reorder-manager', { totalCost: 0, itemsFlagged: 0 }),
      successStub('restaurant-shift-prep-list-copilot', { totals: { shortage: 0 } }),
    ];
    const { result } = await run(RESTAURANT_FINANCIAL_FORECAST_EVALUATOR, {
      revenue: 10000,
      cogs: 3000,
      laborCost: 4000,
      netProfit: 3000,
      forecastHorizon: 6,
      varianceThreshold: 0.1,
    }, stubs);
    expect(result.success).toBe(false);
    expect(result.status).toBe('partial');
    assertPresentClean(result);
    const body = result.present!.map((b) => b.body).join('\n');
    expect(body).toContain('menu_engineering: failed');
    expect(body).toContain('supply_chain: succeeded');
    expect(body).toContain('shift_prep: succeeded');
  });
});

describe('Restaurant skills produce deterministic forecast output', () => {
  it('financial forecast variance is deterministic (same input => same output)', async () => {
    const stubs = [
      successStub('restaurant-menu-engineering-cost-strategist', { summary: { stars: 5, puzzles: 2, plowhorses: 1, dogs: 1 } }),
      successStub('restaurant-supply-chain-inventory-reorder-manager', { totalCost: 500, itemsFlagged: 2 }),
      successStub('restaurant-shift-prep-list-copilot', { totals: { shortage: 5 } }),
    ];
    const input = {
      revenue: 10000,
      cogs: 3000,
      laborCost: 4000,
      netProfit: 3000,
      forecastHorizon: 6,
    };
    const { result: r1 } = await run(RESTAURANT_FINANCIAL_FORECAST_EVALUATOR, input, stubs);
    const { result: r2 } = await run(RESTAURANT_FINANCIAL_FORECAST_EVALUATOR, input, stubs);
    const f1 = (r1.data as any)?.forecast;
    const f2 = (r2.data as any)?.forecast;
    expect(f1).toEqual(f2);
  });
});
