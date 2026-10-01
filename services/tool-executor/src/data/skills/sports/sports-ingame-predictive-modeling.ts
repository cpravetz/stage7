// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';
import { sportsResultSchema, SPORTS_WAGERING_SAFETY_BOUNDARY } from './sports-contract';

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

export const INGAME_PREDICTIVE_MODELING = createDeclarativeCodeSkill({
  id: 'sports-ingame-predictive-modeling',
  name: 'In-Game Predictive Modeling',
  description: 'Predicts win probabilities and key in-game events from live play-by-play data, lineup information, and momentum signals during an active game.',
  persistenceEnvVar: 'SPORTS_GROUP_B_HOME',
  tier: 'advise',
  domainKnowledge: 'Live sports predictive modeling, win probability estimation, momentum signal interpretation, and lineup impact analysis',
  inputSchema: INGAME_PREDICTIVE_INPUT,
  outputSchema: sportsResultSchema('In-game prediction result'),
  triggers: [
    { kind: 'event', on: 'Game in progress' },
  ],
  isSkill: false,
  manifest: {},
  handler: async function handler(input, ctx) {
      const eventId = input.event || input.gameId || '';
      const sport = input.sport || 'generic';
      const gameStatus = input.gameStatus || 'in-progress';

      let store = { predictions: [], lastUpdated: new Date().toISOString() };
      store = ctx.store.load('ingame-predictions', []);

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
      ctx.store.save('ingame-predictions', store);
      return { success: true, data: prediction, present: [{ id: 'report', title: 'In-Game Prediction', kind: 'text', body: 'Win probability: ' + (prediction.winProbability * 100).toFixed(1) + '%. Key events: ' + prediction.keyEventPredictions.length }] };
    }
  });
