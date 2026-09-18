import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const INVESTMENT_HOME = process.env.INVESTMENT_HOME || '/tmp/investment';

const BILL_PAY_REBALANCING_SOURCE = `const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const baseDir = process.env.INVESTMENT_HOME || '${INVESTMENT_HOME}';
const storePath = path.join(baseDir, 'bill-pay.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
function trackObligations(input) {
  const obligations = Array.isArray(input.obligations) ? input.obligations.filter(o => o && Number.isFinite(Number(o.amount)) && Number(o.amount) >= 0 && !Number.isNaN(Date.parse(o.dueDate))) : [];
  const now = new Date();
  return { upcoming: obligations.filter(o => new Date(o.dueDate) >= now).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate)), overdue: obligations.filter(o => new Date(o.dueDate) < now), totalDue: obligations.reduce((sum, o) => sum + Number(o.amount), 0) };
}
function flagFees(input) {
  const fees = Array.isArray(input.fees) ? input.fees.filter(f => f && Number.isFinite(Number(f.amount)) && Number(f.amount) >= 0) : [];
  const threshold = Number.isFinite(Number(input.feeThreshold)) ? Number(input.feeThreshold) : null;
  const flagged = threshold === null ? [] : fees.filter(f => Number(f.amount) > threshold);
  return { flagged, threshold, totalFees: fees.reduce((sum, f) => sum + Number(f.amount), 0), unusualCount: flagged.length, notice: threshold === null ? 'No fee threshold was supplied; no fees were flagged.' : 'Fees are flagged only when their supplied amount exceeds the supplied threshold.' };
}
function createTransfer(input) {
  const amount = Number(input.amount);
  if (!input.from || !input.to || !Number.isFinite(amount) || amount <= 0) {
    return { error: 'A source account, destination account, and positive transfer amount are required.' };
  }
  const transfer = { id: 'txn_' + Date.now(), from: input.from, to: input.to, amount, purpose: input.purpose || '', status: 'staged', stagedAt: new Date().toISOString(), requiresConfirmation: true };
  store.push(transfer);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  return transfer;
}
function stageTransfer(input) {
  return createTransfer(input);
}
function calculateDrift(input) {
  const holdings = Array.isArray(input.holdings) ? input.holdings.filter(h => h && Number(h.value ?? h.amount) > 0) : [];
  const targets = input.targets || {};
  const totalValue = holdings.reduce((sum, h) => sum + Number(h.value ?? h.amount), 0);
  if (!totalValue) return { drift: [], totalValue: 0, maxDrift: 0, notice: 'No positive-value holdings were supplied; no drift was calculated.' };
  const threshold = Number.isFinite(Number(input.rebalanceThreshold)) ? Number(input.rebalanceThreshold) : 0.05;
  const drift = holdings.map(h => {
    const current = Number(h.value ?? h.amount) / totalValue;
    const target = Number(targets[h.symbol] || 0);
    const driftPct = current - target;
    return { symbol: h.symbol, currentPct: current, targetPct: target, driftPct, needsRebalance: Math.abs(driftPct) > threshold };
  });
  return { drift, totalValue, maxDrift: Math.max(0, ...drift.map(d => Math.abs(d.driftPct))), threshold, notice: 'Drift is calculated only from supplied holdings and target weights.' };
}
function stageRebalance(input) {
  const analysis = calculateDrift(input);
  const transfers = analysis.drift.filter(item => item.needsRebalance).map(item => createTransfer({ from: input.from, to: input.to || item.symbol, amount: Math.abs(item.driftPct) * analysis.totalValue, purpose: 'Rebalance ' + item.symbol }));
  const staged = transfers.filter(transfer => !transfer.error);
  return { ...analysis, transfers: staged, blocked: transfers.filter(transfer => transfer.error), status: staged.length ? 'staged' : 'no-action', requiresConfirmation: true, notice: staged.length ? 'Rebalancing instructions are staged for explicit user approval; no account was changed.' : 'No supplied holding crossed the rebalancing threshold.' };
}
function handleAction() {
  const action = input.action || 'track-obligations'; let result;
  switch (action) {
    case 'track-obligations': result = { success: true, data: { obligations: trackObligations(input), storePath }, action }; break;
    case 'flag-fees': result = { success: true, data: { fees: flagFees(input), storePath }, action }; break;
    case 'stage-transfer': {
      const transfer = stageTransfer(input);
      result = transfer.error ? { success: false, error: transfer.error, action } : { success: true, data: { transfer, storePath }, action };
      break;
    }
    case 'rebalance': result = { success: true, data: { rebalance: stageRebalance(input), storePath }, action }; break;
    case 'calculate-drift': result = { success: true, data: { drift: calculateDrift(input), storePath }, action }; break;
    default: result = { success: false, error: 'Unknown action: ' + action, action };
  }
  const record = { id: 'bpr_' + Date.now(), action, input, result, createdAt: new Date().toISOString() };
  store.push(record); fs.writeFileSync(storePath, JSON.stringify(store, null, 2)); return result;
}
handleAction().then(r => console.log(JSON.stringify(r))).catch(e => console.log(JSON.stringify({ success: false, error: e.message })));
`;

