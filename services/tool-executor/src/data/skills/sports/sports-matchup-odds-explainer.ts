import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SPORTS_GROUP_B_HOME = process.env.SPORTS_GROUP_B_HOME || '/tmp/sports/group-b';

const MATCHUP_ODDS_EXPLAINER_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const eventId = input.event || input.gameId || '';
const teamA = input.teamA || 'Team A';
const teamB = input.teamB || 'Team B';
const sport = input.sport || 'generic';

const baseDir = process.env.SPORTS_GROUP_B_HOME || '/tmp/sports/group-b';
const storePath = path.join(baseDir, 'matchup-odds.json');
fs.mkdirSync(baseDir, { recursive: true });

let store = { analyses: [], lastUpdated: new Date().toISOString() };
if (fs.existsSync(storePath)) {
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch (e) {}
}

function parseSportsbookLines(data) {
  const oddsApi = process.env.ODDS_DATA_API_URL || '';
  if (oddsApi && data) return data;
  return null;
}

const oddsA = Number(input.oddsA) || 1.0;
const oddsB = Number(input.oddsB) || 1.0;
const drawOdds = Number(input.drawOdds) || null;
const stake = Number(input.stake) || 0;

function impliedProbability(odds) {
  if (odds <= 0) return 0;
  return 1 / odds;
}

function calculateEV(odds, winProb, stakeAmount) {
  const payout = odds * stakeAmount;
  const ev = (winProb * payout) - stakeAmount;
  return ev;
}

const impliedProbA = impliedProbability(oddsA);
const impliedProbB = impliedProbability(oddsB);
const impliedProbDraw = drawOdds ? impliedProbability(drawOdds) : null;

const totalImplied = impliedProbA + impliedProbB + (impliedProbDraw || 0);
const vig = totalImplied > 1 ? (totalImplied - 1) * 100 : 0;
const fairOddsA = oddsA / totalImplied;
const fairOddsB = oddsB / totalImplied;
const fairDrawOdds = drawOdds ? drawOdds / totalImplied : null;

const evA = stake > 0 ? calculateEV(oddsA, impliedProbA, stake) : null;
const evB = stake > 0 ? calculateEV(oddsB, impliedProbB, stake) : null;

const lineMovement = Array.isArray(input.lineMovement) ? input.lineMovement : [];
const marketVariance = lineMovement.length > 0
  ? lineMovement.reduce((sum, lm) => sum + (Math.abs(lm.movement) || 0), 0) / lineMovement.length
  : 0;

const responsiblePlay = {
  entertainmentFraming: 'All odds analysis is provided for entertainment and educational purposes only.',
  expectedValueDisclaimer: 'Expected value calculations are estimates and do not guarantee outcomes.',
  responsibleGamingNote: 'Please gamble responsibly. Set limits, take breaks, and never wager more than you can afford to lose.',
  riskLevel: stake > 0 && (evA !== null ? Math.abs(evA) : 0) > stake * 0.5 ? 'moderate' : 'low',
};

const analysis = {
  id: 'mo_' + Buffer.from(eventId).toString('base64').slice(0, 12),
  eventId,
  matchup: { teamA, teamB, sport },
  odds: { oddsA, oddsB, drawOdds, vigPercent: vig.toFixed(2) },
  impliedProbabilities: { teamA: impliedProbA, teamB: impliedProbB, draw: impliedProbDraw, totalImplied },
  fairOdds: { teamA: fairOddsA, teamB: fairOddsB, draw: fairDrawOdds },
  expectedValue: { stake, evA, evB, marketVariance },
  lineMovement,
  matchupAssessment: {
    relativeStrength: impliedProbA > impliedProbB ? 'Team A favored' : impliedProbB > impliedProbA ? 'Team B favored' : 'Even matchup',
    margin: Math.abs(impliedProbA - impliedProbB).toFixed(4),
  },
  responsiblePlay,
  generatedAt: new Date().toISOString(),
  source: 'algorithmic',
};

store.analyses.push(analysis);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: analysis }));
`;

const MATCHUP_ODDS_INPUT = {
  type: 'object',
  properties: {
    event: SchemaProps.text({ description: 'Event/game identifier' }),
    teamA: SchemaProps.text({ description: 'Team A name' }),
    teamB: SchemaProps.text({ description: 'Team B name' }),
    sport: SchemaProps.text({ description: 'Sport context', default: 'generic' }),
    oddsA: SchemaProps.number({ description: 'Decimal odds for Team A' }),
    oddsB: SchemaProps.number({ description: 'Decimal odds for Team B' }),
    drawOdds: SchemaProps.number({ description: 'Draw odds (if applicable)' }),
    stake: SchemaProps.number({ description: 'Sample stake for EV calculation', default: 0 }),
    lineMovement: SchemaProps.objectArray({
      type: 'object',
      properties: {
        time: SchemaProps.text({ description: 'Timestamp of movement' }),
        market: SchemaProps.text({ description: 'Market name' }),
        movement: SchemaProps.number({ description: 'Odds movement magnitude' }),
      },
    }, { description: 'Historical line movement data' }),
  },
  required: ['event', 'oddsA', 'oddsB'],
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

export const MATCHUP_ODDS_EXPLAINER = createCodeSkill({
  id: 'sports-matchup-odds-explainer',
  name: 'Matchup & Odds Explainer',
  description: 'Advises on market odds, line movements, and statistical match-ups with mandatory responsible-play framing. Insights are strictly entertainment and expected-value math. Includes responsible-gaming disclaimers on every output.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: MATCHUP_ODDS_EXPLAINER_SOURCE,
    configSchema: {
      type: 'object',
      properties: {
        oddsProvider: SchemaProps.select(['oddsdata', 'pinnacle', 'both'], { description: 'Odds data provider', default: 'both' }),
      },
    },
  },
  inputSchema: MATCHUP_ODDS_INPUT,
  outputSchema: CODE_OUTPUT,
  tier: 'advise',
  domainKnowledge: 'Sports odds analysis, implied probability, line movement, expected value',
  triggers: [
    { kind: 'schedule', cadence: 'Pre-match briefing 48h prior' },
  ],
});
