// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';
import { sportsResultSchema, SPORTS_PERFORMANCE_SAFETY_BOUNDARY } from './sports-contract';

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

export const SCOUTING_ALERT_DISPATCHER = createDeclarativeCodeSkill({
  id: 'sports-scouting-alert-dispatcher',
  name: 'Automated Scouting & Alert Dispatcher',
  description: 'Represents tactical alerts to staff — tracks player health, performance anomalies, and transfer market updates. Dry-run only with confirmation required. Connects to Wearable Telemetry feeds.',
  persistenceEnvVar: 'SPORTS_GROUP_A_HOME',
  inputSchema: SCOUTING_ALERT_INPUT,
  outputSchema: sportsResultSchema('Scouting alert dispatch result'),
  tier: 'represent',
  domainKnowledge: 'Sports scouting, player health monitoring, transfer market tracking',
  confirmBeforeSend: true,
  triggers: [
    { kind: 'event', on: 'Player health or transfer state change detected' }
  ],
  isSkill: false,
  manifest: {
    configSchema: {
      type: 'object',
      properties: {
        confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before sending alerts', default: true }),
        dryRun: SchemaProps.boolean({ description: 'Always dry-run for represent actions', default: true }),
        defaultChannels: SchemaProps.stringArray({ description: 'Default dispatch channels' }),
        rateLimitPerHour: SchemaProps.number({ description: 'Max alerts per hour', default: 20 }),
      },
    }
  },
  handler: async function handler(input, ctx) {
      const entity = input.entity || input.playerId || input.teamId || '';
      const alertType = input.alertType || 'scouting';
      const sport = input.sport || 'generic';
      const dryRun = input.dryRun !== false;
      const confirmBeforeSend = input.confirmationRequired !== false;

      let store = { alerts: [], lastUpdated: new Date().toISOString() };
      store = ctx.store.load('scouting-alerts', []);

      const telemetryApi = process.env.WEARABLE_TELEMETRY_ENDPOINT || '';
      const requestTimeoutMs = Number(process.env.SPORTS_REQUEST_TIMEOUT_MS) || 10000;

      async function fetchTelemetryData(apiUrl) {
        if (!apiUrl) {
          return { ok: false, status: 'not-configured', data: null, error: 'WEARABLE_TELEMETRY_ENDPOINT not set' };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const res = await fetch(apiUrl, { signal: controller.signal });
          if (!res.ok) {
            return { ok: false, status: 'http-error', data: null, error: 'HTTP ' + res.status };
          }
          const data = await res.json();
          clearTimeout(timer);
          return { ok: true, status: 'ok', data };
        } catch (err) {
          clearTimeout(timer);
          return { ok: false, status: 'network-error', data: null, error: err && err.message ? err.message : String(err) };
        }
      }

      const telemetryResult = await fetchTelemetryData(telemetryApi);
      const dataConnected = telemetryResult.ok === true;

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
        connectivityStatus: telemetryResult.status,
      };

      store.alerts.push(alert);
      ctx.store.save('scouting-alerts', store);
    }
  });
SCOUTING_ALERT_DISPATCHER.configSchema = {
      type: 'object',
      properties: {
        confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before sending alerts', default: true }),
        dryRun: SchemaProps.boolean({ description: 'Always dry-run for represent actions', default: true }),
        defaultChannels: SchemaProps.stringArray({ description: 'Default dispatch channels' }),
        rateLimitPerHour: SchemaProps.number({ description: 'Max alerts per hour', default: 20 }),
      },
    };
