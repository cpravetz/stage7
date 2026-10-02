// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';
import { sportsResultSchema, SPORTS_PERFORMANCE_SAFETY_BOUNDARY } from './sports-contract';

const TACTICAL_ROSTER_EVALUATOR_INPUT = {
  type: 'object',
  properties: {
    entity: SchemaProps.text({ description: 'Team or player identifier for tactical evaluation' }),
    opponent: SchemaProps.text({ description: 'Opponent team identifier for matchup analysis' }),
    sport: SchemaProps.text({ description: 'Sport context (basketball, football, soccer, etc.)' }),
    timeframe: SchemaProps.select(['7d', '30d', '90d', 'season'], { description: 'Analysis window', default: '30d' }),
    formation: SchemaProps.text({ description: 'Current formation or lineup scheme', default: 'standard' }),
    playerMetrics: SchemaProps.object({
      points: SchemaProps.number({ description: 'Points per game' }),
      assists: SchemaProps.number({ description: 'Assists per game' }),
      rebounds: SchemaProps.number({ description: 'Rebounds per game' }),
      efficiency: SchemaProps.number({ description: 'Efficiency rating' }),
    }, { description: 'Player/team performance metrics' }),
    opponentMetrics: SchemaProps.object({
      points: SchemaProps.number({ description: 'Opponent points per game' }),
      assists: SchemaProps.number({ description: 'Opponent assists per game' }),
      rebounds: SchemaProps.number({ description: 'Opponent rebounds per game' }),
      efficiency: SchemaProps.number({ description: 'Opponent efficiency rating' }),
    }, { description: 'Opponent performance metrics' }),
  },
  required: ['entity', 'opponent'],
};

