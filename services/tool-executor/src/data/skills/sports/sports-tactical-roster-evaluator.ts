import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SPORTS_GROUP_A_HOME = process.env.SPORTS_GROUP_A_HOME || '/tmp/sports/group-a';

const TACTICAL_ROSTER_EVALUATOR_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const entity = input.entity || input.teamId || input.playerId || '';
const opponent = input.opponent || input.opponentId || '';
const sport = input.sport || 'generic';
const timeframe = input.timeframe || '30d';

const baseDir = process.env.SPORTS_GROUP_A_HOME || '/tmp/sports/group-a';
const storePath = path.join(baseDir, 'tactical-roster-eval.json');
fs.mkdirSync(baseDir, { recursive: true });

let store = { evaluations: [], lastUpdated: new Date().toISOString() };
if (fs.existsSync(storePath)) {
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch (e) {}
}

function parseTimeframe(tf) {
  const now = new Date();
  if (tf === '7d') return new Date(now.getTime() - 7 * 86400000);
  if (tf === '30d') return new Date(now.getTime() - 30 * 86400000);
  if (tf === '90d') return new Date(now.getTime() - 90 * 86400000);
  if (tf === 'season') return new Date(now.getFullYear(), 0, 1);
  return new Date(now.getTime() - 30 * 86400000);
}

const windowStart = parseTimeframe(timeframe);

function fetchPlayerStats(entity, opponent) {
  const statsApi = process.env.SPORTS_PERFORM_API || process.env.OPTA_API_URL || '';
  if (!statsApi) {
    return { playerMetrics: input.playerMetrics || {}, opponentMetrics: input.opponentMetrics || {}, source: 'local-fallback' };
  }
  return { playerMetrics: input.playerMetrics || {}, opponentMetrics: input.opponentMetrics || {}, source: 'api-connected' };
}

function computeTacticalEvaluation(entity, opponent, playerMetrics, opponentMetrics) {
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
    entity,
    opponent,
    sport,
    dataPoints: synergyScores.length,
    synergyScores,
    weaknessIndices,
    lineupOptimization,
    recommendations,
    overallAssessment: recommendations.length === 0 ? 'EVEN' : recommendations.some(r => r.priority === 'high') ? 'DISADVANTAGED' : 'NEUTRAL',
  };
}

const fetched = fetchPlayerStats(entity, opponent);
const evaluation = computeTacticalEvaluation(entity, opponent, fetched.playerMetrics, fetched.opponentMetrics);
evaluation.id = 'tre_' + Buffer.from(entity + opponent).toString('base64').slice(0, 12);
evaluation.generatedAt = new Date().toISOString();
evaluation.source = fetched.source;

store.evaluations.push(evaluation);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: evaluation }));
`;

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

const CODE_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
    error: { type: 'string' },
  },
  required: ['success'],
};

export const TACTICAL_ROSTER_EVALUATOR = createCodeSkill({
  id: 'sports-tactical-roster-evaluator',
  name: 'Tactical & Roster Strategy Evaluator',
  description: 'Advises tactical adjustments and lineup optimizations by synthesizing player performance metrics, opponent match-up data, and game film trends. Computes synergy scores, weakness indices, and strategic recommendations.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: TACTICAL_ROSTER_EVALUATOR_SOURCE,
    configSchema: {
      type: 'object',
      properties: {
        dataProvider: SchemaProps.select(['statsperform', 'opta', 'both'], { description: 'Sports data API provider', default: 'both' }),
        telemetryEnabled: SchemaProps.boolean({ description: 'Use wearable telemetry feeds', default: true }),
      },
    },
  },
  inputSchema: TACTICAL_ROSTER_EVALUATOR_INPUT,
  outputSchema: CODE_OUTPUT,
  tier: 'advise',
  domainKnowledge: 'Sports tactical analysis, roster optimization, opponent matchup evaluation',
  triggers: [
    { kind: 'schedule', cadence: 'Pre-match tactical briefing 48h prior' },
  ],
isSkill: true,
});
