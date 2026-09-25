import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SPORTS_GROUP_B_HOME = process.env.SPORTS_GROUP_B_HOME || '/tmp/sports/group-b';

const BANKROLL_COPILOT_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const bankroll = Number(input.bankroll) || 0;
const unitSize = Number(input.unitSize) || 0;
const unitLimit = Number(input.unitLimit) || 100;
const currentUnits = Number(input.currentUnits) || 0;
const stake = Number(input.stake) || 0;
const odds = Number(input.odds) || 1.0;
const winProb = Number(input.winProbability);
const currency = input.currency || 'USD';
const sessionId = input.sessionId || input.id || 'default';
const confidenceLevel = Number(input.confidenceLevel) || 0.95;

const baseDir = process.env.SPORTS_GROUP_B_HOME || '/tmp/sports/group-b';
const storePath = path.join(baseDir, 'bankroll-rules.json');
fs.mkdirSync(baseDir, { recursive: true });

let store = { sessions: {}, rules: {}, lastUpdated: new Date().toISOString() };
if (fs.existsSync(storePath)) {
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch (e) {}
}

if (!store.sessions[sessionId]) {
  store.sessions[sessionId] = { id: sessionId, wagered: 0, won: 0, lost: 0, sessions: 0, unitsUsed: 0, createdAt: new Date().toISOString() };
}
const session = store.sessions[sessionId];

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

const kellyFraction = (winProb != null && odds > 1)
  ? clamp(((winProb * odds - 1) / (odds - 1)), 0, 0.25)
  : null;
const kellyStake = kellyFraction !== null ? Math.round(bankroll * kellyFraction * 100) / 100 : null;

const unitBasedStake = unitSize * unit;
const maxKellyStake = bankroll > 0 ? bankroll * 0.05 : 0;

const violations = [];
if (stake > 0) {
  if (bankroll > 0) {
    const stakePct = stake / bankroll;
    if (stakePct > 0.05) violations.push({ rule: 'single-bet-cap', message: 'Stake exceeds 5% of bankroll', stakePercent: stakePct, limit: 0.05 });
    if (stakePct > 0.10) violations.push({ rule: 'max-stake-percent', message: 'Stake exceeds 10% of bankroll', stakePercent: stakePct, limit: 0.10 });
  }
  if (unitLimit > 0 && currentUnits + 1 > unitLimit) {
    violations.push({ rule: 'unit-limit', message: 'Unit limit would be exceeded', currentUnits: currentUnits, unitLimit: unitLimit });
  }
}

let impliedProb = null;
if (odds > 0) impliedProb = 1 / odds;
let edge = null;
if (winProb != null && impliedProb != null) edge = winProb - impliedProb;
let expectedLoss = 0;
if (winProb != null && stake > 0) expectedLoss = stake * (1 - winProb);

let variance = 0;
if (stake > 0) {
  const winReturn = odds * stake;
  variance = Math.pow(winReturn - stake, 2) * winProb + Math.pow(-stake, 2) * (1 - winProb);
}

if (session) {
  session.sessions++;
  if (stake > 0) session.unitsUsed += stake / (unitSize || 1);
  if (winProb != null && winProb > 0.5 && stake > 0) session.won += stake;
  if (winProb != null && winProb <= 0.5 && stake > 0) session.lost += stake;
  session.wagered += stake;
}

const responsiblePlay = {
  sessionExposure: session ? session.wagered : stake,
  bankrollPercent: bankroll > 0 ? ((session ? session.wagered : stake) / bankroll * 100).toFixed(2) : '0.00',
  unitsUsed: session ? session.unitsUsed : 0,
  unitLimit,
  cooldownMinutes: input.cooldownMinutes || 5,
  disclaimer: 'Bankroll management is self-discipline software. It does not place bets or access sportsbook accounts. Always wager within your means.',
};

const result = {
  id: 'bk_' + Buffer.from(sessionId).toString('base64').slice(0, 12),
  bankroll,
  unitSize,
  unitLimit,
  currentUnits,
  currency,
  stake,
  odds,
  winProbability: winProb,
  kellyFraction,
  kellyStake,
  maxKellyStake,
  unitBasedStake,
  edge,
  impliedProbability: impliedProb,
  expectedLoss,
  variance,
  violations,
  blocked: violations.length > 0,
  reason: violations.length > 0 ? violations.map(v => v.message).join('; ') : null,
  recommendation: violations.length > 0 ? 'REJECT' : (edge != null && edge > 0 ? 'APPROVE' : 'HOLD'),
  responsiblePlay,
  session: session ? { wagered: session.wagered, unitsUsed: session.unitsUsed, sessions: session.sessions } : null,
  generatedAt: new Date().toISOString(),
  source: 'algorithmic',
};

fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
console.log(JSON.stringify({ success: true, data: result }));
`;

const BANKROLL_COPILOT_INPUT = {
  type: 'object',
  properties: {
    bankroll: SchemaProps.number({ description: 'Total betting bankroll' }),
    unitSize: SchemaProps.number({ description: 'Standard unit size in currency' }),
    unitLimit: SchemaProps.number({ description: 'Maximum units per session', default: 100 }),
    currentUnits: SchemaProps.number({ description: 'Units already wagered this session', default: 0 }),
    stake: SchemaProps.number({ description: 'Proposed wager amount' }),
    odds: SchemaProps.number({ description: 'Decimal odds', default: 1.0 }),
    winProbability: SchemaProps.number({ description: 'Estimated win probability (0-1)' }),
    currency: SchemaProps.text({ description: 'Currency code', default: 'USD' }),
    sessionId: SchemaProps.text({ description: 'Session identifier', default: 'default' }),
    cooldownMinutes: SchemaProps.number({ description: 'Cooldown between sessions in minutes', default: 5 }),
    confidenceLevel: SchemaProps.number({ description: 'Confidence for variance calc (0-1)', default: 0.95 }),
  },
  required: [],
};

const CODE_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
    error: { type: 'string' },
  },
  required: ['success'],
};

export const BANKROLL_CO_PILOT = createCodeSkill({
  id: 'sports-bankroll-co-pilot',
  name: 'Bankroll Co-Pilot',
  description: 'Aids bankroll discipline by modeling unit sizing, Kelly Criterion limits, session exposure, and variance. Enforces responsible-play rules: single-bet caps, unit limits, and stake percentage limits. All calculations run locally with no external calls. Does not place wagers or access sportsbook accounts.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: BANKROLL_COPILOT_SOURCE,
  },
  inputSchema: BANKROLL_COPILOT_INPUT,
  outputSchema: CODE_OUTPUT,
  tier: 'aid',
  domainKnowledge: 'Bankroll management mathematics, Kelly Criterion, responsible gambling',
  triggers: [
    { kind: 'schedule', cadence: 'Pre-bet risk check' },
  ],
});