const BILL_PAY_REBALANCING = createCodeSkill({
  id: 'bill-pay-rebalancing',
  name: 'Bill Pay & Rebalancing Execution Proxy',
  description: 'Tracks upcoming personal obligations, flags unusual bank fees, and stages rebalancing transfers for explicit user approval.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: BILL_PAY_REBALANCING_SOURCE },
  inputSchema: {
    type: 'object',
    properties: {
      action: SchemaProps.select(['track-obligations', 'flag-fees', 'stage-transfer', 'rebalance', 'calculate-drift'], { description: 'Action to perform' }),
      obligations: SchemaProps.objectArray(SchemaProps.object({ description: SchemaProps.text({ description: 'Obligation description' }), dueDate: SchemaProps.text({ description: 'Due date (ISO 8601)' }), amount: SchemaProps.number({ description: 'Amount due', minimum: 0 }), category: SchemaProps.text({ description: 'Category' }) }, { description: 'Bill or obligation' }), { description: 'List of upcoming obligations' }),
      fees: SchemaProps.objectArray(SchemaProps.object({ description: SchemaProps.text({ description: 'Fee description' }), amount: SchemaProps.number({ description: 'Fee amount', minimum: 0 }), date: SchemaProps.text({ description: 'Fee date' }), source: SchemaProps.text({ description: 'Fee source' }) }, { description: 'Bank fee record' }), { description: 'List of recent fees' }),
      feeThreshold: SchemaProps.number({ description: 'Minimum fee amount to flag', minimum: 0 }),
      rebalanceThreshold: SchemaProps.number({ description: 'Absolute target-weight drift that requires rebalancing', default: 0.05, minimum: 0, maximum: 1 }),
      from: SchemaProps.text({ description: 'Source account for transfer' }),
      to: SchemaProps.text({ description: 'Destination account for transfer' }),
      amount: SchemaProps.number({ description: 'Transfer amount', minimum: 0 }),
      purpose: SchemaProps.text({ description: 'Purpose of transfer' }),
      holdings: SchemaProps.objectArray(SchemaProps.object({ symbol: SchemaProps.text({ description: 'Asset symbol' }), value: SchemaProps.number({ description: 'Current value', minimum: 0 }) }, { description: 'Holding' }), { description: 'Current portfolio holdings' }),
      targets: SchemaProps.object({}, { description: 'Target allocation percentages by symbol' }),
    },
    required: ['action'],
  },
  outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, data: { type: 'object' }, storePath: { type: 'string' }, error: { type: 'string' } }, required: ['success'] },
  triggers: [
    { kind: 'user', phrase_examples: ['Track my bills', 'Review upcoming payments', 'Stage a transfer', 'Check portfolio drift', 'Flag unusual fees'] },
    { kind: 'schedule', cadence: 'Monthly net worth audit' },
    { kind: 'schedule', cadence: 'Tax estimation reminders' },
    { kind: 'event', on: 'Portfolio drift exceeds variance target' },
    { kind: 'event', on: 'New bank fee detected' },
    { kind: 'event', on: 'Bill due date approaching' },
  ],
});

BILL_PAY_REBALANCING.confirmBeforeSend = true;

export { BILL_PAY_REBALANCING };
