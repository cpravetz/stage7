import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SPORTS_GROUP_B_HOME = process.env.SPORTS_GROUP_B_HOME || '/tmp/sports/group-b';

const INGAME_PREDICTIVE_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const eventId = input.event || input.gameId || '';
const sport = input.sport || 'generic';
const gameStatus = input.gameStatus || 'in-progress';

const baseDir = process.env.SPORTS_GROUP_B_HOME || '/tmp/sports/group-b';
const storePath = path.join(baseDir, 'ingame-predictions.json');
fs.mkdirSync(baseDir, { recursive: true });

let store = { predictions: [], lastUpdated: new Date().toISOString() };
if (fs.existsSync(storePath)) {
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch (e) {}
}

const playByPlay = Array.isArray(input.playByPlay) ? input.playByPlay : [];
const lineup = input.lineup || {};
const momentum = input.momentum || 'neutral';
const timeRemaining = input.timeRemaining || '';

function computeWinProbability(playByPlay, lineup, momentum) {
  let baseProb = 0.5;
  if (lineup && lineup.homeAdvantage) baseProb += 0.05;
  if (momentum === 'strong') baseProb += 0.08;
  else if (momentum === 'weak') baseProb -= 0.08;
  const recentPlays = playByPlay.slice(-10);
  const scoringRun = recentPlays.filter(p => p.scoringTeam).length;
  if (scoringRun > 6) baseProb += 0.06;
  else if (scoringRun < 3) baseProb -= 0.04;
  return Math.max(0.05, Math.min(0.95, baseProb));
}

function predictKeyEvents(playByPlay) {
  const predictions = [];
  const recentPlays = playByPlay.slice(-10);
  if (recentPlays.length > 5) {
    predictions.push({ type: 'momentum-shift', confidence: 0.65, window: 'next 5 min' });
  }
  const turnovers = playByPlay.filter(p => p.eventType === 'turnover');
  if (turnovers.length > 4) {
    predictions.push({ type: 'fatigue', confidence: 0.6, window: 'next 8 min' });
  }
  return predictions;
}

const winProb = computeWinProbability(playByPlay, lineup, momentum);
const keyEvents = predictKeyEvents(playByPlay);

const prediction = {
  id: 'ip_' + Buffer.from(eventId).toString('base64').slice(0, 12),
  eventId,
  sport,
  gameStatus,
  winProbability: winProb,
  keyEventPredictions: keyEvents,
  momentum,
  timeRemaining,
  playCount: playByPlay.length,
  modelVersion: 'v7-ingame',
  generatedAt: new Date().toISOString(),
  source: 'algorithmic',
};

store.predictions.push(prediction);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: prediction }));
`;

const INGAME_PREDICTIVE_INPUT = {
  type: 'object',
  properties: {
    event: SchemaProps.text({ description: 'Event/game identifier' }),
    sport: SchemaProps.text({ description: 'Sport context', default: 'generic' }),
    gameStatus: SchemaProps.select(['in-progress', 'halftime', 'overtime'], { description: 'Current game status' }),
    playByPlay: SchemaProps.objectArray({
      type: 'object',
      properties: {
        time: SchemaProps.text({ description: 'Timestamp or game clock' }),
        quarter: SchemaProps.number({ description: 'Quarter or period number' }),
        eventType: SchemaProps.text({ description: 'Type of play' }),
        scoringTeam: SchemaProps.text({ description: 'Team that scored' }),
        points: SchemaProps.number({ description: 'Points scored' }),
      },
    }, { description: 'Live play-by-play data' }),
    lineup: SchemaProps.object({
      homeAdvantage: SchemaProps.boolean({ description: 'Home court/field advantage' }),
      keyPlayer: SchemaProps.text({ description: 'Key player currently on field' }),
    }, { description: 'Current lineup information' }),
    momentum: SchemaProps.select(['strong', 'neutral', 'weak'], { description: 'Current momentum', default: 'neutral' }),
    timeRemaining: SchemaProps.text({ description: 'Time remaining in game' }),
  },
  required: ['event'],
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

export const INGAME_PREDICTIVE_MODELING = createCodeSkill({
  id: 'sports-ingame-predictive-modeling',
  name: 'In-Game Predictive Modeling',
  description: 'Predicts win probabilities and key in-game events from live play-by-play data, lineup information, and momentum signals during an active game.',
  tier: 'advise',
  domainKnowledge: 'Live sports predictive modeling, win probability estimation, momentum signal interpretation, and lineup impact analysis',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: INGAME_PREDICTIVE_SOURCE,
  },
  inputSchema: INGAME_PREDICTIVE_INPUT,
  outputSchema: CODE_OUTPUT,
  triggers: [
    { kind: 'event', on: 'Game in progress' },
  ],
isSkill: false,
});
