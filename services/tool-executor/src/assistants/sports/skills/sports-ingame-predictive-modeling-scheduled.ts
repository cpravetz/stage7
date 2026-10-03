import { createDeclarativeCodeSkill, SchemaProps } from '../../../adk/code-skill-factory';
import { sportsResultSchema } from '../sports-contract';

/**
 * Scheduled half of the sports ingame-modeling split.
 *
 * The scope is the point of this Skill. `anyOf` in configSchema requires at
 * least one of matchIds / teams / sports, so it cannot be configured to watch
 * every live game; the handler additionally refuses to run when none of them
 * resolved, rather than quietly modelling everything.
 */
const SPORTS_INGAME_PREDICTIVE_MODELING_SCHEDULED = createDeclarativeCodeSkill({
  id: 'sports-ingame-predictive-modeling-scheduled',
  name: 'In-Game Predictive Modeling (Scoped)',
  description: 'Watches the configured matches, teams, or sports and reports win-probability movement.',
  persistenceEnvVar: 'SPORTS_GROUP_B_HOME',
  tier: 'advise',
  domainKnowledge: 'Live sports predictive modeling, win probability estimation, momentum signal interpretation, and lineup impact analysis',
  inputSchema: {
    type: 'object',
    properties: {
      runReason: SchemaProps.text({ description: 'Why this run was invoked (schedule, event, manual)' }),
    },
  },
  outputSchema: sportsResultSchema('Scoped in-game prediction result'),
  configSchema: {
    type: 'object',
    properties: {
      sports: { type: 'array', items: { type: 'string' }, description: 'Sports to watch, e.g. nba, nfl' },
      teams: { type: 'array', items: { type: 'string' }, description: 'Specific teams to watch' },
      matchIds: { type: 'array', items: { type: 'string' }, description: 'Specific matches to watch' },
      dateRange: {
        type: 'object',
        properties: { from: { type: 'string' }, to: { type: 'string' } },
        description: 'Restrict to matches in this window',
      },
      cadence: { type: 'string', description: 'Cron expression or schedule id for this run' },
    },
    // Any one of these bounds the run. The original Skill had no config at all,
    // so nothing stopped it from ranging over every live game.
    anyOf: [{ required: ['matchIds'] }, { required: ['teams'] }, { required: ['sports'] }],
    additionalProperties: false,
  },
  triggers: [
    { kind: 'schedule', cadence: 'Every 5 minutes during configured windows' },
  ],
  isSkill: true,
  manifest: {},
  handler: async function handler(input, ctx) {
    const sports = Array.isArray(ctx.config?.sports) ? (ctx.config!.sports as unknown[]).map(String) : [];
    const teams = Array.isArray(ctx.config?.teams) ? (ctx.config!.teams as unknown[]).map(String) : [];
    const matchIds = Array.isArray(ctx.config?.matchIds) ? (ctx.config!.matchIds as unknown[]).map(String) : [];
    const dateRange = (ctx.config?.dateRange ?? null) as { from?: string; to?: string } | null;
    const cadence = typeof ctx.config?.cadence === 'string' ? ctx.config.cadence : null;
    const runReason = typeof input?.runReason === 'string' ? input.runReason : 'schedule';

    if (!sports.length && !teams.length && !matchIds.length) {
      // The schema should already have rejected this, but config can be edited
      // out of band. An unscoped predictive model is the exact case the split
      // was meant to prevent, so refuse rather than default to everything.
      return {
        success: false,
        error:
          'No scope configured: set at least one of matchIds, teams, or sports. Refusing to model every live game.',
        present: [
          ctx.render.text('notice', 'No scope configured', 'Set at least one of matchIds, teams, or sports before this Skill can run.'),
        ],
      };
    }

    const defaults = { predictions: [], lastUpdated: new Date().toISOString() };
    const loaded = ctx.store.load('ingame-predictions', defaults);
    const store = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? { ...defaults, ...loaded } : defaults;

    const games = ctx.store.load('live-games', []);
    const liveGames = Array.isArray(games) ? games : [];

    const inScope = liveGames.filter((game) => {
      if (!game) return false;
      const id = String(game.gameId || game.id || '');
      if (matchIds.length && matchIds.includes(id)) return true;
      if (teams.length) {
        const participants = [game.homeTeam, game.awayTeam].map((t: unknown) => String(t || ''));
        if (teams.some((t) => participants.includes(t))) return true;
      }
      if (sports.length && sports.includes(String(game.sport || ''))) return true;
      return false;
    });

    const previous = new Map<string, number>(
      (Array.isArray(store.predictions) ? store.predictions : []).map(
        (p: Record<string, any>) => [String(p.gameId ?? ''), Number(p.winProbability ?? 0)],
      ),
    );

    const scopedPredictions = inScope.map((game) => {
      const gameId = String(game.gameId || game.id || '');
      const momentum = String(game.momentum || 'neutral');
      let winProbability = 0.5;
      if (game.lineup?.homeAdvantage) winProbability += 0.05;
      if (momentum === 'strong') winProbability += 0.08;
      else if (momentum === 'weak') winProbability -= 0.08;
      winProbability = Math.max(0.05, Math.min(0.95, winProbability));
      const prior = previous.has(gameId) ? previous.get(gameId)! : null;
      return {
        gameId,
        sport: game.sport ?? null,
        momentum,
        winProbability: Number(winProbability.toFixed(3)),
        // null on first sight, so a "movement" is never invented for a game the
        // Skill has not seen before.
        delta: prior === null ? null : Number((winProbability - prior).toFixed(3)),
      };
    });

    const merged = [
      ...(Array.isArray(store.predictions) ? store.predictions : []).filter(
        (p: Record<string, any>) => !scopedPredictions.some((n: { gameId: string }) => n.gameId === String(p.gameId ?? '')),
      ),
      ...scopedPredictions,
    ];
    store.predictions = merged;
    store.lastUpdated = new Date().toISOString();
    ctx.store.save('ingame-predictions', store);

    const result = {
      scope: { sports, teams, matchIds, dateRange },
      cadence,
      runReason,
      gamesWatched: liveGames.length,
      gamesInScope: scopedPredictions.length,
      movements: scopedPredictions.filter((p) => p.delta !== null && Math.abs(p.delta) > 0.01).length,
      predictions: scopedPredictions,
      method: 'momentum-and-lineup-heuristic',
      disclaimer: 'Heuristic estimate from momentum and lineup signals, not a betting recommendation.',
    };

    return {
      success: true,
      data: result,
      present: [
        ctx.render.text(
          'report',
          'In-Game Predictions',
          `${scopedPredictions.length} of ${liveGames.length} live game(s) matched the configured scope; ${result.movements} moved more than 1 point.`,
        ),
      ],
    };
  },
});

export { SPORTS_INGAME_PREDICTIVE_MODELING_SCHEDULED };