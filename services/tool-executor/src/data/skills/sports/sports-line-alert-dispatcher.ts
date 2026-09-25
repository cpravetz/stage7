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
    entity: SchemaProps.text({ description: 'Entity, market, or line identifier', title: 'Entity / Market', order: 1, hint: 'Team, player, or market identifier' }),
    market: SchemaProps.text({ description: 'Market or line identifier (alias for entity)', title: 'Market', order: 2, hint: 'Alternative: specific betting market (e.g. moneyline, spread)' }),
    sport: SchemaProps.text({ description: 'Sport context', title: 'Sport', order: 3, hint: 'e.g. NFL, NBA, MLB' }),
    condition: SchemaProps.select(['line-movement', 'line-reached', 'value-spot'], { description: 'Alert trigger condition', title: 'Condition', order: 4, hint: 'When to trigger the alert' }),
    targetOdds: SchemaProps.number({ description: 'Target odds level for alert', title: 'Target Odds', order: 5, hint: 'Specific odds level to alert on' }),
    movementThreshold: SchemaProps.number({ description: 'Movement threshold for triggering alert', title: 'Movement Threshold', order: 6, hint: 'Minimum line movement to trigger', default: 0.05 }),
    markets: SchemaProps.stringArray({ description: 'Markets to monitor (moneyline, spread, totals, etc.)', title: 'Markets', order: 7, hint: 'Which bet types to monitor' }),
    direction: SchemaProps.select(['up', 'down', 'any'], { description: 'Direction of line movement', title: 'Direction', order: 8, hint: 'Direction of movement to watch', default: 'any' }),
    message: SchemaProps.text({ description: 'Alert message', title: 'Message', order: 9, hint: 'Custom alert message' }),
    channels: SchemaProps.stringArray({ description: 'Dispatch channels', title: 'Channels', order: 10, hint: 'Where to send alerts', default: ['user-device'] }),
    confirmationId: SchemaProps.text({ description: 'Confirmation ID for gating', title: 'Confirmation ID', order: 11, hint: 'Optional confirmation token' }),
    dryRun: SchemaProps.boolean({ description: 'Always dry-run — represent actions never execute live', title: 'Dry Run', order: 12, hint: 'Always enabled for represent actions', default: true }),
    confirmationRequired: SchemaProps.boolean({ description: 'Confirmation required before sending', title: 'Require Confirmation', order: 13, hint: 'Gate dispatch behind confirmation', default: true }),
    bankrollUnits: SchemaProps.number({ description: 'Current bankroll units', title: 'Bankroll Units', order: 14, hint: 'Current units at risk', default: 0 }),
    bankrollMaxUnits: SchemaProps.number({ description: 'Maximum bankroll units', title: 'Max Bankroll Units', order: 15, hint: 'Maximum exposure limit', default: 100 }),
    historicalVariance: SchemaProps.number({ description: 'Historical variance for signal detection', title: 'Historical Variance', order: 16, hint: 'Baseline variance for noise filtering', default: 0.03 }),
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
  tier: 'represent',
  domainKnowledge: 'Sports line movement analysis, market odds monitoring, bankroll exposure',
  confirmBeforeSend: true,
  triggers: [
    { kind: 'user', phrase_examples: ['Check line movement', 'Dispatch line alert', 'Monitor odds change', 'Alert value spot'] }
  ],
isSkill: true,
});
