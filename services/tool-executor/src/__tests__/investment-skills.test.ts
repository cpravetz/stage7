import { ToolExecutor } from '../services/ToolExecutor';
import { Tool } from '../types';
import { validateAgainstOutputSchema } from '../utils/schemaValidator';
import { INVESTMENT_MARKET_DATA } from '../data/skills/investment/investment-market-data';
import { PORTFOLIO_RISK_ADVISORY } from '../data/skills/investment/portfolio-risk-advisory';
import { RESEARCH_PLANNING } from '../data/skills/investment/research-planning';
import { BILL_PAY_REBALANCING } from '../data/skills/investment/bill-pay-rebalancing';

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
  data?: Record<string, unknown> | null;
  present?: PresentBlock[];
}

const INVESTMENT_SKILLS: Tool[] = [INVESTMENT_MARKET_DATA, PORTFOLIO_RISK_ADVISORY, RESEARCH_PLANNING, BILL_PAY_REBALANCING];

const fs = require('fs');
const os = require('os');
const path = require('path');

// Every investment skill resolves its store from process.env.INVESTMENT_HOME
// (default /tmp/investment) inside the spawned child. Point the whole file at a
// unique temp dir so concurrent jest workers cannot read or clobber each other's
// state through the shared default path.
const priorInvestmentHome = process.env.INVESTMENT_HOME;
let investmentHome: string;

beforeAll(() => {
  investmentHome = fs.mkdtempSync(path.join(os.tmpdir(), 'investment-skills-home-'));
  process.env.INVESTMENT_HOME = investmentHome;
});

afterAll(() => {
  if (priorInvestmentHome === undefined) delete process.env.INVESTMENT_HOME;
  else process.env.INVESTMENT_HOME = priorInvestmentHome;
  try {
    fs.rmSync(investmentHome, { recursive: true, force: true });
  } catch {
    // best effort
  }
});

async function run(
  tool: Tool,
  input: Record<string, unknown>,
): Promise<{ result: SkillResult; output?: { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } }> {
  const registry = new Map<string, Tool>();
  registry.set(tool.id, tool);
  const executor = new ToolExecutor(registry);
  const exec = await executor.execute(tool, input);
  const output = exec.output as { output?: string; outputSchemaIssues?: ReturnType<typeof validateAgainstOutputSchema> } | undefined;

  let result: SkillResult = {};
  if (typeof output?.output === 'string') {
    try {
      result = JSON.parse(output.output) as SkillResult;
    } catch {
      throw new Error(
        `Skill ${tool.id} did not emit parseable JSON. Raw output:\n${String(output?.output).slice(0, 500)}`,
      );
    }
  }
  return { result, output };
}

function bodyOf(result: SkillResult): string {
  return ((result.present || []) as PresentBlock[]).map((b) => b.body).join('\n');
}

function assertPresentClean(result: SkillResult) {
  const blocks = result.present;
  expect(Array.isArray(blocks)).toBe(true);
  expect((blocks as PresentBlock[]).length).toBeGreaterThan(0);
  for (const block of blocks as PresentBlock[]) {
    expect(typeof block.body).toBe('string');
    expect(block.body.trim().length).toBeGreaterThan(0);
    expect(block.body).not.toMatch(/undefined|NaN|\[object Object\]/);
    expect(block.body).not.toContain('{"');
    expect(block.body).not.toMatch(/"\w+":/);
    expect(block.body).not.toMatch(/\{\{|\}\}/);
    expect(block.body.toLowerCase()).not.toMatch(/lorem ipsum|\bTODO\b|\bTBD\b|placeholder/);
    if (block.title) {
      expect(block.body.trim().toLowerCase().startsWith(block.title.trim().toLowerCase())).toBe(false);
    }
  }
}

describe('Investment skills survive template-literal escaping', () => {
  it.each(INVESTMENT_SKILLS.map((t) => [t.id, t] as const))(
    '%s embedded source is syntactically valid JavaScript',
    (_id, tool) => {
      const source = (tool.manifest as { sourceCode: string }).sourceCode;
      expect(() => new Function(source)).not.toThrow();
    },
  );
});

