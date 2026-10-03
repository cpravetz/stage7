// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { sportsResultSchema, SPORTS_PERFORMANCE_SAFETY_BOUNDARY } from '../sports-contract';

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
        wearableEndpoint: SchemaProps.url({ description: 'Wearable telemetry provider base URL' }),
        requestTimeoutMs: SchemaProps.number({ description: 'Request timeout in milliseconds', default: 10000 }),
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

      const defaults = { alerts: [], lastUpdated: new Date().toISOString() };
      // Keep the shape used below; an `[]` fallback made `store.alerts` throw.
      const loaded = ctx.store.load('scouting-alerts', defaults);
      const store = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? { ...defaults, ...loaded } : defaults;

      const telemetryApi = String(ctx.config?.wearableEndpoint || '');
      const requestTimeoutMs = Number(ctx.config?.requestTimeoutMs) || 10000;

      async function fetchTelemetryData(apiUrl) {
        if (!apiUrl) {
          return { ok: false, status: 'not-configured', data: null, error: 'No wearable telemetry provider configured: set wearableEndpoint in this Skill\'s configuration' };
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

      // The alert was built and persisted but never returned, so the Skill
      // produced no output while appearing to succeed. Report what was recorded,
      // including when it came from local data rather than the configured
      // telemetry provider.
      const summaryLines = [
        'Scouting alert: ' + alertType + ' for ' + entity,
        'Severity ' + alert.severity + ' | channels: ' + alert.channels.join(', '),
        alert.message,
      ];
      if (dryRun) summaryLines.push('Dry run: nothing was sent.');
      else summaryLines.push('Dispatched to: ' + alert.channels.join(', '));
      if (!dataConnected) {
        summaryLines.push('Telemetry source: local only - no wearable telemetry provider configured, so no live data was read.');
      }

      return {
        success: true,
        status: 'ok',
        data: { alert: alert, alerts: store.alerts, storePath: ctx.store.getFilePath('scouting-alerts') },
        source: alert.source,
        connectivityStatus: telemetryResult.status,
        error: null,
        present: [ctx.render.text('scouting-alert', 'Scouting alert', summaryLines.join('\n'))],
      };
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
