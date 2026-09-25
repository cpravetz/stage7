import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SPORTS_GROUP_A_HOME = process.env.SPORTS_GROUP_A_HOME || '/tmp/sports/group-a';

const SCOUTING_ALERT_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const entity = input.entity || input.playerId || input.teamId || '';
const alertType = input.alertType || 'scouting';
const sport = input.sport || 'generic';
const dryRun = input.dryRun !== false;
const confirmBeforeSend = input.confirmationRequired !== false;

const baseDir = process.env.SPORTS_GROUP_A_HOME || '/tmp/sports/group-a';
const storePath = path.join(baseDir, 'scouting-alerts.json');
fs.mkdirSync(baseDir, { recursive: true });

let store = { alerts: [], lastUpdated: new Date().toISOString() };
if (fs.existsSync(storePath)) {
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch (e) {}
}

const telemetryApi = process.env.WEARABLE_TELEMETRY_ENDPOINT || '';
const dataConnected = telemetryApi.length > 0;

const healthStatus = input.healthStatus || 'monitoring';
const performanceAnomaly = input.performanceAnomaly || null;
const transferInterest = input.transferInterest || null;

const alert = {
  id: 'sa_' + Buffer.from(entity + alertType).toString('base64').slice(0, 12),
  entity,
  alertType,
  sport,
  healthStatus,
  performanceAnomaly,
  transferInterest,
  severity: input.severity || 'info',
  dryRun: dryRun,
  confirmationRequired: confirmBeforeSend,
  dataConnected: dataConnected,
  channels: input.channels || ['staff-dashboard'],
  message: input.message || 'Scouting alert for ' + entity,
  dispatchedAt: new Date().toISOString(),
  source: dataConnected ? 'telemetry-api' : 'local',
};

store.alerts.push(alert);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: alert }));
`;

const SCOUTING_ALERT_INPUT = {
  type: 'object',
  properties: {
    entity: SchemaProps.text({ description: 'Player, team, or entity identifier' }),
    alertType: SchemaProps.select(['scouting', 'health', 'performance', 'transfer', 'injury'], { description: 'Type of scouting alert' }),
    sport: SchemaProps.text({ description: 'Sport context' }),
    severity: SchemaProps.select(['low', 'info', 'warning', 'critical'], { description: 'Alert severity', default: 'info' }),
    healthStatus: SchemaProps.text({ description: 'Player health status', default: 'monitoring' }),
    performanceAnomaly: SchemaProps.text({ description: 'Performance anomaly description' }),
    transferInterest: SchemaProps.text({ description: 'Transfer market interest details' }),
    channels: SchemaProps.stringArray({ description: 'Alert dispatch channels' }),
    message: SchemaProps.text({ description: 'Alert message' }),
    dryRun: SchemaProps.boolean({ description: 'Always dry-run — represent actions never execute live', default: true }),
    confirmationRequired: SchemaProps.boolean({ description: 'Confirmation required before sending', default: true }),
  },
  required: ['entity', 'alertType'],
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

export const SCOUTING_ALERT_DISPATCHER = createCodeSkill({
  id: 'sports-scouting-alert-dispatcher',
  name: 'Automated Scouting & Alert Dispatcher',
  description: 'Represents tactical alerts to staff — tracks player health, performance anomalies, and transfer market updates. Dry-run only with confirmation required. Connects to Wearable Telemetry feeds.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: SCOUTING_ALERT_SOURCE,
    configSchema: {
      type: 'object',
      properties: {
        confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before sending alerts', default: true }),
        dryRun: SchemaProps.boolean({ description: 'Always dry-run for represent actions', default: true }),
        defaultChannels: SchemaProps.stringArray({ description: 'Default dispatch channels' }),
        rateLimitPerHour: SchemaProps.number({ description: 'Max alerts per hour', default: 20 }),
      },
    },
  },
  inputSchema: SCOUTING_ALERT_INPUT,
  outputSchema: CODE_OUTPUT,
  tier: 'represent',
  domainKnowledge: 'Sports scouting, player health monitoring, transfer market tracking',
  confirmBeforeSend: true,
  triggers: [
    { kind: 'event', on: 'Player health or transfer state change detected' }
  ],
isSkill: false,
});