describe('Portfolio risk advisory emits presentation blocks', () => {
  it('every investment skill declares present as required in its outputSchema', () => {
    for (const tool of INVESTMENT_SKILLS) {
      const schema = tool.outputSchema as { required?: string[]; properties?: Record<string, unknown> };
      expect(schema.required).toContain('present');
      expect(Object.keys(schema.properties || {})).toContain('present');
    }
  });

  it('analyze-portfolio reports real allocation computed from supplied holdings', async () => {
    const { result, output } = await run(PORTFOLIO_RISK_ADVISORY, {
      action: 'analyze-portfolio',
      holdings: [
        { symbol: 'VTI', value: 60000, assetClass: 'US Stock' },
        { symbol: 'VXUS', value: 40000, assetClass: 'Intl Stock' },
        { symbol: 'BND', value: 25000, assetClass: 'Bond' },
      ],
      riskTolerance: 'Moderate',
    });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect((data.totalValue)).toBeCloseTo(125000, 2);
    expect((data.source)).toBe('local-input');
    const body = bodyOf(result);
    expect(body).toContain('Total value:');
    expect(body).toContain('125000');
    expect(body).toContain('US Stock');
    expect(body).toContain('Intl Stock');
    assertPresentClean(result);
    expect(output?.outputSchemaIssues || []).toEqual([]);
  });

  it('analyze-portfolio reports when no holdings are supplied', async () => {
    const { result } = await run(PORTFOLIO_RISK_ADVISORY, {
      action: 'analyze-portfolio',
    });
    expect(result.success).toBe(true);
    const body = bodyOf(result);
    expect(body).toMatch(/no positive-value/i);
    assertPresentClean(result);
  });

  it('evaluate computes a weighted score from supplied criteria and ranks results', async () => {
    const { result } = await run(PORTFOLIO_RISK_ADVISORY, {
      action: 'evaluate',
      symbols: ['AAPL', 'MSFT', 'GOOG'],
      criteria: {
        AAPL: { growth: 8, value: 6, momentum: 7 },
        MSFT: { growth: 9, value: 5, momentum: 8 },
        GOOG: { growth: 7, value: 4, momentum: 6 },
      },
      weights: { growth: 0.5, value: 0.3, momentum: 0.2 },
    });
    expect(result.success).toBe(true);
    const body = bodyOf(result);
    expect(body).toMatch(/Evaluated 3 investments/i);
    expect(body).toMatch(/Ranking/i);
    assertPresentClean(result);
  });

  it('risk-assessment computes VaR from supplied volatility and portfolio value', async () => {
    const { result } = await run(PORTFOLIO_RISK_ADVISORY, {
      action: 'risk-assessment',
      portfolio: {
        holdings: [
          { symbol: 'VTI', value: 60000 },
          { symbol: 'BND', value: 40000 },
        ],
      },
      volatility: 0.15,
      confidenceLevel: 0.95,
      holdingPeriod: 10,
      methods: ['var-parametric'],
    });
    expect(result.success).toBe(true);
    const body = bodyOf(result);
    expect(body).toContain('Portfolio value:');
    expect(body).toContain('var-parametric');
    assertPresentClean(result);
  });

  it('returns present blocks on the error path (unknown action)', async () => {
    const { result, output } = await run(PORTFOLIO_RISK_ADVISORY, {
      action: 'bogus-action',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown action/i);
    assertPresentClean(result);
    expect(output?.outputSchemaIssues || []).toEqual([]);
  });

  it('output satisfies its declared outputSchema on every path', async () => {
    const inputs: Record<string, unknown>[] = [
      { action: 'analyze-portfolio', holdings: [{ symbol: 'VTI', value: 10000, assetClass: 'Stock' }] },
      { action: 'bogus-action' },
      {},
    ];
    for (const input of inputs) {
      const { result, output } = await run(PORTFOLIO_RISK_ADVISORY, input);
      expect(validateAgainstOutputSchema(result, PORTFOLIO_RISK_ADVISORY.outputSchema)).toEqual([]);
      expect(output?.outputSchemaIssues || []).toEqual([]);
    }
  });
});

describe('Research & Planning emits presentation blocks', () => {
  it('search returns matching supplied documents with a readable report', async () => {
    const docs = [
      { id: 'doc1', title: 'Apple Q3 2024 Earnings', type: 'earnings', provider: 'FactSet', date: '2024-08-15', rating: 'Buy', summary: 'Strong revenue growth driven by iPhone sales.', sector: 'Technology' },
      { id: 'doc2', title: 'Microsoft Cloud Report', type: 'initiating', provider: 'Goldman', date: '2024-07-10', rating: 'Neutral', summary: 'Azure growth slowing but still profitable.', sector: 'Technology' },
    ];
    const { result, output } = await run(RESEARCH_PLANNING, {
      action: 'search',
      query: 'apple',
      documents: docs,
    });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect((data.total)).toBe(1);
    const body = bodyOf(result);
    expect(body).toMatch(/Research Search Results/i);
    expect(body).toContain('Apple Q3 2024');
    expect(body).toMatch(/not.*supplied|No documents matched/i);
    expect(body).not.toMatch(/Microsoft Cloud/i);
    assertPresentClean(result);
    expect(output?.outputSchemaIssues || []).toEqual([]);
  });

  it('get-analyst-estimates reports not-connected rather than fabricating estimates', async () => {
    const { result } = await run(RESEARCH_PLANNING, {
      action: 'get-analyst-estimates',
      symbol: 'AAPL',
    });
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data.source).toBe('not-connected');
    expect(data.consensus).toBeNull();
    expect(data.targetPrice).toBeNull();
    const body = bodyOf(result);
    expect(body).toMatch(/Not connected/i);
    expect(body).toMatch(/no analyst-data provider/i);
    assertPresentClean(result);
  });

  it('get-esg-scores reports not-connected with null scores', async () => {
    const { result } = await run(RESEARCH_PLANNING, {
      action: 'get-esg-scores',
      symbol: 'TSLA',
    });
    expect(result.success).toBe(true);
    const body = bodyOf(result);
    expect(body).toMatch(/Not connected/i);
    assertPresentClean(result);
  });

  it('create-plan computes a real projection from supplied profile and assumptions', async () => {
    const { result } = await run(RESEARCH_PLANNING, {
      action: 'create-plan',
      clientProfile: {
        age: 45,
        income: 120000,
        assets: { total: 250000 },
      },
      assumptions: {
        marketReturn: 0.07,
        inflationRate: 0.025,
        retirementAge: 65,
        withdrawalRate: 0.04,
      },
    });
    expect(result.success).toBe(true);
    const data = result.data as { projections: { portfolioValue: number; annualIncome: number } };
    // futureValue = 250000 * (1 + 0.07 - 0.025)^20 = 250000 * 1.045^20
    const expectedFV = 250000 * Math.pow(1 + 0.07 - 0.025, 20);
    expect(data.projections.portfolioValue).toBeCloseTo(expectedFV, 0);
    expect(data.projections.annualIncome).toBeCloseTo(expectedFV * 0.04, 0);
    const body = bodyOf(result);
    expect(body).toMatch(/Financial Plan/i);
    expect(body).toContain('Projected portfolio value');
    assertPresentClean(result);
  });

  it('create-plan reports when no profile or assumptions are supplied', async () => {
    const { result } = await run(RESEARCH_PLANNING, {
      action: 'create-plan',
    });
    expect(result.success).toBe(true);
    const body = bodyOf(result);
    expect(body).toMatch(/Years to retirement: N\/A/i);
    expect(body).toMatch(/Projected portfolio value: N\/A/i);
    assertPresentClean(result);
  });

  it('returns present blocks on the error path (unknown action)', async () => {
    const { result, output } = await run(RESEARCH_PLANNING, {
      action: 'bogus-action',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown action/i);
    assertPresentClean(result);
    expect(output?.outputSchemaIssues || []).toEqual([]);
  });

  it('output satisfies its declared outputSchema on every path', async () => {
    const docs = [{ id: 'd1', title: 'Test', type: 'research', provider: 'p', summary: 's' }];
    const inputs: Record<string, unknown>[] = [
      { action: 'search', query: 'test', documents: docs },
      { action: 'get-analyst-estimates', symbol: 'AAPL' },
      { action: 'create-plan', clientProfile: { age: 45 }, assumptions: { marketReturn: 0.07, inflationRate: 0.02, retirementAge: 65, withdrawalRate: 0.04 } },
      { action: 'bogus-action' },
    ];
    for (const input of inputs) {
      const { result, output } = await run(RESEARCH_PLANNING, input);
      expect(validateAgainstOutputSchema(result, RESEARCH_PLANNING.outputSchema)).toEqual([]);
      expect(output?.outputSchemaIssues || []).toEqual([]);
    }
  });
});

describe('Bill Pay & Rebalancing stages by default and never silently writes', () => {
  // Resolved lazily: the module-level beforeAll sets INVESTMENT_HOME at run time,
  // after this describe body has already been evaluated.
  let storePath: string;

  beforeAll(() => {
    storePath = path.join(investmentHome, 'bill-pay.json');
  });

  beforeEach(() => {
    try { fs.unlinkSync(storePath); } catch { /* ignore */ }
  });

  it('dry-run track-obligations reports upcoming and overdue bills', async () => {
    const now = new Date();
    const future = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);
    const past = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
    const { result } = await run(BILL_PAY_REBALANCING, {
      dryRun: true,
      action: 'track-obligations',
      obligations: [
        { description: 'Rent', amount: 1200, dueDate: future.toISOString(), category: 'housing' },
        { description: 'Old bill', amount: 50, dueDate: past.toISOString(), category: 'misc' },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe('dry-run');
    const body = bodyOf(result);
    expect(body).toMatch(/Bill Tracking/i);
    expect(body).toContain('1200');
    expect(body).toContain('50');
    expect(body).toMatch(/dry run/i);
    assertPresentClean(result);
    expect(fs.existsSync(storePath)).toBe(false);
  });

  it('dry-run flag-fees identifies fees above the threshold', async () => {
    const { result } = await run(BILL_PAY_REBALANCING, {
      dryRun: true,
      action: 'flag-fees',
      fees: [
        { description: 'Overdraft', amount: 35, date: '2024-01-05', source: 'bank' },
        { description: 'Monthly fee', amount: 10, date: '2024-01-06', source: 'bank' },
      ],
      feeThreshold: 15,
    });
    expect(result.success).toBe(true);
    const data = result.data as { fees: { flagged: unknown[]; threshold: number; totalFees: number } };
    expect(data.fees.flagged.length).toBe(1);
    expect(data.fees.threshold).toBe(15);
    expect(data.fees.totalFees).toBe(45);
    const body = bodyOf(result);
    expect(body).toMatch(/Fee Analysis/i);
    expect(body).toContain('Overdraft');
    expect(body).toContain('35');
    assertPresentClean(result);
  });

  it('dry-run stage-transfer shows the transfer that would be staged', async () => {
    const { result } = await run(BILL_PAY_REBALANCING, {
      dryRun: true,
      action: 'stage-transfer',
      from: 'Checking 1234',
      to: 'Vanguard Brokerage',
      amount: 5000,
      purpose: 'Contribute to IRA',
    });
    expect(result.success).toBe(true);
    const data = result.data as { transfer: { from: string; to: string; amount: number; dryRun: boolean } };
    expect(data.transfer.from).toBe('Checking 1234');
    expect(data.transfer.to).toBe('Vanguard Brokerage');
    expect(data.transfer.amount).toBe(5000);
    expect(data.transfer.dryRun).toBe(true);
    const body = bodyOf(result);
    expect(body).toMatch(/dry run/i);
    expect(body).toContain('Checking 1234');
    expect(body).toContain('Vanguard Brokerage');
    assertPresentClean(result);
    expect(fs.existsSync(storePath)).toBe(false);
  });

  it('stage-transfer without required params reports an error', async () => {
    const { result, output } = await run(BILL_PAY_REBALANCING, {
      dryRun: true,
      action: 'stage-transfer',
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/source account|destination account|amount/i);
    assertPresentClean(result);
    expect(output?.outputSchemaIssues || []).toEqual([]);
  });

  it('dry-run rebalance computes drift from supplied holdings and targets', async () => {
    const { result } = await run(BILL_PAY_REBALANCING, {
      dryRun: true,
      action: 'rebalance',
      from: 'Brokerage',
      holdings: [
        { symbol: 'VTI', value: 60000 },
        { symbol: 'VXUS', value: 40000 },
      ],
      targets: { VTI: 0.5, VXUS: 0.5 },
      rebalanceThreshold: 0.05,
    });
    expect(result.success).toBe(true);
    const data = result.data as { rebalance: { transfers: unknown[]; status: string; dryRun: boolean } };
    expect(data.rebalance.status).toBe('staged');
    expect(data.rebalance.dryRun).toBe(true);
    expect(data.rebalance.transfers.length).toBeGreaterThan(0);
    const body = bodyOf(result);
    expect(body).toMatch(/Rebalancing Plan/i);
    expect(body).toContain('VTI');
    expect(body).toContain('VXUS');
    assertPresentClean(result);
    expect(fs.existsSync(storePath)).toBe(false);
  });

  it('dry-run calculate-drift reports max drift without writing', async () => {
    const { result } = await run(BILL_PAY_REBALANCING, {
      dryRun: true,
      action: 'calculate-drift',
      holdings: [
        { symbol: 'VTI', value: 70000 },
        { symbol: 'VXUS', value: 30000 },
      ],
      targets: { VTI: 0.5, VXUS: 0.5 },
      rebalanceThreshold: 0.05,
    });
    expect(result.success).toBe(true);
    const data = result.data as { drift: { maxDrift: number; drift: unknown[] } };
    expect(data.drift.maxDrift).toBeCloseTo(0.20, 2);
    const body = bodyOf(result);
    expect(body).toMatch(/Drift Analysis/i);
    expect(body).toContain('REBALANCE');
    assertPresentClean(result);
    expect(fs.existsSync(storePath)).toBe(false);
  });

  it('returns present blocks on the error path (unknown action)', async () => {
    const { result, output } = await run(BILL_PAY_REBALANCING, {
      dryRun: true,
      action: 'bogus-action',
    });
    expect(result.success).toBe(false);
    assertPresentClean(result);
    expect(output?.outputSchemaIssues || []).toEqual([]);
  });

  it('output satisfies its declared outputSchema on every path', async () => {
    const inputs: Record<string, unknown>[] = [
      { dryRun: true, action: 'track-obligations', obligations: [{ description: 'Rent', amount: 1000, dueDate: '2024-12-01' }] },
      { dryRun: true, action: 'flag-fees', fees: [{ description: 'Fee', amount: 50 }], feeThreshold: 25 },
      { dryRun: true, action: 'calculate-drift', holdings: [{ symbol: 'A', value: 100 }], targets: { A: 0.5 } },
      { dryRun: true, action: 'stage-transfer', from: 'A', to: 'B', amount: 100 },
      { dryRun: true, action: 'rebalance', from: 'A', holdings: [{ symbol: 'A', value: 100 }], targets: { A: 0.5 } },
      { dryRun: true, action: 'bogus' },
    ];
    for (const input of inputs) {
      const { result, output } = await run(BILL_PAY_REBALANCING, input);
      expect(validateAgainstOutputSchema(result, BILL_PAY_REBALANCING.outputSchema)).toEqual([]);
      expect(output?.outputSchemaIssues || []).toEqual([]);
    }
  });
});

describe('Investment market data stages by default and never silently calls the API', () => {
  it('dry-run with no endpoint reports not-connected', async () => {
    const previous = process.env.INVESTMENT_MARKET_DATA_ENDPOINT;
    delete process.env.INVESTMENT_MARKET_DATA_ENDPOINT;
    try {
      const { result, output } = await run(INVESTMENT_MARKET_DATA, {
        action: 'quote',
        symbols: ['AAPL', 'MSFT'],
        dryRun: true,
      });
      expect(result.success).toBe(false);
      expect(result.status).toBe('not-connected');
      expect(result.error).toMatch(/not connected/i);
      const data = result.data as Record<string, unknown>;
      expect(data.sent).toBe(false);
      expect(data.endpoint).toBeNull();
      const body = bodyOf(result);
      expect(body).toMatch(/Not connected/i);
      expect(body).toContain('AAPL');
      expect(body).toContain('MSFT');
      expect(body).toMatch(/no request sent/i);
      assertPresentClean(result);
      expect(output?.outputSchemaIssues || []).toEqual([]);
    } finally {
      if (previous !== undefined) process.env.INVESTMENT_MARKET_DATA_ENDPOINT = previous;
    }
  });

  it('dry-run with endpoint configured shows the staged request without sending', async () => {
    const previous = process.env.INVESTMENT_MARKET_DATA_ENDPOINT;
    process.env.INVESTMENT_MARKET_DATA_ENDPOINT = 'https://api.example.invalid/v1/marketdata';
    try {
      const { result } = await run(INVESTMENT_MARKET_DATA, {
        action: 'historical',
        symbols: ['TSLA'],
        interval: '1d',
        startDate: '2024-01-01',
        endDate: '2024-06-30',
        dryRun: true,
      });
      expect(result.success).toBe(true);
      expect(result.status).toBe('dry-run');
      const data = result.data as Record<string, unknown>;
      expect(data.sent).toBe(false);
      expect(data.endpoint).toBe('https://api.example.invalid/v1/marketdata');
      const body = bodyOf(result);
      expect(body).toMatch(/dry run/i);
      expect(body).toContain('TSLA');
      expect(body).toContain('2024-01-01');
      expect(body).not.toMatch(/HTTP status|Response received/i);
      assertPresentClean(result);
    } finally {
      if (previous !== undefined) process.env.INVESTMENT_MARKET_DATA_ENDPOINT = previous;
      else delete process.env.INVESTMENT_MARKET_DATA_ENDPOINT;
    }
  });

  it('refuses a live call without explicit confirmation', async () => {
    await expect(
      run(INVESTMENT_MARKET_DATA, { action: 'quote', symbols: ['AAPL'], dryRun: false }),
    ).rejects.toThrow(/confirmation/i);
  });

  it('reports not-connected even when confirmation is given (no endpoint)', async () => {
    const previous = process.env.INVESTMENT_MARKET_DATA_ENDPOINT;
    delete process.env.INVESTMENT_MARKET_DATA_ENDPOINT;
    try {
      const { result } = await run(INVESTMENT_MARKET_DATA, {
        action: 'quote',
        symbols: ['AAPL'],
        dryRun: false,
        confirmation: true,
      });
      expect(result.success).toBe(false);
      expect(result.status).toBe('not-connected');
      assertPresentClean(result);
    } finally {
      if (previous !== undefined) process.env.INVESTMENT_MARKET_DATA_ENDPOINT = previous;
    }
  });

  it('reports blocked when no action is supplied', async () => {
    const { result } = await run(INVESTMENT_MARKET_DATA, {
      dryRun: true,
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe('blocked');
    expect(result.error).toMatch(/action/i);
    assertPresentClean(result);
  });

  it('output satisfies its declared outputSchema on every path', async () => {
    const inputs: Record<string, unknown>[] = [
      { dryRun: true },
      { action: 'quote', symbols: ['AAPL'], dryRun: true },
      { action: 'quote', symbols: ['AAPL'], dryRun: false, confirmation: true },
    ];
    for (const input of inputs) {
      const { result, output } = await run(INVESTMENT_MARKET_DATA, input);
      expect(validateAgainstOutputSchema(result, INVESTMENT_MARKET_DATA.outputSchema)).toEqual([]);
      expect(output?.outputSchemaIssues || []).toEqual([]);
    }
  });
});
