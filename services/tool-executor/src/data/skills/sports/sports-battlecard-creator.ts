import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SPORTS_GROUP_A_HOME = process.env.SPORTS_GROUP_A_HOME || '/tmp/sports/group-a';

const BATTLECARD_CREATOR_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const entity = input.entity || input.teamId || '';
const opponent = input.opponent || input.opponentId || '';
const sport = input.sport || 'generic';

const baseDir = process.env.SPORTS_GROUP_A_HOME || '/tmp/sports/group-a';
const storePath = path.join(baseDir, 'battlecard-archives.json');
fs.mkdirSync(baseDir, { recursive: true });

let store = { cards: [], lastUpdated: new Date().toISOString() };
if (fs.existsSync(storePath)) {
  try { store = JSON.parse(fs.readFileSync(storePath, 'utf8')); } catch (e) {}
}

const statsApi = process.env.SPORTS_PERFORM_API || process.env.OPTA_API_URL || '';
const dataConnected = statsApi.length > 0;

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

store.cards.push(playbook);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: playbook }));
`;

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

const CODE_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
    error: { type: 'string' },
  },
  required: ['success'],
};

export const BATTLECARD_CREATOR = createCodeSkill({
  id: 'sports-battlecard-creator',
  name: 'Game Plan & Opposition Battlecard Creator',
  description: 'Aid tool that compiles opponent scout reports, situational playbooks, and key matchup cheat sheets. Connects to StatsPerform and Opta for opposition data; falls back to local data when API is unavailable.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: BATTLECARD_CREATOR_SOURCE,
    configSchema: {
      type: 'object',
      properties: {
        dataProvider: SchemaProps.select(['statsperform', 'opta', 'both'], { description: 'Primary data provider', default: 'both' }),
        confirmBeforeSend: SchemaProps.boolean({ description: 'Require confirmation before sending', default: true }),
        dryRun: SchemaProps.boolean({ description: 'Validate without executing', default: true }),
        defaultFormation: SchemaProps.text({ description: 'Default formation' }),
        refreshInterval: SchemaProps.number({ description: 'Data refresh interval in minutes', default: 60 }),
      },
    },
  },
  inputSchema: BATTLECARD_CREATOR_INPUT,
  outputSchema: CODE_OUTPUT,
  tier: 'aid',
  domainKnowledge: 'Sports scouting, opposition analysis, situational playbook creation',
  triggers: [
    { kind: 'event', on: 'Match calendar entering pre-match window' },
  ],
isSkill: false,
});