export const TACTICAL_ROSTER_EVALUATOR = createDeclarativeCodeSkill({
  id: 'sports-tactical-roster-evaluator',
  name: 'Tactical & Roster Strategy Evaluator',
  description: 'Advises tactical adjustments and lineup optimizations by synthesizing player performance metrics, opponent match-up data, and game film trends. Computes synergy scores, weakness indices, and strategic recommendations.',
  persistenceEnvVar: 'SPORTS_GROUP_A_HOME',
  inputSchema: TACTICAL_ROSTER_EVALUATOR_INPUT,
  outputSchema: sportsResultSchema('Tactical evaluation result'),
  tier: 'advise',
  domainKnowledge: 'Sports tactical analysis, roster optimization, opponent matchup evaluation',
  triggers: [
    { kind: 'event', on: 'Match calendar entering pre-match window' },
  ],
  isSkill: false,
  manifest: {
    // The provider key is a secret, so it is declared as a credential rather than a
    // plain config field: the executor resolves it and hands the handler a value via
    // ctx.credentials. Declare `configKey: 'vault:...'` in configuration to source it
    // from the vault instead.
    credentialSource: {
      statsApiKey: { configKey: 'statsApiKey', required: false, label: "stats provider API key (set in this Skill configuration, or a vault secret)" },
    },
    configSchema: {
      type: 'object',
      properties: {
        statsEndpoint: SchemaProps.url({ description: 'Stats provider base URL for this Skill' }),
        statsApiKey: SchemaProps.text({ description: 'Stats provider API key' }),
        requestTimeoutMs: SchemaProps.number({ description: 'Request timeout in milliseconds', default: 10000 }),
        dataProvider: SchemaProps.select(['statsperform', 'opta', 'both'], { description: 'Sports data API provider', default: 'both' }),
        telemetryEnabled: SchemaProps.boolean({ description: 'Use wearable telemetry feeds', default: true }),
      },
    }
  },
  handler: async function handler(input, ctx) {
      const entity = input.entity || input.teamId || input.playerId || '';
      const opponent = input.opponent || input.opponentId || '';
      const sport = input.sport || 'generic';
      const timeframe = input.timeframe || '30d';

      const defaults = { evaluations: [], lastUpdated: new Date().toISOString() };
      // Keep the shape used below; an `[]` fallback made `store.evaluations` throw.
      const loaded = ctx.store.load('tactical-roster-eval', defaults);
      const store = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? { ...defaults, ...loaded } : defaults;

      function parseTimeframe(tf) {
        const now = new Date();
        if (tf === '7d') return new Date(now.getTime() - 7 * 86400000);
        if (tf === '30d') return new Date(now.getTime() - 30 * 86400000);
        if (tf === '90d') return new Date(now.getTime() - 90 * 86400000);
        if (tf === 'season') return new Date(now.getFullYear(), 0, 1);
        return new Date(now.getTime() - 30 * 86400000);
      }

      const windowStart = parseTimeframe(timeframe);

      const statsApi = String(ctx.config?.statsEndpoint || '');
      const statsKey = ctx.getCredential ? ctx.getCredential('statsApiKey') : undefined;
      const requestTimeoutMs = Number(ctx.config?.requestTimeoutMs) || 10000;

      async function resolvePlayerMetrics(entityId, opponentId) {
        const localPlayer = input.playerMetrics || {};
        const localOpponent = input.opponentMetrics || {};

        if (!statsApi) {
          return {
            playerMetrics: localPlayer,
            opponentMetrics: localOpponent,
            source: 'local-input',
            connectivityStatus: 'not-configured',
          };
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const url = statsApi + (statsApi.endsWith('/') ? '' : '/') + 'players/' + encodeURIComponent(entityId) + '?opponent=' + encodeURIComponent(opponentId);
          const res = await fetch(url, { signal: controller.signal });
          if (!res.ok) {
            clearTimeout(timer);
            return {
              playerMetrics: localPlayer,
              opponentMetrics: localOpponent,
              source: 'local-input-fallback',
              connectivityStatus: 'http-error',
              error: 'HTTP ' + res.status,
            };
          }
          const data = await res.json();
          clearTimeout(timer);
          return {
            playerMetrics: data.player || localPlayer,
            opponentMetrics: data.opponent || localOpponent,
            source: 'api-connected',
            connectivityStatus: 'ok',
          };
        } catch (err) {
          clearTimeout(timer);
          return {
            playerMetrics: localPlayer,
            opponentMetrics: localOpponent,
            source: 'local-input-fallback',
            connectivityStatus: 'network-error',
            error: err && err.message ? err.message : String(err),
          };
        }
      }

      function computeTacticalEvaluation(entityId, opponentId, playerMetrics, opponentMetrics) {
        const synergyScores = [];
        const weaknessIndices = [];
        const recommendations = [];

        const playerKeys = playerMetrics ? Object.keys(playerMetrics) : [];
        const oppKeys = opponentMetrics ? Object.keys(opponentMetrics) : [];
        const allMetrics = [...new Set([...playerKeys, ...oppKeys])];

        for (const metric of allMetrics) {
          const pVal = playerMetrics ? (Number(playerMetrics[metric]) || 0) : 0;
          const oVal = opponentMetrics ? (Number(opponentMetrics[metric]) || 0) : 0;
          if (pVal === 0 && oVal === 0) continue;
          const diff = pVal - oVal;
          const ratio = oVal > 0 ? diff / oVal : (pVal > 0 ? 1 : 0);
          synergyScores.push({ metric, playerValue: pVal, opponentValue: oVal, differential: diff, synergyRatio: ratio });
          if (ratio < -0.2) {
            weaknessIndices.push({ metric, severity: Math.abs(ratio), gap: diff });
          }
        }

        if (weaknessIndices.length > 0) {
          weaknessIndices.sort((a, b) => b.severity - a.severity);
          const top = weaknessIndices[0];
          recommendations.push({
            type: 'adjustment',
            priority: top.severity > 0.5 ? 'high' : top.severity > 0.3 ? 'medium' : 'low',
            metric: top.metric,
            message: 'Address weakness in ' + top.metric + ': differential of ' + top.gap.toFixed(2) + ' vs opponent',
          });
        }

        const strongMetrics = synergyScores.filter(s => s.synergyRatio > 0.15);
        for (const s of strongMetrics.slice(0, 3)) {
          recommendations.push({
            type: 'exploit',
            priority: 'medium',
            metric: s.metric,
            message: 'Exploit strength in ' + s.metric + ': advantage ratio ' + s.synergyRatio.toFixed(3),
          });
        }

        const lineupOptimization = {
          formation: input.formation || 'standard',
          adjustments: recommendations.length,
          expectedEdge: synergyScores.length > 0 ? synergyScores.reduce((sum, s) => sum + s.synergyRatio, 0) / synergyScores.length : 0,
        };

        return {
          entity: entityId,
          opponent: opponentId,
          sport,
          dataPoints: synergyScores.length,
          synergyScores,
          weaknessIndices,
          lineupOptimization,
          recommendations,
          overallAssessment: recommendations.length === 0 ? 'EVEN' : recommendations.some(r => r.priority === 'high') ? 'DISADVANTAGED' : 'NEUTRAL',
        };
      }

      const fetched = await resolvePlayerMetrics(entity, opponent);
      const evaluation = computeTacticalEvaluation(entity, opponent, fetched.playerMetrics, fetched.opponentMetrics);
      evaluation.id = 'tre_' + Buffer.from(entity + opponent).toString('base64').slice(0, 12);
      evaluation.generatedAt = new Date().toISOString();
      evaluation.source = fetched.source;
      evaluation.connectivityStatus = fetched.connectivityStatus;

      store.evaluations.push(evaluation);
      ctx.store.save('tactical-roster-eval', store);
    }
  });
TACTICAL_ROSTER_EVALUATOR.configSchema = {
      type: 'object',
      properties: {
        dataProvider: SchemaProps.select(['statsperform', 'opta', 'both'], { description: 'Sports data API provider', default: 'both' }),
        telemetryEnabled: SchemaProps.boolean({ description: 'Use wearable telemetry feeds', default: true }),
      },
    };
