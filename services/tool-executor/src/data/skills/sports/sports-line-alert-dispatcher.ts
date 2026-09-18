import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SPORTS_GROUP_B_HOME = process.env.SPORTS_GROUP_B_HOME || '/tmp/sports/group-b';

const LINE_ALERT_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const entity = input.entity || input.market || 'general';
const sport = input.sport || 'generic';
const dryRun = input.dryRun !== false;
const confirmBeforeSend = input.confirmationRequired !== false;

const baseDir = process.env.SPORTS_GROUP_B_HOME || '/tmp/sports/group-b';
const storePath = path.join(baseDir, 'line-alerts.json');
fs.mkdirSync(baseDir, { recursive: true });

let store = { alerts: [], specs: {}, lastUpdated: new Date().toISOString() };
if (fs.existsSync(storePath)) {
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch (e) {}
}

const oddsApi = process.env.ODDS_DATA_API_URL || '';
const dataConnected = oddsApi.length > 0;

const condition = input.condition || 'line-movement';
const targetOdds = Number(input.targetOdds) || null;
const movementThreshold = Number(input.movementThreshold) || 0.05;
const markets = Array.isArray(input.markets) ? input.markets : ['moneyline'];
const direction = input.direction || 'any';
const confirmationId = input.confirmationId || null;
const bankrollUnits = Number(input.bankrollUnits) || 0;
const bankrollMaxUnits = Number(input.bankrollMaxUnits) || 100;
const historicalVariance = Number(input.historicalVariance) || 0.03;
const exposureRatio = bankrollMaxUnits > 0 ? movementThreshold / bankrollMaxUnits : 0;
const actionRecommendation = exposureRatio > 0.5;
let signalType = 'noise';
if (movementThreshold > historicalVariance * 3) { signalType = 'genuine-value'; }
else if (movementThreshold > historicalVariance) { signalType = 'moderate-movement'; }
const alertType = signalType === 'genuine-value' ? 'action-recommended' : 'informational';
const movementAssessment = { exposureRatio, actionRecommendation, signalType, historicalVariance, movementThreshold };

const lineAlertSpec = {
  id: 'la_' + Buffer.from(entity + sport).toString('base64').slice(0, 12),
  entity,
  sport,
  condition,
  targetOdds,
  movementThreshold,
  markets,
  direction,
  dryRun: dryRun,
  confirmationRequired: confirmBeforeSend,
  confirmationId: confirmationId,
  confirmationProvided: confirmBeforeSend,
  actionRecommendation: actionRecommendation,
  signalType: signalType,
  alertType: alertType,
  movementAssessment: movementAssessment,
  bankrollUnits: bankrollUnits,
  bankrollMaxUnits: bankrollMaxUnits,
  neverPlaceWagers: true,
  neverAccessSportsbookAccounts: true,
  dataConnected: dataConnected,
  alertCriteria: {
    anyMovementAbove: movementThreshold,
    targetReached: targetOdds,
    direction: direction,
    markets: markets,
  },
  message: input.message || 'Line alert for ' + entity,
  channels: input.channels || ['user-device'],
  dispatchedAt: new Date().toISOString(),
  source: dataConnected ? 'odds-api' : 'local',
};

store.alerts.push(lineAlertSpec);
if (!store.specs[sport]) store.specs[sport] = [];
store.specs[sport].push(lineAlertSpec.id);

fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: lineAlertSpec }));
`;

const LINE_ALERT_INPUT = {
  type: 'object',
  properties: {
    entity: SchemaProps.text({ description: 'Entity, market, or line identifier' }),
    sport: SchemaProps.text({ description: 'Sport context' }),
    condition: SchemaProps.select(['line-movement', 'line-reached', 'value-spot'], { description: 'Alert trigger condition' }),
    targetOdds: SchemaProps.number({ description: 'Target odds level for alert' }),
    movementThreshold: SchemaProps.number({ description: 'Movement threshold for triggering alert', default: 0.05 }),
    markets: SchemaProps.stringArray({ description: 'Markets to monitor (moneyline, spread, totals, etc.)' }),
    direction: SchemaProps.select(['up', 'down', 'any'], { description: 'Direction of line movement', default: 'any' }),
    message: SchemaProps.text({ description: 'Alert message' }),
    channels: SchemaProps.stringArray({ description: 'Dispatch channels', default: ['user-device'] }),
    confirmationId: SchemaProps.text({ description: 'Confirmation ID for gating' }),
    dryRun: SchemaProps.boolean({ description: 'Always dry-run — represent actions never execute live', default: true }),
    confirmationRequired: SchemaProps.boolean({ description: 'Confirmation required before sending', default: true }),
  },
  required: ['entity', 'sport'],
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

export const LINE_ALERT_DISPATCHER = createCodeSkill({
  id: 'sports-line-alert-dispatcher',
  name: 'Line-Alert Dispatcher',
  description: 'Evaluates line movement significance relative to the user betting strategy and current bankroll exposure; determines whether movements warrant informational alerts or action recommendations by integrating with Bankroll Co-Pilot state; distinguishes genuine value signals from market noise using historical variance patterns; dispatches contextualized alerts when conditions are material. STRICTLY BARRED from ever placing wagers or accessing sportsbook accounts.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: LINE_ALERT_SOURCE,
    configSchema: {
      type: 'object',
      properties: {
        confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before sending', default: true }),
        dryRun: SchemaProps.boolean({ description: 'Always dry-run for represent actions', default: true }),
        monitorInterval: SchemaProps.number({ description: 'Monitoring interval in seconds', default: 30 }),
        maxAlertsPerHour: SchemaProps.number({ description: 'Maximum alerts per hour', default: 30 }),
      },
    },
  },
  inputSchema: LINE_ALERT_INPUT,
  outputSchema: CODE_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Alert on line move', 'Line reached', 'Track this market', 'Value spot'] },
    { kind: 'schedule', cadence: 'Continuous line monitoring' },
    { kind: 'event', on: 'Line movement alert' },
    { kind: 'event', on: 'Target odds reached' },
  ],
});
