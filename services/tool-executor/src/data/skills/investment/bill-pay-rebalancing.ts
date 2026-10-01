// @ts-nocheck
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';
import { investmentResultSchema } from './investment-contract';

const billPayRebalancingInputSchema = {
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
};

const BILL_PAY_REBALANCING = createDeclarativeCodeSkill({
  id: 'bill-pay-rebalancing',
  name: 'Bill Pay & Rebalancing Execution Proxy',
  description: 'Tracks upcoming personal obligations, flags unusual bank fees, and stages rebalancing transfers for explicit user approval.',
  persistenceEnvVar: 'INVESTMENT_HOME',
  tier: 'represent',
  domainKnowledge: 'Personal finance obligation tracking, bank fee anomaly detection, and approval-gated rebalancing transfers',
  inputSchema: billPayRebalancingInputSchema,
  outputSchema: investmentResultSchema('Obligation tracking results, fee analysis, and staged transfer records'),
  triggers: [
    { kind: 'schedule', cadence: 'daily obligation review' },
    { kind: 'user', phrase_examples: ['Track my bills', 'Review upcoming payments', 'Stage a transfer', 'Check portfolio drift', 'Flag unusual fees'] }
  ],
  confirmBeforeSend: true,
  isSkill: true,
  manifest: {
    workflowStage: 'trade'
  },
  handler: async function handler(input, ctx) {
      const NL = '\n';
      const dryRun = input.dryRun === true || input.dryRun === undefined;
      var store = ctx.store.load('storePath', []);
      if (!Array.isArray(store)) store = [];

      function fmtMoney(v) { return v == null ? 'N/A' : '$' + Number(v).toFixed(2); }
      function fmtPct(v) { return v == null ? 'N/A' : (v * 100).toFixed(1) + '%'; }
      function iso(d) { try { return new Date(d).toISOString().slice(0, 10); } catch (e) { return String(d); } }
      function fmtDate(d) { try { return new Date(d).toISOString().slice(0, 10); } catch (e) { return String(d); } }

      function trackObligations(input) {
        const obligations = Array.isArray(input.obligations) ? input.obligations.filter(o => o && Number.isFinite(Number(o.amount)) && Number(o.amount) >= 0 && !Number.isNaN(Date.parse(o.dueDate))) : [];
        const now = new Date();
        const upcoming = obligations.filter(o => new Date(o.dueDate) >= now).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
        const overdue = obligations.filter(o => new Date(o.dueDate) < now);
        return { upcoming, overdue, totalDue: obligations.reduce((sum, o) => sum + Number(o.amount), 0), count: obligations.length, source: 'supplied-input', notice: obligations.length ? 'Obligations are filtered to those with a valid amount and parseable due date.' : 'No obligations with valid amounts and due dates were supplied.' };
      }
      function flagFees(input) {
        const fees = Array.isArray(input.fees) ? input.fees.filter(f => f && Number.isFinite(Number(f.amount)) && Number(f.amount) >= 0) : [];
        const threshold = Number.isFinite(Number(input.feeThreshold)) ? Number(input.feeThreshold) : null;
        const flagged = threshold === null ? [] : fees.filter(f => Number(f.amount) > threshold);
        return { flagged, threshold, totalFees: fees.reduce((sum, f) => sum + Number(f.amount), 0), unusualCount: flagged.length, feeCount: fees.length, source: 'supplied-input', notice: threshold === null ? 'No fee threshold was supplied; no fees were flagged.' : 'Fees are flagged only when their supplied amount exceeds the supplied threshold.' };
      }
      function createTransfer(input, dryRun) {
        const amount = Number(input.amount);
        if (!input.from || !input.to || !Number.isFinite(amount) || amount <= 0) {
          return { error: 'A source account, destination account, and positive transfer amount are required.' };
        }
        const transfer = { id: 'txn_' + Date.now(), from: input.from, to: input.to, amount, purpose: input.purpose || '', status: 'staged', stagedAt: new Date().toISOString(), requiresConfirmation: true, dryRun: dryRun };
        if (!dryRun) {
          store.push(transfer);
          ctx.store.save('bill-pay', store);
        }
        return transfer;
      }
      function calculateDrift(input) {
        const holdings = Array.isArray(input.holdings) ? input.holdings.filter(h => h && Number.isFinite(Number(h.value ?? h.amount)) && Number(h.value ?? h.amount) > 0) : [];
        const targets = input.targets || {};
        const totalValue = holdings.reduce((sum, h) => sum + Number(h.value ?? h.amount), 0);
        if (!totalValue) return { drift: [], totalValue: 0, maxDrift: 0, notice: 'No positive-value holdings were supplied; no drift was calculated.', source: 'supplied-input' };
        const threshold = Number.isFinite(Number(input.rebalanceThreshold)) ? Number(input.rebalanceThreshold) : 0.05;
        const drift = holdings.map(h => {
          const current = Number(h.value ?? h.amount) / totalValue;
          const target = Number(targets[h.symbol] || 0);
          const driftPct = current - target;
          return { symbol: h.symbol, currentPct: current, targetPct: target, driftPct, needsRebalance: Math.abs(driftPct) > threshold };
        });
        return { drift, totalValue, maxDrift: Math.max(0, ...drift.map(d => Math.abs(d.driftPct))), threshold, notice: 'Drift is calculated only from supplied holdings and target weights.', source: 'supplied-input' };
      }
      function stageRebalance(input, dryRun) {
        const analysis = calculateDrift(input);
        const transfers = analysis.drift.filter(item => item.needsRebalance).map(item => createTransfer({ from: input.from, to: input.to || item.symbol, amount: Math.abs(item.driftPct) * analysis.totalValue, purpose: 'Rebalance ' + item.symbol }, dryRun));
        const staged = transfers.filter(transfer => !transfer.error);
        return { ...analysis, transfers: staged, blocked: transfers.filter(transfer => transfer.error), status: staged.length ? 'staged' : 'no-action', requiresConfirmation: true, dryRun: dryRun, notice: staged.length ? 'Rebalancing instructions are ' + (dryRun ? 'staged for preview (dry run); no account was changed.' : 'staged for explicit user approval; no account was changed.') : 'No supplied holding crossed the rebalancing threshold.' };
      }

      function buildPresent(action, data, error, isDryRun) {
        const L = [];
        var d = data || {};

        if (action === 'track-obligations' && d.obligations) {
          const obs = d.obligations;
          L.push((isDryRun ? 'Bill Tracking (dry run)' : 'Bill Tracking'));
          L.push('===============================');
          L.push('Total obligations: ' + obs.count);
          L.push('Total amount due: ' + fmtMoney(obs.totalDue));
          if (obs.upcoming.length) {
            L.push('');
            L.push('Upcoming bills (' + obs.upcoming.length + '):');
            obs.upcoming.forEach(function (o) { L.push('  - ' + (o.description || '(untitled)') + ': ' + fmtMoney(o.amount) + ' (due ' + fmtDate(o.dueDate) + (o.category ? ', ' + o.category : '') + ')'); });
          }
          if (obs.overdue.length) {
            L.push('');
            L.push('Overdue bills (' + obs.overdue.length + '):');
            obs.overdue.forEach(function (o) { L.push('  - ' + (o.description || '(untitled)') + ': ' + fmtMoney(o.amount) + ' (due ' + fmtDate(o.dueDate) + ')'); });
          }
          if (obs.notice) { L.push(''); L.push('Note: ' + obs.notice); }
        } else if (action === 'flag-fees' && d.fees) {
          const fees = d.fees;
          L.push('Fee Analysis');
          L.push('============');
          L.push('Total fees: ' + fmtMoney(fees.totalFees));
          L.push('Fee count: ' + fees.feeCount);
          if (fees.threshold !== null) L.push('Threshold: ' + fmtMoney(fees.threshold));
          if (fees.flagged.length) {
            L.push('');
            L.push('Flagged fees (' + fees.flagged.length + '):');
            fees.flagged.forEach(function (f) { L.push('  - ' + (f.description || '(untitled)') + ': ' + fmtMoney(f.amount) + (f.source ? ' (' + f.source + ')' : '') + ' (on ' + fmtDate(f.date) + ')'); });
          } else if (fees.threshold !== null) {
            L.push('');
            L.push('No fees exceeded the threshold of ' + fmtMoney(fees.threshold) + '.');
          }
          if (fees.notice) { L.push(''); L.push('Note: ' + fees.notice); }
        } else if (action === 'stage-transfer' && d.transfer) {
          const t = d.transfer;
          if (t.error) {
            L.push('Transfer Not Staged');
            L.push('==================');
            L.push(t.error);
          } else {
            L.push('Transfer ' + (isDryRun ? '(dry run — not written)' : '(staged for approval)'));
            L.push('================' + (isDryRun ? '---------------------' : '------------------'));
            L.push('  From: ' + t.from);
            L.push('  To: ' + t.to);
            L.push('  Amount: ' + fmtMoney(t.amount));
            if (t.purpose) L.push('  Purpose: ' + t.purpose);
            L.push('  Status: ' + t.status);
            if (isDryRun) L.push('');
            L.push(isDryRun ? 'The transfer above is what would be staged. No account was changed.' : 'The transfer has been staged for your explicit approval before execution.');
          }
        } else if (action === 'rebalance' && d.rebalance) {
          const r = d.rebalance;
          L.push('Rebalancing Plan');
          L.push('================');
          L.push('Total portfolio value: ' + fmtMoney(r.totalValue));
          L.push('Threshold: ' + fmtPct(r.threshold));
          if (r.transfers && r.transfers.length) {
            L.push('');
            L.push('Staging ' + r.transfers.length + ' rebalancing transfer(s):');
            r.transfers.forEach(function (t, i) { L.push('  ' + (i + 1) + '. ' + t.from + ' -> ' + t.to + ': ' + fmtMoney(t.amount) + ' (for ' + t.purpose + ')'); });
          } else {
            L.push('');
            L.push('No rebalancing transfers are needed — no holding crossed the threshold.');
          }
          if (r.drift && r.drift.length) {
            L.push('');
            L.push('Drift analysis:');
            r.drift.forEach(function (h) {
              var flag = h.needsRebalance ? ' — REBALANCE' : '';
              L.push('  ' + h.symbol + ': ' + fmtPct(h.currentPct) + ' current vs ' + fmtPct(h.targetPct) + ' target (drift ' + fmtPct(h.driftPct) + ')' + flag);
            });
          }
          if (r.blocked && r.blocked.length) {
            L.push('');
            L.push('Blocked transfers (' + r.blocked.length + '):');
            r.blocked.forEach(function (t) { L.push('  - ' + t.error); });
          }
          if (r.notice) { L.push(''); L.push('Note: ' + r.notice); }
        } else if (action === 'calculate-drift' && d.drift) {
          const dr = d.drift;
          L.push('Portfolio Drift Analysis');
          L.push('========================');
          L.push('Total portfolio value: ' + fmtMoney(dr.totalValue));
          L.push('Threshold: ' + fmtPct(dr.threshold));
          L.push('Max drift: ' + fmtPct(dr.maxDrift));
          if (dr.drift && dr.drift.length) {
            L.push('');
            L.push('Holdings drift:');
            dr.drift.forEach(function (h) {
              var flag = h.needsRebalance ? ' — REBALANCE' : '';
              L.push('  ' + h.symbol + ': ' + fmtPct(h.currentPct) + ' current vs ' + fmtPct(h.targetPct) + ' target (drift ' + fmtPct(h.driftPct) + ')' + flag);
            });
          }
          if (dr.notice) { L.push(''); L.push('Note: ' + dr.notice); }
        } else {
          L.push('No results to display for action: ' + action);
        }

        if (isDryRun) {
          L.push('');
          L.push('Dry run: no changes were persisted.');
        }

        return [{ id: 'report', title: action, kind: 'text', body: L.join(NL) }];
      }

      try {
        const action = input.action || 'track-obligations';
        let resultData = null;
        let resultError = null;
        let success = true;

        switch (action) {
          case 'track-obligations':
            resultData = { obligations: trackObligations(input), storePath: ctx.store.getFilePath('bill-pay') };
            break;
          case 'flag-fees':
            resultData = { fees: flagFees(input), storePath: ctx.store.getFilePath('bill-pay') };
            break;
          case 'stage-transfer': {
            const transfer = createTransfer(input, dryRun);
            if (transfer.error) {
              success = false;
              resultError = transfer.error;
            } else {
              resultData = { transfer: transfer, storePath: ctx.store.getFilePath('bill-pay') };
            }
            break;
          }
          case 'rebalance':
            resultData = { rebalance: stageRebalance(input, dryRun), storePath: ctx.store.getFilePath('bill-pay') };
            break;
          case 'calculate-drift':
            resultData = { drift: calculateDrift(input), storePath: ctx.store.getFilePath('bill-pay') };
            break;
          default:
            success = false;
            resultError = 'Unknown action: ' + action;
        }

        if (success) {
          const record = { id: 'bpr_' + Date.now(), action, input, result: { data: resultData }, createdAt: new Date().toISOString() };
          store.push(record);
          if (!dryRun) {
            ctx.store.save('bill-pay', store);
          }
        }

        const present = buildPresent(action, resultData, resultError, dryRun);
        return { success: success, status: success ? (dryRun ? 'dry-run' : 'ok') : 'error', data: resultData, error: resultError, present: present };
      } catch (error) {
        const msg = (error && error.message) ? error.message : String(error);
        return { success: false, status: 'error', data: null, error: msg, present: [{
          id: 'error',
          title: 'Error',
          kind: 'text',
          body: 'Bill Pay & Rebalancing action "' + (input.action || '(unspecified)') + '" failed: ' + msg
        }] };
      }
    }
  });

export { BILL_PAY_REBALANCING };
