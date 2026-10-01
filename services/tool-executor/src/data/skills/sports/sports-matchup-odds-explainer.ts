// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';
import { sportsResultSchema, SPORTS_WAGERING_SAFETY_BOUNDARY } from './sports-contract';

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

export const MATCHUP_ODDS_EXPLAINER = createDeclarativeCodeSkill({
  id: 'sports-matchup-odds-explainer',
  name: 'Matchup & Odds Explainer',
  description: 'Advises on market odds, line movements, and statistical match-ups with mandatory responsible-play framing. Insights are strictly entertainment and expected-value math. Includes responsible-gaming disclaimers on every output.',
  persistenceEnvVar: 'SPORTS_GROUP_B_HOME',
  inputSchema: MATCHUP_ODDS_INPUT,
  outputSchema: sportsResultSchema('Odds explanation result'),
  tier: 'advise',
  domainKnowledge: 'Sports odds analysis, implied probability, line movement, expected value',
  triggers: [
    { kind: 'event', on: 'Odds become available or line movement detected' },
  ],
  isSkill: false,
  manifest: {
    configSchema: {
      type: 'object',
      properties: {
        oddsProvider: SchemaProps.select(['oddsdata', 'pinnacle', 'both'], { description: 'Odds data provider', default: 'both' }),
      },
    }
  },
  handler: async function handler(input, ctx) {
      const eventId = input.event || input.gameId || '';
      const teamA = input.teamA || 'Team A';
      const teamB = input.teamB || 'Team B';
      const sport = input.sport || 'generic';

      let store = { analyses: [], lastUpdated: new Date().toISOString() };
      store = ctx.store.load('matchup-odds', []);

      const oddsApi = process.env.ODDS_DATA_API_URL || '';
      const requestTimeoutMs = Number(process.env.SPORTS_REQUEST_TIMEOUT_MS) || 10000;

      async function fetchSportsbookOdds(apiUrl, event) {
        if (!apiUrl) {
          return { ok: false, status: 'not-configured', data: null, error: 'ODDS_DATA_API_URL not set' };
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
        try {
          const url = apiUrl + (apiUrl.endsWith('/') ? '' : '/') + 'events/' + encodeURIComponent(event) + '/odds';
          const res = await fetch(url, { signal: controller.signal });
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

      const oddsResult = await fetchSportsbookOdds(oddsApi, eventId);

      let oddsA = Number(input.oddsA) || 1.0;
      let oddsB = Number(input.oddsB) || 1.0;
      let drawOdds = Number(input.drawOdds) || null;

      if (oddsResult.ok && oddsResult.data) {
        oddsA = Number(oddsResult.data.oddsA) || oddsA;
        oddsB = Number(oddsResult.data.oddsB) || oddsB;
        drawOdds = oddsResult.data.drawOdds ? Number(oddsResult.data.drawOdds) : drawOdds;
      }

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

      const sourceLabel = oddsResult.ok ? 'odds-api' : 'algorithmic';

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
        source: sourceLabel,
        connectivityStatus: oddsResult.status,
      };

      store.analyses.push(analysis);
      ctx.store.save('matchup-odds', store);
    }
  });
MATCHUP_ODDS_EXPLAINER.configSchema = {
      type: 'object',
      properties: {
        oddsProvider: SchemaProps.select(['oddsdata', 'pinnacle', 'both'], { description: 'Odds data provider', default: 'both' }),
      },
    };
