// @ts-nocheck
import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps } from '../code-skill-factory';
import { sportsResultSchema, SPORTS_PERFORMANCE_SAFETY_BOUNDARY } from './sports-contract';

const BATTLECARD_CREATOR_INPUT = {
  type: 'object',
  properties: {
    entity: SchemaProps.text({ description: 'Team identifier' }),
    opponent: SchemaProps.text({ description: 'Opponent team identifier' }),
    sport: SchemaProps.text({ description: 'Sport context' }),
    situation: SchemaProps.select(['neutral', 'home-advantage', 'away-pressure', 'playoff', 'elimination'], { description: 'Game situation', default: 'neutral' }),
    formation: SchemaProps.text({ description: 'Offensive formation', default: 'standard' }),
    defensiveScheme: SchemaProps.text({ description: 'Defensive scheme', default: 'standard' }),
    offensiveScheme: SchemaProps.text({ description: 'Offensive scheme', default: 'standard' }),
    keyMatchups: SchemaProps.objectArray({
      type: 'object',
      properties: {
        player: SchemaProps.text({ description: 'Player name' }),
        opponentPlayer: SchemaProps.text({ description: 'Opponent player name' }),
        advantage: SchemaProps.select(['advantage', 'disadvantage', 'even'], { description: 'Matchup advantage' }),
        strategy: SchemaProps.text({ description: 'Matchup strategy' }),
        notes: SchemaProps.text({ description: 'Additional notes' }),
      },
    }, { description: 'Key individual matchups' }),
    situationalPlays: SchemaProps.objectArray({
      type: 'object',
      properties: {
        description: SchemaProps.text({ description: 'Play description' }),
        situation: SchemaProps.text({ description: 'When to use' }),
      },
    }, { description: 'Situational plays' }),
  },
  required: ['entity', 'opponent'],
};

export const BATTLECARD_CREATOR = createDeclarativeCodeSkill({
  id: 'sports-battlecard-creator',
  name: 'Game Plan & Opposition Battlecard Creator',
  description: 'Aid tool that compiles opponent scout reports, situational playbooks, and key matchup cheat sheets. Connects to StatsPerform and Opta for opposition data; falls back to local data when API is unavailable.',
  persistenceEnvVar: 'SPORTS_GROUP_A_HOME',
  inputSchema: BATTLECARD_CREATOR_INPUT,
  outputSchema: sportsResultSchema('Battlecard result'),
  tier: 'aid',
  domainKnowledge: 'Sports scouting, opposition analysis, situational playbook creation',
  triggers: [
    { kind: 'event', on: 'Match calendar entering pre-match window' },
  ],
  isSkill: false,
  manifest: {
    configSchema: {
      type: 'object',
      properties: {
        dataProvider: SchemaProps.select(['statsperform', 'opta', 'both'], { description: 'Primary data provider', default: 'both' }),
        confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before sending', default: true }),
        dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
        defaultFormation: SchemaProps.text({ description: 'Default formation' }),
        refreshInterval: SchemaProps.number({ description: 'Data refresh interval in minutes', default: 60 }),
      },
    }
  },
  handler: async function handler(input, ctx) {
      const entity = input.entity || input.teamId || '';
      const opponent = input.opponent || input.opponentId || '';
      const sport = input.sport || 'generic';

      let store = { cards: [], lastUpdated: new Date().toISOString() };
      store = ctx.store.load('battlecard-archives', []);

      const statsApi = process.env.SPORTS_PERFORM_API || process.env.OPTA_API_URL || '';
      const requestTimeoutMs = Number(process.env.SPORTS_REQUEST_TIMEOUT_MS) || 10000;

      async function fetchStatsData(apiUrl) {
        if (!apiUrl) {
          return { ok: false, status: 'not-configured', data: null, error: 'SPORTS_PERFORM_API and OPTA_API_URL not set' };
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

      const statsResult = await fetchStatsData(statsApi);
      const dataConnected = statsResult.ok === true;

      const situation = input.situation || 'neutral';
      const keyMatchups = Array.isArray(input.keyMatchups) ? input.keyMatchups : [];
      const situationalPlays = Array.isArray(input.situationalPlays) ? input.situationalPlays : [];

      const matchupCheatSheet = keyMatchups.map((m, i) => ({
        id: 'mm_' + i,
        player: m.player || 'TBD',
        opponentPlayer: m.opponentPlayer || 'TBD',
        advantage: m.advantage || 'even',
        strategy: m.strategy || 'Standard matchup protocol',
        notes: m.notes || '',
      }));

      const playbook = {
        entity,
        opponent,
        sport,
        situation,
        dataProvider: dataConnected ? 'connected' : 'local-fallback',
        keyMatchups: matchupCheatSheet,
        situationalPlays: situationalPlays.map((p, i) => ({ id: 'sp_' + i, ...(typeof p === 'string' ? { description: p } : p) })),
        formation: input.formation || 'standard',
        defensiveScheme: input.defensiveScheme || 'standard',
        offensiveScheme: input.offensiveScheme || 'standard',
      };

      playbook.id = 'bpc_' + Buffer.from(entity + opponent + situation).toString('base64').slice(0, 12);
      playbook.generatedAt = new Date().toISOString();
      playbook.source = dataConnected ? 'api-connected' : 'local';
      playbook.connectivityStatus = statsResult.status;

      store.cards.push(playbook);
      ctx.store.save('battlecard-archives', store);
    }
  });
BATTLECARD_CREATOR.configSchema = {
      type: 'object',
      properties: {
        dataProvider: SchemaProps.select(['statsperform', 'opta', 'both'], { description: 'Primary data provider', default: 'both' }),
        confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before sending', default: true }),
        dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
        defaultFormation: SchemaProps.text({ description: 'Default formation' }),
        refreshInterval: SchemaProps.number({ description: 'Data refresh interval in minutes', default: 60 }),
      },
    };
