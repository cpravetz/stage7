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

      const defaults = { cards: [], lastUpdated: new Date().toISOString() };
      // Keep the shape used below: a bare `[]` fallback made `store.cards` undefined
      // on a cold store and threw instead of creating the first card.
      const loaded = ctx.store.load('battlecard-archives', defaults);
      const store = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? { ...defaults, ...loaded } : defaults;

      const statsApi = String(ctx.config?.statsEndpoint || '');
      const statsKey = ctx.getCredential ? ctx.getCredential('statsApiKey') : undefined;
      const requestTimeoutMs = Number(ctx.config?.requestTimeoutMs) || 10000;

      async function fetchStatsData(apiUrl) {
        if (!apiUrl) {
          return { ok: false, status: 'not-configured', data: null, error: 'No stats provider configured: set statsEndpoint in this Skill\'s configuration' };
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

      // The battlecard was built and archived but never returned, so the Skill
      // produced no output at all while appearing to succeed. Report it, and say
      // when it came from local input rather than the configured stats provider.
      const summaryLines = [
        'Battlecard for ' + entity + ' vs ' + opponent,
        'Situation: ' + situation + ' | formation: ' + playbook.formation,
        'Offense ' + playbook.offensiveScheme + ' / defense ' + playbook.defensiveScheme,
        'Key matchups: ' + playbook.keyMatchups.length + ' | situational plays: ' + playbook.situationalPlays.length,
      ];
      if (!dataConnected) {
        summaryLines.push('Stats source: local input only - no stats provider configured (set statsEndpoint in this Skill\'s configuration).');
      }
      if (ctx.config?.dryRun === true) summaryLines.push('Dry run: the battlecard was generated and archived, nothing was sent.');

      return {
        success: true,
        status: 'ok',
        data: { playbook: playbook, cards: store.cards, storePath: ctx.store.getFilePath('battlecard-archives') },
        source: playbook.source,
        connectivityStatus: statsResult.status,
        error: null,
        present: [ctx.render.text('battlecard', 'Battlecard', summaryLines.join('\n'))],
      };
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
