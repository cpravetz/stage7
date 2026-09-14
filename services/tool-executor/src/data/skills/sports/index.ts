import { Tool } from '../../../types';
import { createCodeSkill, createExternalActionSkill } from '../code-skill-factory';

const SPORTS_SKILLS: Tool[] = [
  createCodeSkill({
    id: 'createCodeSkill',
    name: 'Create Code Skill',
    description: 'Perform deterministic statistical sports matchup analysis with Monte Carlo simulation, team strength ratings, injury impact, weather effects, and betting line evaluation.',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `const input = __tool_input || {};

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function mulberry32(a) {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seededHash(str) {
  var h = 2166136261;
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

var sportLower = (input.sport || '').toLowerCase();
var teams = Array.isArray(input.teams) ? input.teams : [];
var venue = input.venue || 'neutral';
var gameDate = input.date || new Date().toISOString();
var weather = input.weather || {};
var bettingLines = input.bettingLines || {};

var teamA = teams[0] || { name: 'Team A', stats: {}, roster: [], injuries: [], homeAway: 'neutral' };
var teamB = teams[1] || { name: 'Team B', stats: {}, roster: [], injuries: [], homeAway: 'neutral' };
var nameA = teamA.name || 'Team A';
var nameB = teamB.name || 'Team B';

var RNG = mulberry32(seededHash(nameA + '-' + nameB + '-' + (input.date || 'default')));

var sportMetrics = {
  basketball: { efficiencyWeight: 0.30, paceWeight: 0.15, shootingWeight: 0.25, reboundWeight: 0.10, assistWeight: 0.10, turnoverWeight: 0.10, scoreScale: 1.5, weatherImmune: true, keyStat: 'points' },
  football: { efficiencyWeight: 0.25, paceWeight: 0.10, shootingWeight: 0.05, reboundWeight: 0.05, assistWeight: 0.05, turnoverWeight: 0.15, scoreScale: 7.0, weatherImmune: false, keyStat: 'points' },
  baseball: { efficiencyWeight: 0.20, paceWeight: 0.10, shootingWeight: 0.20, reboundWeight: 0.05, assistWeight: 0.05, turnoverWeight: 0.10, scoreScale: 4.5, weatherImmune: false, keyStat: 'runs' },
  soccer: { efficiencyWeight: 0.30, paceWeight: 0.15, shootingWeight: 0.15, reboundWeight: 0.05, assistWeight: 0.10, turnoverWeight: 0.10, scoreScale: 2.5, weatherImmune: false, keyStat: 'goals' }
};
var metrics = sportMetrics[sportLower] || sportMetrics.basketball;

function calcEfficiency(stats) {
  var offEff = 0, defEff = 0;
  if (stats.offensiveRating) offEff = clamp(stats.offensiveRating / 110, 0, 1.5);
  if (stats.defensiveRating) defEff = clamp(1.3 - (stats.defensiveRating / 110), 0, 1.5);
  if (stats.pointsPerGame) offEff = Math.max(offEff, clamp(stats.pointsPerGame / 110, 0, 1.5));
  if (stats.oppPointsPerGame) defEff = Math.max(defEff, clamp(120 - stats.oppPointsPerGame / 8, 0, 1.5));
  return { offEff: offEff, defEff: defEff, combined: offEff * 0.5 + defEff * 0.5 };
}

function calcPace(stats) {
  if (stats.pace) return clamp(stats.pace / 100, 0.3, 1.7);
  if (stats.possessionsPerGame) return clamp(stats.possessionsPerGame / 100, 0.3, 1.7);
  return 1.0;
}

function calcShooting(stats) {
  var fg = stats.fieldGoalPct || stats.fgPct || stats.shootingPct || 0.45;
  var tp = stats.threePointPct || stats.tpPct || 0.35;
  var ft = stats.freeThrowPct || stats.ftPct || 0.75;
  return clamp(fg * 0.5 + tp * 0.3 + ft * 0.2, 0.2, 0.8);
}

function calcTeamStrength(team) {
  var stats = team.stats || {};
  var eff = calcEfficiency(stats);
  var pace = calcPace(stats);
  var shooting = calcShooting(stats);
  var reb = stats.reboundsPerGame ? clamp(stats.reboundsPerGame / 50, 0.3, 1.5) : 1.0;
  var ast = stats.assistsPerGame ? clamp(stats.assistsPerGame / 28, 0.3, 1.5) : 1.0;
  var tov = stats.turnoversPerGame ? clamp(1.2 - (stats.turnoversPerGame / 18), 0.3, 1.5) : 1.0;
  var strength = eff.combined * metrics.efficiencyWeight + pace * metrics.paceWeight + shooting * metrics.shootingWeight + reb * metrics.reboundWeight + ast * metrics.assistWeight + tov * metrics.turnoverWeight;
  return { offEff: eff.offEff, defEff: eff.defEff, pace: pace, shooting: shooting, reb: reb, ast: ast, tov: tov, strength: clamp(strength, 0.2, 2.0) };
}

var strengthA = calcTeamStrength(teamA);
var strengthB = calcTeamStrength(teamB);

var h2h = [];
if (Array.isArray(input.headToHead) && input.headToHead.length > 0) {
  h2h = input.headToHead.map(function(g) {
    var date = new Date(g.date || '2000-01-01');
    var now = new Date(gameDate);
    var daysAgo = Math.max(1, (now - date) / 86400000);
    var recencyWeight = 1.0 / Math.log10(daysAgo + 2);
    var winner = g.winner || (g.scoreA > g.scoreB ? nameA : g.scoreB > g.scoreA ? nameB : null);
    return { date: g.date || '', winner: winner, scoreA: g.scoreA || 0, scoreB: g.scoreB || 0, recencyWeight: recencyWeight, totalWeight: recencyWeight };
  });
}
var totalH2HWeight = h2h.reduce(function(s, g) { return s + g.totalWeight; }, 0) || 1;
var h2hWinsA = h2h.filter(function(g) { return g.winner === nameA; }).reduce(function(s, g) { return s + g.totalWeight; }, 0);
var h2hWinsB = h2h.filter(function(g) { return g.winner === nameB; }).reduce(function(s, g) { return s + g.totalWeight; }, 0);
var h2hEdgeA = totalH2HWeight > 0 ? h2hWinsA / totalH2HWeight : 0.5;
var h2hEdgeB = totalH2HWeight > 0 ? h2hWinsB / totalH2HWeight : 0.5;

function calcHomeAway(team) {
  var ha = (team.homeAway || 'neutral').toLowerCase();
  if (ha === 'home') return 1.12;
  if (ha === 'away') return 0.88;
  return 1.0;
}
var homeFactorA = calcHomeAway(teamA);
var homeFactorB = calcHomeAway(teamB);
var venueAdjustment = 1.0;
if (venue && venue.toLowerCase() === 'neutral') { venueAdjustment = 1.0; }
else if (venue) {
  var venueHist = (input.venueHistory || {})[venue] || {};
  if (venueHist.homeAdvantage) venueAdjustment = venueHist.homeAdvantage;
}

function calcInjuryImpact(team) {
  var injuries = Array.isArray(team.injuries) ? team.injuries : [];
  if (injuries.length === 0) return { impact: 0, keyPlayersOut: [], severity: 'none' };
  var totalImpact = 0;
  var keyOut = [];
  injuries.forEach(function(inj) {
    var roleWeight = inj.role === 'star' ? 0.35 : inj.role === 'starter' ? 0.20 : inj.role === 'key' ? 0.15 : 0.08;
    var severityWeight = inj.severity === 'out' ? 1.0 : inj.severity === 'questionable' ? 0.5 : inj.severity === 'probable' ? 0.2 : 0.1;
    var impact = roleWeight * severityWeight;
    totalImpact += impact;
    if (inj.role === 'star' || inj.role === 'starter' || inj.role === 'key') {
      keyOut.push({ name: inj.name || 'Unknown', role: inj.role || 'bench', severity: inj.severity || 'out', impact: impact });
    }
  });
  return { impact: clamp(totalImpact, 0, 0.5), keyPlayersOut: keyOut, severity: totalImpact > 0.3 ? 'high' : totalImpact > 0.15 ? 'medium' : 'low' };
}
var injuryA = calcInjuryImpact(teamA);
var injuryB = calcInjuryImpact(teamB);

function calcRestFatigue(team) {
  var restDays = team.restDays != null ? team.restDays : 3;
  var gamesLast10 = team.gamesLast10 || 8;
  var travelMiles = team.travelMiles || 0;
  var restFactor = clamp(restDays / 4, 0.5, 1.3);
  var fatigueFactor = clamp(1.0 - (gamesLast10 - 5) * 0.03, 0.7, 1.1);
  var travelFactor = clamp(1.0 - travelMiles / 3000, 0.8, 1.1);
  return { restFactor: restFactor, fatigueFactor: fatigueFactor, travelFactor: travelFactor, combined: restFactor * fatigueFactor * travelFactor };
}
var restA = calcRestFatigue(teamA);
var restB = calcRestFatigue(teamB);

function calcWeatherImpact() {
  if (metrics.weatherImmune) return { impact: 0, factors: {} };
  var wind = weather.wind || 0;
  var temp = weather.temperature != null ? weather.temperature : 70;
  var precip = (weather.precipitation || '').toLowerCase();
  var windImpact = clamp(wind / 50, 0, 0.15);
  var tempImpact = Math.abs(temp - 65) / 200;
  var precipImpact = (precip === 'rain' || precip === 'snow') ? 0.10 : (precip === 'sleet') ? 0.12 : 0;
  var totalImpact = windImpact + tempImpact + precipImpact;
  return { impact: clamp(totalImpact, 0, 0.3), factors: { wind: windImpact, temperature: tempImpact, precipitation: precipImpact, windSpeed: wind, temperatureValue: temp, precipitationType: precip } };
}
var weatherImpact = calcWeatherImpact();

var coachingA = (teamA.coaching || {}).tendency || 'balanced';
var coachingB = (teamB.coaching || {}).tendency || 'balanced';
var styleClash = {
  offensiveA: (teamA.coaching && teamA.coaching.offensiveStyle) || 'motion',
  defensiveA: (teamA.coaching && teamA.coaching.defensiveStyle) || 'switch',
  offensiveB: (teamB.coaching && teamB.coaching.offensiveStyle) || 'iso',
  defensiveB: (teamB.coaching && teamB.coaching.defensiveStyle) || 'zone',
};
var styleAdvantage = 0;
var clashPairs = [ ['motion', 'iso'], ['pace', 'slow'], ['shoot', 'paint'], ['switch', 'zone'], ['spread', 'stack'] ];
if (clashPairs.some(function(p) { return (p[0] === styleClash.offensiveA && p[1] === styleClash.defensiveB) || (p[1] === styleClash.offensiveA && p[0] === styleClash.defensiveB); })) { styleAdvantage += 0.04; }
if (clashPairs.some(function(p) { return (p[0] === styleClash.offensiveB && p[1] === styleClash.defensiveA) || (p[1] === styleClash.offensiveB && p[0] === styleClash.defensiveA); })) { styleAdvantage -= 0.04; }
if (coachingA === 'aggressive' && coachingB === 'conservative') styleAdvantage += 0.02;
if (coachingB === 'aggressive' && coachingA === 'conservative') styleAdvantage -= 0.02;

function calcKeyMatchups() {
  var rosterA = Array.isArray(teamA.roster) ? teamA.roster : [];
  var rosterB = Array.isArray(teamB.roster) ? teamB.roster : [];
  var matchups = [];
  var xFactorsA = rosterA.filter(function(p) { return p.role === 'star' || p.role === 'xfactor'; });
  var xFactorsB = rosterB.filter(function(p) { return p.role === 'star' || p.role === 'xfactor'; });
  xFactorsA.forEach(function(p) {
    matchups.push({ playerA: p.name || 'Unknown', playerB: rosterB.length > 0 ? rosterB[Math.floor(RNG() * rosterB.length)].name || 'Unknown' : 'TBD', xFactor: p.name || 'Unknown', impact: clamp((p.rating || 80) / 100, 0.3, 1.5) });
  });
  xFactorsB.forEach(function(p) {
    matchups.push({ playerA: rosterA.length > 0 ? rosterA[Math.floor(RNG() * rosterA.length)].name || 'Unknown' : 'TBD', playerB: p.name || 'Unknown', xFactor: p.name || 'Unknown', impact: clamp((p.rating || 80) / 100, 0.3, 1.5) });
  });
  return matchups.slice(0, 6);
}
var keyMatchups = calcKeyMatchups();

var baseA = strengthA.strength * homeFactorA * restA.combined * (1 - injuryA.impact);
var baseB = strengthB.strength * homeFactorB * restB.combined * (1 - injuryB.impact);
var h2hAdj = (h2hEdgeA - 0.5) * 0.1;
var weatherAdj = weatherImpact.impact * (teamA.homeAway === 'home' ? -0.5 : teamA.homeAway === 'away' ? 0.5 : 0);
var ratingA = baseA + h2hAdj + weatherAdj + styleAdvantage;
var ratingB = baseB - h2hAdj - weatherAdj - styleAdvantage;
var totalRating = ratingA + ratingB;
var winProbA = totalRating > 0 ? clamp(ratingA / totalRating, 0.05, 0.95) : 0.5;
var winProbB = 1 - winProbA;

var SCALE = metrics.scoreScale;
var meanSpread = (ratingA - ratingB) * SCALE * 0.8;
var meanTotal = ((strengthA.offEff + strengthB.offEff) / 2 + (strengthA.pace + strengthB.pace) / 2 + (strengthA.shooting + strengthB.shooting) / 2) * SCALE;
var stdSpread = SCALE * 0.4;
var stdTotal = SCALE * 0.3;

var NUM_SIM = 10000;
var winsA = 0, spreadCoverA = 0, totalOver = 0;
var spreadValues = [];
var totalValues = [];

for (var i = 0; i < NUM_SIM; i++) {
  var u1 = RNG(), u2 = RNG();
  var z1 = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
  var u3 = RNG(), u4 = RNG();
  var z2 = Math.sqrt(-2 * Math.log(u3 + 1e-10)) * Math.cos(2 * Math.PI * u4);
  var scoreA = meanSpread / 2 + z1 * stdSpread * 0.7;
  var scoreB = -(meanSpread / 2) + z2 * stdSpread * 0.7;
  var rawA = (scoreA + meanTotal / 2) + (RNG() - 0.5) * stdTotal;
  var rawB = (scoreB + meanTotal / 2) + (RNG() - 0.5) * stdTotal;
  var finalA = Math.max(0, rawA * SCALE / metrics.scoreScale);
  var finalB = Math.max(0, rawB * SCALE / metrics.scoreScale);
  if (finalA > finalB) winsA++;
  if (finalA - finalB > meanSpread) spreadCoverA++;
  if (finalA + finalB > meanTotal) totalOver++;
  spreadValues.push(finalA - finalB);
  totalValues.push(finalA + finalB);
}

function percentile(sorted, p) { var idx = Math.floor(sorted.length * p); return sorted[Math.min(idx, sorted.length - 1)]; }
spreadValues.sort(function(a, b) { return a - b; });
totalValues.sort(function(a, b) { return a - b; });
var spreadP05 = percentile(spreadValues, 0.05), spreadP25 = percentile(spreadValues, 0.25), spreadP50 = percentile(spreadValues, 0.50), spreadP75 = percentile(spreadValues, 0.75), spreadP95 = percentile(spreadValues, 0.95);
var totalP05 = percentile(totalValues, 0.05), totalP25 = percentile(totalValues, 0.25), totalP50 = percentile(totalValues, 0.50), totalP75 = percentile(totalValues, 0.75), totalP95 = percentile(totalValues, 0.95);
var winProbAFinal = winsA / NUM_SIM, winProbBFinal = 1 - winProbAFinal;
var spreadCoverAProb = spreadCoverA / NUM_SIM, totalOverProb = totalOver / NUM_SIM;

function ci95(mean, std, n) { return [mean - 1.96 * std / Math.sqrt(n), mean + 1.96 * std / Math.sqrt(n)]; }
var spreadCI = ci95(spreadP50, stdSpread, NUM_SIM);
var totalCI = ci95(totalP50, stdTotal, NUM_SIM);

var bettingEdge = {};
if (bettingLines.moneylineA != null && bettingLines.moneylineB != null) {
  var impliedA = 1 / (1 + bettingLines.moneylineA / 100);
  var impliedB = 1 / (1 + bettingLines.moneylineB / 100);
  bettingEdge.moneyline = { modelA: winProbAFinal, impliedA: impliedA, edgeA: winProbAFinal - impliedA, modelB: winProbBFinal, impliedB: impliedB, edgeB: winProbBFinal - impliedB, value: Math.max(Math.abs(winProbAFinal - impliedA), Math.abs(winProbBFinal - impliedB)) };
}
if (bettingLines.spread != null) {
  bettingEdge.spread = { line: bettingLines.spread, modelSpread: spreadP50, coverProb: spreadCoverAProb, edge: Math.abs(spreadP50 - bettingLines.spread) < 0.5 ? 'push' : (spreadP50 > bettingLines.spread ? 'advantage' : 'disadvantage') };
}
if (bettingLines.total != null) {
  bettingEdge.total = { line: bettingLines.total, modelTotal: totalP50, overProb: totalOverProb, edge: Math.abs(totalP50 - bettingLines.total) < 1.5 ? 'push' : (totalP50 > bettingLines.total ? 'over' : 'under') };
}

var fatigueFactorA = (1 - (restA.fatigueFactor * restA.travelFactor - 1) * 0.5);
var fatigueFactorB = (1 - (restB.fatigueFactor * restB.travelFactor - 1) * 0.5);

var analysis = {
  id: 'ms_' + seededHash(nameA + nameB + gameDate),
  sport: input.sport,
  teams: [
    { name: nameA, strengthRating: round4(strengthA.strength), offensiveEfficiency: round4(strengthA.offEff), defensiveEfficiency: round4(strengthA.defEff), pace: round4(strengthA.pace), shooting: round4(strengthA.shooting), rebounding: round4(strengthA.reb), playmaking: round4(strengthA.ast), turnoverControl: round4(strengthA.tov), homeAwayFactor: round4(homeFactorA), injuryImpact: injuryA.impact, injurySeverity: injuryA.severity, keyPlayersOut: injuryA.keyPlayersOut, restFactor: round4(restA.restFactor), fatigueFactor: round4(restA.fatigueFactor), travelFactor: round4(restA.travelFactor), scheduleStress: round4(fatigueFactorA) },
    { name: nameB, strengthRating: round4(strengthB.strength), offensiveEfficiency: round4(strengthB.offEff), defensiveEfficiency: round4(strengthB.defEff), pace: round4(strengthB.pace), shooting: round4(strengthB.shooting), rebounding: round4(strengthB.reb), playmaking: round4(strengthB.ast), turnoverControl: round4(strengthB.tov), homeAwayFactor: round4(homeFactorB), injuryImpact: injuryB.impact, injurySeverity: injuryB.severity, keyPlayersOut: injuryB.keyPlayersOut, restFactor: round4(restB.restFactor), fatigueFactor: round4(restB.fatigueFactor), travelFactor: round4(restB.travelFactor), scheduleStress: round4(fatigueFactorB) }
  ],
  headToHead: { games: h2h.length, winsA: h2hWinsA, winsB: h2hWinsB, totalWeight: totalH2HWeight, edgeA: round4(h2hEdgeA), edgeB: round4(h2hEdgeB), history: h2h },
  venue: { location: venue, homeAdvantage: round4(venueAdjustment), teamAHA: teamA.homeAway || 'neutral', teamBHA: teamB.homeAway || 'neutral' },
  weather: weatherImpact.weatherImmune ? { immune: true } : { windSpeed: weather.wind || 0, temperature: weather.temperature != null ? weather.temperature : null, precipitation: weather.precipitation || null, impact: round4(weatherImpact.impact), factors: weatherImpact.factors },
  matchupAdvantages: { styleClash: styleClash, styleAdvantage: round4(styleAdvantage), coachingTendencies: { teamA: coachingA, teamB: coachingB } },
  keyMatchups: keyMatchups,
  monteCarlo: {
    simulations: NUM_SIM,
    winProbability: { teamA: round4(winProbAFinal), teamB: round4(winProbBFinal) },
    spread: { mean: round2(meanSpread), median: round2(spreadP50), p5: round2(spreadP05), p25: round2(spreadP25), p75: round2(spreadP75), p95: round2(spreadP95), coverProbability: round4(spreadCoverAProb), confidence95: [round2(spreadCI[0]), round2(spreadCI[1])] },
    total: { mean: round2(meanTotal), median: round2(totalP50), p5: round2(totalP05), p25: round2(totalP25), p75: round2(totalP75), p95: round2(totalP95), overProbability: round4(totalOverProb), confidence95: [round2(totalCI[0]), round2(totalCI[1])] }
  },
  prediction: {
    favorite: winProbAFinal >= winProbBFinal ? nameA : nameB,
    confidence: round2(Math.max(winProbAFinal, winProbBFinal) * 100) + '%',
    expectedScore: { teamA: round2(meanTotal / 2 + meanSpread / 2), teamB: round2(meanTotal / 2 - meanSpread / 2) },
    spread: round2(meanSpread), total: round2(meanTotal),
    keyFactor: injuryA.impact > injuryB.impact ? nameA + ' injury disadvantage' : injuryB.impact > injuryA.impact ? nameB + ' injury disadvantage' : h2hEdgeA > h2hEdgeB ? 'Historical edge for ' + nameA : h2hEdgeB > h2hEdgeA ? 'Historical edge for ' + nameB : 'Venue and rest advantage'
  },
  bettingAnalysis: bettingEdge,
  deterministicSeed: seededHash(nameA + nameB + gameDate),
  createdAt: new Date().toISOString(),
  source: 'algorithmic'
};

console.log(JSON.stringify({ success: true, data: analysis }));
`,
    },
    inputSchema: {
      type: 'object',
      properties: {
        sport: { type: 'string', description: 'The sport (e.g. NBA, NFL, MLB, soccer)' },
        teams: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Team name' },
              stats: { type: 'object', description: 'Team statistical profile (offensiveRating, defensiveRating, pace, fieldGoalPct, etc.)' },
              roster: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, rating: { type: 'number' } } }, description: 'Team roster' },
              injuries: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, role: { type: 'string' }, severity: { type: 'string' } } }, description: 'Injured players' },
              homeAway: { type: 'string', enum: ['home', 'away', 'neutral'] },
              coaching: { type: 'object', properties: { tendency: { type: 'string' }, offensiveStyle: { type: 'string' }, defensiveStyle: { type: 'string' } } },
              restDays: { type: 'number' },
              gamesLast10: { type: 'number' },
              travelMiles: { type: 'number' }
            },
            required: ['name']
          },
          minItems: 2,
          maxItems: 2,
          description: 'Two competing teams'
        },
        venue: { type: 'string', description: 'Venue name' },
        date: { type: 'string', format: 'date-time', description: 'Game date (ISO 8601)' },
        weather: { type: 'object', properties: { wind: { type: 'number' }, temperature: { type: 'number' }, precipitation: { type: 'string', enum: ['none', 'rain', 'snow', 'sleet'] } }, description: 'Weather conditions' },
        bettingLines: { type: 'object', properties: { moneylineA: { type: 'number' }, moneylineB: { type: 'number' }, spread: { type: 'number' }, total: { type: 'number' } }, description: 'Current betting lines' },
        headToHead: { type: 'array', items: { type: 'object', properties: { date: { type: 'string' }, scoreA: { type: 'number' }, scoreB: { type: 'number' }, winner: { type: 'string' } } }, description: 'Historical results' },
        venueHistory: { type: 'object', properties: { homeAdvantage: { type: 'number' } } }
      },
      required: ['sport', 'teams'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        data: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            sport: { type: 'string' },
            teams: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  strengthRating: { type: 'number' },
                  offensiveEfficiency: { type: 'number' },
                  defensiveEfficiency: { type: 'number' },
                  pace: { type: 'number' },
                  shooting: { type: 'number' },
                  rebounding: { type: 'number' },
                  playmaking: { type: 'number' },
                  turnoverControl: { type: 'number' },
                  homeAwayFactor: { type: 'number' },
                  injuryImpact: { type: 'number' },
                  injurySeverity: { type: 'string' },
                  keyPlayersOut: { type: 'array' },
                  restFactor: { type: 'number' },
                  fatigueFactor: { type: 'number' },
                  travelFactor: { type: 'number' },
                  scheduleStress: { type: 'number' }
                }
              }
            },
            headToHead: { type: 'object', properties: { games: { type: 'number' }, winsA: { type: 'number' }, winsB: { type: 'number' }, edgeA: { type: 'number' }, edgeB: { type: 'number' }, history: { type: 'array' } } },
            venue: { type: 'object' },
            weather: { type: 'object' },
            matchupAdvantages: { type: 'object' },
            keyMatchups: { type: 'array', items: { type: 'object' } },
            monteCarlo: { type: 'object', properties: { simulations: { type: 'number' }, winProbability: { type: 'object' }, spread: { type: 'object' }, total: { type: 'object' } } },
            prediction: { type: 'object', properties: { favorite: { type: 'string' }, confidence: { type: 'string' }, expectedScore: { type: 'object' }, spread: { type: 'number' }, total: { type: 'number' }, keyFactor: { type: 'string' } } },
            bettingAnalysis: { type: 'object' },
            deterministicSeed: { type: 'number' },
            createdAt: { type: 'string' }
          }
        }
      },
      required: ['success', 'data'],
    },
  }),
];

const SPORTS_EXTERNAL_SKILLS: Tool[] = [
  createExternalActionSkill({
    id: 'sports-betting-risk-assessment',
    name: 'Sports Betting Risk Assessment',
    description: 'Assess betting risk on sports wagers including stake sizing, exposure, and loss probability.',
    system: 'betting-risk',
    action: 'assess-risk',
    endpoint: { envVar: 'SPORTS_BETTING_RISK_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_BETTING_RISK_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { riskModels: { type: 'array', items: { type: 'string', enum: ['var', 'expected-loss', 'bankroll-exposure', 'drawdown', 'ruin-probability'] } }, maxStakePercent: { type: 'number' }, confidenceLevel: { type: 'number' }, currency: { type: 'string' } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_BETTING_RISK_ACCESS_TOKEN', configKey: 'bettingRisk.accessToken', vaultSecretId: 'sports-betting-risk-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['assess-wager', 'portfolio-risk', 'stress-test', 'drawdown-analysis', 'ruin-probability'], description: 'The action to perform (assess-wager, portfolio-risk, stress-test, drawdown-analysis, ruin-probability).' }, stake: { type: 'number', description: 'The monetary amount wagered on a bet.' }, odds: { type: 'number', description: 'The decimal odds for the bet.' }, winProbability: { type: 'number', description: 'The estimated probability of winning the bet (0-1).' }, bankroll: { type: 'number', description: 'The total available betting bankroll.' }, wagers: { type: 'array', items: { type: 'object' }, description: 'An array of wager details for portfolio-level analysis.' }, confidenceLevel: { type: 'number', description: 'The confidence level for risk calculations (0-1).' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-odds-data-collector',
    name: 'Sports Odds Data Collector',
    description: 'Collect and aggregate sports betting odds from multiple bookmakers and exchanges.',
    system: 'odds-data',
    action: 'collect-odds',
    endpoint: { envVar: 'SPORTS_ODDS_DATA_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'SPORTS_ODDS_DATA_API_KEY' } },
    configSchema: { type: 'object', properties: { providers: { type: 'array', items: { type: 'string', enum: ['draftkings', 'fanduel', 'bet365', 'caesars', 'pointsbet', 'betmgm', 'william-hill', 'pinnacle', 'betfair', 'custom'] } }, sports: { type: 'array', items: { type: 'string' } }, leagues: { type: 'array', items: { type: 'string' } }, markets: { type: 'array', items: { type: 'string' } }, refreshIntervalSeconds: { type: 'number' }, includeHistorical: { type: 'boolean' } } },
    credentialSource: { apiKey: { envVar: 'SPORTS_ODDS_DATA_API_KEY', configKey: 'oddsData.apiKey', vaultSecretId: 'sports-odds-data-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['get-current-odds', 'get-historical-odds', 'get-odds-comparison', 'subscribe-feed', 'get-line-movements'], description: 'The action to perform (get-current-odds, get-historical-odds, get-odds-comparison, subscribe-feed, get-line-movements).' }, sport: { type: 'string', description: 'The sport to query odds for (e.g. NFL, NBA, MLB, soccer).' }, league: { type: 'string', description: 'The specific league within the sport (e.g. Premier League, NBA).' }, eventId: { type: 'string', description: 'The unique identifier for a specific event/game.' }, events: { type: 'array', items: { type: 'string' }, description: 'An array of event identifiers to retrieve odds for.' }, market: { type: 'string', description: 'The betting market type (e.g. moneyline, spread, totals).' }, bookmakers: { type: 'array', items: { type: 'string' }, description: 'An array of bookmaker names to include in the comparison.' }, since: { type: 'string', description: 'The start date/time for historical data retrieval (ISO 8601).' }, until: { type: 'string', description: 'The end date/time for historical data retrieval (ISO 8601).' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-value-betting-analyzer',
    name: 'Sports Value Betting Analyzer',
    description: 'Identify value bets by comparing model-derived fair odds against market prices.',
    system: 'value-betting',
    action: 'analyze-value',
    endpoint: { envVar: 'SPORTS_VALUE_BETTING_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_VALUE_BETTING_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { models: { type: 'array', items: { type: 'string', enum: ['elo', 'poisson', 'xg', 'monte-carlo', 'ensemble', 'custom'] } }, minEdgePercent: { type: 'number' }, maxStakePercent: { type: 'number' }, currency: { type: 'string' } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_VALUE_BETTING_ACCESS_TOKEN', configKey: 'valueBetting.accessToken', vaultSecretId: 'sports-value-betting-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['find-value', 'evaluate-bet', 'backtest-model', 'compare-models'], description: 'The action to perform (find-value, evaluate-bet, backtest-model, compare-models).' }, sport: { type: 'string', description: 'The sport to analyze for value bets.' }, eventId: { type: 'string', description: 'The unique identifier for a specific event.' }, events: { type: 'array', items: { type: 'string' }, description: 'An array of event identifiers to analyze.' }, market: { type: 'string', description: 'The betting market type to analyze.' }, model: { type: 'string', description: 'The prediction model to use (elo, poisson, xg, monte-carlo, ensemble, custom).' }, modelProbabilities: { type: 'object', description: 'An object containing model-derived probabilities for each outcome.' }, stake: { type: 'number', description: 'The wager amount to evaluate for value.' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The date range for backtesting or historical analysis.' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-odds-comparison',
    name: 'Sports Odds Comparison',
    description: 'Compare odds across bookmakers and exchanges to find the best available prices.',
    system: 'odds-comparison',
    action: 'compare-odds',
    endpoint: { envVar: 'SPORTS_ODDS_COMPARISON_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'Authorization', credentialEnvKeyMap: { apiKey: 'SPORTS_ODDS_COMPARISON_API_KEY' } },
    configSchema: { type: 'object', properties: { bookmakers: { type: 'array', items: { type: 'string' } }, exchanges: { type: 'array', items: { type: 'string' } }, includeCommission: { type: 'boolean' }, minMargin: { type: 'number' }, currency: { type: 'string' } } },
    credentialSource: { apiKey: { envVar: 'SPORTS_ODDS_COMPARISON_API_KEY', configKey: 'oddsComparison.apiKey', vaultSecretId: 'sports-odds-comparison-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['compare-event', 'compare-market', 'find-best-price', 'arbitrage-scan', 'monitor-spreads'], description: 'The action to perform (compare-event, compare-market, find-best-price, arbitrage-scan, monitor-spreads).' }, eventId: { type: 'string', description: 'The unique identifier for a specific event.' }, events: { type: 'array', items: { type: 'string' }, description: 'An array of event identifiers to compare odds for.' }, market: { type: 'string', description: 'The betting market type (e.g. moneyline, spread, totals).' }, marketType: { type: 'string', description: 'The type of market to compare (e.g. pre-game, live).' }, selection: { type: 'string', description: 'The specific selection/runner within a market (e.g. team name, player name).' }, bookmakers: { type: 'array', items: { type: 'string' }, description: 'An array of bookmaker names to compare odds from.' }, threshold: { type: 'number', description: 'The minimum odds difference or margin threshold for comparison.' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-betting-performance-analyzer',
    name: 'Sports Betting Performance Analyzer',
    description: 'Analyze betting performance including ROI, hit rate, CLV, and stake distribution.',
    system: 'betting-performance',
    action: 'analyze-performance',
    endpoint: { envVar: 'SPORTS_BETTING_PERFORMANCE_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_BETTING_PERFORMANCE_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { metrics: { type: 'array', items: { type: 'string', enum: ['roi', 'hit-rate', 'clv', 'closing-line', 'stake-distribution', 'drawdown', 'profit-factor', 'sharpe'] } }, groupBy: { type: 'array', items: { type: 'string', enum: ['sport', 'market', 'bookmaker', 'timeframe'] } }, dateRange: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } } } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_BETTING_PERFORMANCE_ACCESS_TOKEN', configKey: 'bettingPerformance.accessToken', vaultSecretId: 'sports-betting-performance-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['summary', 'breakdown', 'clv-analysis', 'stake-audit', 'report'], description: 'The action to perform (summary, breakdown, clv-analysis, stake-audit, report).' }, betIds: { type: 'array', items: { type: 'string' }, description: 'An array of specific bet identifiers to analyze.' }, filters: { type: 'object', properties: { sport: { type: 'string', description: 'The sport to filter by.' }, market: { type: 'string', description: 'The market to filter by.' }, bookmaker: { type: 'string', description: 'The bookmaker to filter by.' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The date range for filtering.' } }, description: 'An object containing filters to narrow down the analysis (sport, market, bookmaker, dateRange).' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The date range for the performance analysis.' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-bankroll-manager',
    name: 'Sports Bankroll Manager',
    description: 'Manage betting bankroll with allocation rules, sizing, and drawdown protection.',
    system: 'bankroll',
    action: 'manage-bankroll',
    endpoint: { envVar: 'SPORTS_BANKROLL_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'SPORTS_BANKROLL_API_KEY' } },
    configSchema: { type: 'object', properties: { strategy: { type: 'string', enum: ['flat', 'kelly', 'martingale', 'fibonacci', 'proportional', 'custom'] }, maxDailyLoss: { type: 'number' }, maxDailyStake: { type: 'number' }, stopLoss: { type: 'number' }, takeProfit: { type: 'number' }, maxConcurrentBets: { type: 'number' }, currency: { type: 'string' } } },
    credentialSource: { apiKey: { envVar: 'SPORTS_BANKROLL_API_KEY', configKey: 'bankroll.apiKey', vaultSecretId: 'sports-bankroll-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['allocate', 'record-result', 'get-status', 'reset-day', 'set-limits', 'history'], description: 'The action to perform (allocate, record-result, get-status, reset-day, set-limits, history).' }, bankroll: { type: 'number', description: 'The total available betting bankroll amount.' }, stake: { type: 'number', description: 'The wager amount to allocate or record.' }, outcome: { type: 'string', enum: ['win', 'loss', 'push', 'pending'], description: 'The result of the bet (win, loss, push, pending).' }, betId: { type: 'string', description: 'The unique identifier for a specific bet.' }, sport: { type: 'string', description: 'The sport associated with the bankroll activity.' }, limits: { type: 'object', description: 'An object containing bankroll limits (daily, weekly, etc.).' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The date range for history or status retrieval.' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-performance-optimizer',
    name: 'Sports Performance Optimizer',
    description: 'Optimize athlete and team performance using training load, recovery, and match data.',
    system: 'performance',
    action: 'optimize-performance',
    endpoint: { envVar: 'SPORTS_PERFORMANCE_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_PERFORMANCE_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { models: { type: 'array', items: { type: 'string', enum: ['training-load', 'recovery', 'injury-risk', 'readiness', 'periodization', 'custom'] } }, sport: { type: 'string' }, units: { type: 'string', enum: ['metric', 'imperial'] } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_PERFORMANCE_ACCESS_TOKEN', configKey: 'performance.accessToken', vaultSecretId: 'sports-performance-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['optimize-training', 'assess-readiness', 'predict-injury', 'plan-periodization', 'monitor-recovery', 'generate-workout'], description: 'The action to perform (optimize-training, assess-readiness, predict-injury, plan-periodization, monitor-recovery, generate-workout).' }, athleteId: { type: 'string', description: 'The unique identifier for a specific athlete.' }, athleteIds: { type: 'array', items: { type: 'string' }, description: 'An array of athlete identifiers to analyze.' }, teamId: { type: 'string', description: 'The unique identifier for a team.' }, sport: { type: 'string', description: 'The sport context for optimization.' }, workload: { type: 'object', description: 'An object containing training workload data.' }, recoveryMetrics: { type: 'object', description: 'An object containing recovery metrics (sleep, HRV, fatigue, etc.).' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The date range for performance data analysis.' }, targetEvent: { type: 'string', description: 'The specific target event to optimize for.' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-stats-collector',
    name: 'Sports Stats Collector',
    description: 'Collect and normalize sports statistics from official feeds, providers, and tracking systems.',
    system: 'stats',
    action: 'collect-stats',
    endpoint: { envVar: 'SPORTS_STATS_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'SPORTS_STATS_API_KEY' } },
    configSchema: { type: 'object', properties: { providers: { type: 'array', items: { type: 'string', enum: ['nba-api', 'nfl-api', 'mlb-api', 'nhl-api', 'soccer-api', 'statsport', 'chyron', 'sportradar', 'custom'] } }, sports: { type: 'array', items: { type: 'string' } }, statCategories: { type: 'array', items: { type: 'string' } }, normalize: { type: 'boolean' }, cacheTtlSeconds: { type: 'number' } } },
    credentialSource: { apiKey: { envVar: 'SPORTS_STATS_API_KEY', configKey: 'stats.apiKey', vaultSecretId: 'sports-stats-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['get-player-stats', 'get-team-stats', 'get-game-stats', 'get-leaderboard', 'get-historical', 'get-live-stats'], description: 'The action to perform (get-player-stats, get-team-stats, get-game-stats, get-leaderboard, get-historical, get-live-stats).' }, sport: { type: 'string', description: 'The sport to retrieve statistics for.' }, league: { type: 'string', description: 'The specific league within the sport.' }, eventId: { type: 'string', description: 'The unique identifier for a specific event/game.' }, events: { type: 'array', items: { type: 'string' }, description: 'An array of event identifiers to retrieve stats for.' }, playerIds: { type: 'array', items: { type: 'string' }, description: 'An array of player identifiers to retrieve stats for.' }, teamIds: { type: 'array', items: { type: 'string' }, description: 'An array of team identifiers to retrieve stats for.' }, statTypes: { type: 'array', items: { type: 'string' }, description: 'An array of statistic types to retrieve (e.g. points, rebounds, assists).' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The date range for historical stat retrieval.' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-performance-modeling',
    name: 'Sports Performance Modeling',
    description: 'Build and run statistical and ML models for athlete and team performance forecasting.',
    system: 'performance-modeling',
    action: 'run-model',
    endpoint: { envVar: 'SPORTS_PERFORMANCE_MODELING_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_PERFORMANCE_MODELING_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { modelTypes: { type: 'array', items: { type: 'string', enum: ['regression', 'classification', 'time-series', 'survival', 'monte-carlo', 'ensemble', 'deep-learning'] } }, features: { type: 'array', items: { type: 'string' } }, target: { type: 'string' }, horizon: { type: 'string' }, validation: { type: 'string', enum: ['train-test-split', 'cross-validation', 'walk-forward', 'custom'] } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_PERFORMANCE_MODELING_ACCESS_TOKEN', configKey: 'performanceModeling.accessToken', vaultSecretId: 'sports-performance-modeling-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['train-model', 'predict', 'backtest', 'feature-importance', 'evaluate', 'compare-models'], description: 'The action to perform (train-model, predict, backtest, feature-importance, evaluate, compare-models).' }, sport: { type: 'string', description: 'The sport context for the model.' }, modelType: { type: 'string', description: 'The type of statistical/ML model to use.' }, features: { type: 'array', items: { type: 'string' }, description: 'An array of feature names to use in the model.' }, target: { type: 'string', description: 'The target variable to predict.' }, trainingData: { type: 'object', description: 'An object containing the training dataset.' }, inputData: { type: 'object', description: 'An object containing input data for prediction.' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The date range for training or prediction data.' }, horizon: { type: 'number', description: 'The forecasting horizon (number of periods ahead).' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 60000,
  }),
  createExternalActionSkill({
    id: 'sports-prediction-engine',
    name: 'Sports Prediction Engine',
    description: 'Generate probabilistic predictions for sports outcomes using statistical and machine learning models.',
    system: 'prediction',
    action: 'predict-outcome',
    endpoint: { envVar: 'SPORTS_PREDICTION_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_PREDICTION_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { modelTypes: { type: 'array', items: { type: 'string', enum: ['elo', 'poisson', 'xg', 'monte-carlo', 'ensemble', 'neural-net', 'custom'] } }, confidenceThreshold: { type: 'number' }, sport: { type: 'string' }, includeMargin: { type: 'boolean' } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_PREDICTION_ACCESS_TOKEN', configKey: 'prediction.accessToken', vaultSecretId: 'sports-prediction-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['predict-outcome', 'predict-series', 'rank-teams', 'simulate-season', 'compare-models'], description: 'The action to perform (predict-outcome, predict-series, rank-teams, simulate-season, compare-models).' }, sport: { type: 'string', description: 'The sport to generate predictions for.' }, league: { type: 'string', description: 'The specific league within the sport.' }, teamA: { type: 'string', description: 'The name or identifier of the first team.' }, teamB: { type: 'string', description: 'The name or identifier of the second team.' }, eventId: { type: 'string', description: 'The unique identifier for a specific event.' }, model: { type: 'string', description: 'The prediction model to use.' }, confidenceThreshold: { type: 'number', description: 'The minimum confidence level for predictions (0-1).' }, dateRange: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The date range for prediction data.' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-responsible-gambling',
    name: 'Sports Responsible Gambling',
    description: 'Monitor and enforce responsible gambling practices including session limits, cooldowns, and user safeguards.',
    system: 'responsible-gambling',
    action: 'check-safeguards',
    endpoint: { envVar: 'SPORTS_RESPONSIBLE_GAMBLING_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_RESPONSIBLE_GAMBLING_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { dailyLossLimit: { type: 'number' }, weeklyLossLimit: { type: 'number' }, sessionTimeLimitMinutes: { type: 'number' }, cooldownPeriodHours: { type: 'number' }, selfExclusionDays: { type: 'number' }, notificationThresholds: { type: 'object' }, currency: { type: 'string' } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_RESPONSIBLE_GAMBLING_ACCESS_TOKEN', configKey: 'responsibleGambling.accessToken', vaultSecretId: 'sports-responsible-gambling-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['check-safeguards', 'set-limits', 'trigger-cooldown', 'check-exclusion', 'send-warning', 'get-status'], description: 'The action to perform (check-safeguards, set-limits, trigger-cooldown, check-exclusion, send-warning, get-status).' }, userId: { type: 'string', description: 'The unique identifier for the user.' }, stake: { type: 'number', description: 'The wager amount to evaluate against safeguards.' }, bankroll: { type: 'number', description: "The user's current bankroll amount." }, sport: { type: 'string', description: 'The sport context for the responsible gambling check.' }, timeWindow: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The time window for evaluating activity (start and end dates).' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-gambling-risk-analyzer',
    name: 'Sports Gambling Risk Analyzer',
    description: 'Analyze gambling behavior patterns to detect risk factors, addiction indicators, and financial exposure.',
    system: 'gambling-risk',
    action: 'analyze-behavior',
    endpoint: { envVar: 'SPORTS_GAMBLING_RISK_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'SPORTS_GAMBLING_RISK_API_KEY' } },
    configSchema: { type: 'object', properties: { riskThresholds: { type: 'object' }, behaviorModels: { type: 'array', items: { type: 'string', enum: ['frequency', 'chase', 'loss-chasing', 'session-length', 'deposit-pattern', 'custom'] } }, lookbackDays: { type: 'number' }, volatilityWindow: { type: 'number' } } },
    credentialSource: { apiKey: { envVar: 'SPORTS_GAMBLING_RISK_API_KEY', configKey: 'gamblingRisk.apiKey', vaultSecretId: 'sports-gambling-risk-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['analyze-behavior', 'score-user', 'detect-pattern', 'flag-risk', 'generate-report'], description: 'The action to perform (analyze-behavior, score-user, detect-pattern, flag-risk, generate-report).' }, userId: { type: 'string', description: 'The unique identifier for the user.' }, activityLog: { type: 'array', items: { type: 'object' }, description: 'An array of activity log entries for the user.' }, bets: { type: 'array', items: { type: 'object' }, description: 'An array of bet records for behavioral analysis.' }, timeWindow: { type: 'object', properties: { start: { type: 'string', description: 'The start date (ISO 8601).' }, end: { type: 'string', description: 'The end date (ISO 8601).' } }, description: 'The time window for behavioral analysis (start and end dates).' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-responsible-gambling-planner',
    name: 'Sports Responsible Gambling Planner',
    description: 'Create personalized responsible gambling intervention plans and long-term player protection strategies.',
    system: 'responsible-gambling-planning',
    action: 'plan-intervention',
    endpoint: { envVar: 'SPORTS_RESPONSIBLE_GAMBLING_PLANNER_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_RESPONSIBLE_GAMBLING_PLANNER_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { planTemplates: { type: 'array', items: { type: 'string', enum: ['standard', 'moderate-risk', 'high-risk', 'minimal-intervention', 'custom'] } }, riskLevels: { type: 'array', items: { type: 'string' } }, interventionTypes: { type: 'array', items: { type: 'string', enum: ['email', 'sms', 'app-notification', 'cooldown', 'session-limit', 'temporary-suspension'] } }, followUpDays: { type: 'number' } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_RESPONSIBLE_GAMBLING_PLANNER_ACCESS_TOKEN', configKey: 'gamblingPlanner.accessToken', vaultSecretId: 'sports-responsible-gambling-planner-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['plan-intervention', 'generate-plan', 'schedule-follow-up', 'adjust-plan', 'get-plan'], description: 'The action to perform (plan-intervention, generate-plan, schedule-follow-up, adjust-plan, get-plan).' }, userId: { type: 'string', description: 'The unique identifier for the user.' }, riskScore: { type: 'number', description: "The user's calculated risk score." }, riskProfile: { type: 'object', description: 'An object containing the user risk profile details.' }, restrictions: { type: 'object', description: 'An object containing betting restrictions to apply.' }, sport: { type: 'string', description: 'The sport context for the intervention plan.' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-live-data-collector',
    name: 'Sports Live Data Collector',
    description: 'Collect real-time sports data streams including scores, events, and market movements from live sources.',
    system: 'live-data',
    action: 'collect-stream',
    endpoint: { envVar: 'SPORTS_LIVE_DATA_ENDPOINT', method: 'POST' },
    auth: { type: 'api_key', header: 'X-API-Key', credentialEnvKeyMap: { apiKey: 'SPORTS_LIVE_DATA_API_KEY' } },
    configSchema: { type: 'object', properties: { sources: { type: 'array', items: { type: 'string', enum: ['official-feed', 'provider-api', 'websocket', 'polling', 'custom'] } }, sports: { type: 'array', items: { type: 'string' } }, leagues: { type: 'array', items: { type: 'string' } }, pollingIntervalSeconds: { type: 'number' }, streamDurationSeconds: { type: 'number' }, includeRawEvents: { type: 'boolean' } } },
    credentialSource: { apiKey: { envVar: 'SPORTS_LIVE_DATA_API_KEY', configKey: 'liveData.apiKey', vaultSecretId: 'sports-live-data-api-key' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['collect-stream', 'subscribe', 'poll-event', 'get-scores', 'get-events'], description: 'The action to perform (collect-stream, subscribe, poll-event, get-scores, get-events).' }, sport: { type: 'string', description: 'The sport to collect live data for.' }, league: { type: 'string', description: 'The specific league within the sport.' }, eventId: { type: 'string', description: 'The unique identifier for a specific event.' }, events: { type: 'array', items: { type: 'string' }, description: 'An array of event identifiers to collect data for.' }, since: { type: 'string', description: 'The start date/time for data collection (ISO 8601).' }, until: { type: 'string', description: 'The end date/time for data collection (ISO 8601).' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 45000,
  }),
  createExternalActionSkill({
    id: 'sports-in-game-analyzer',
    name: 'Sports In-Game Analyzer',
    description: 'Analyze live in-game events, momentum shifts, and real-time market adjustments during active contests.',
    system: 'in-game',
    action: 'analyze-moment',
    endpoint: { envVar: 'SPORTS_IN_GAME_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_IN_GAME_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { analysisTypes: { type: 'array', items: { type: 'string', enum: ['momentum', 'pressure', 'market-shift', 'win-probability', 'edge-detection', 'custom'] } }, eventTypes: { type: 'array', items: { type: 'string' } }, lookbackSeconds: { type: 'number' }, lookAheadSeconds: { type: 'number' } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_IN_GAME_ACCESS_TOKEN', configKey: 'inGame.accessToken', vaultSecretId: 'sports-in-game-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['analyze-moment', 'detect-momentum', 'calculate-win-prob', 'spot-edge', 'track-market'], description: 'The action to perform (analyze-moment, detect-momentum, calculate-win-prob, spot-edge, track-market).' }, eventId: { type: 'string', description: 'The unique identifier for the live event.' }, gameTime: { type: 'number', description: 'The current game time in minutes or seconds.' }, events: { type: 'array', items: { type: 'object' }, description: 'An array of in-game events that occurred.' }, market: { type: 'string', description: 'The betting market being analyzed.' }, period: { type: 'string', description: 'The current game period (e.g. Q1, Q2, half, overtime).' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
  createExternalActionSkill({
    id: 'sports-live-betting-advisor',
    name: 'Sports Live Betting Advisor',
    description: 'Provide real-time betting recommendations and strategies based on live game state and odds movements.',
    system: 'live-betting',
    action: 'advise-bet',
    endpoint: { envVar: 'SPORTS_LIVE_BETTING_ENDPOINT', method: 'POST' },
    auth: { type: 'bearer', credentialEnvKeyMap: { accessToken: 'SPORTS_LIVE_BETTING_ACCESS_TOKEN' } },
    configSchema: { type: 'object', properties: { strategy: { type: 'string', enum: ['value', 'momentum', 'contrarian', 'market-mirror', 'custom'] }, maxStakePercent: { type: 'number' }, confidenceThreshold: { type: 'number' }, allowedMarkets: { type: 'array', items: { type: 'string' } }, bankroll: { type: 'number' }, currency: { type: 'string' } } },
    credentialSource: { accessToken: { envVar: 'SPORTS_LIVE_BETTING_ACCESS_TOKEN', configKey: 'liveBetting.accessToken', vaultSecretId: 'sports-live-betting-access-token' } },
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['advise-bet', 'evaluate-opportunity', 'set-trap', 'adjust-position', 'get-recommendations'], description: 'The action to perform (advise-bet, evaluate-opportunity, set-trap, adjust-position, get-recommendations).' }, eventId: { type: 'string', description: 'The unique identifier for the live event.' }, market: { type: 'string', description: 'The betting market type (e.g. moneyline, spread, totals).' }, selection: { type: 'string', description: 'The specific selection/runner within the market.' }, odds: { type: 'number', description: 'The current decimal odds for the selection.' }, gameTime: { type: 'number', description: 'The current game time in minutes or seconds.' }, confidence: { type: 'number', description: 'The confidence level for the betting recommendation (0-1).' } }, required: ['action'] },
    outputSchema: { type: 'object', properties: { success: { type: 'boolean' }, mode: { type: 'string' }, system: { type: 'string' }, action: { type: 'string' }, request: { type: 'object' }, response: { type: ['object', 'null'] }, error: { type: 'string' } }, required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'] },
    timeoutMs: 30000,
  }),
];

export const sportsSkills = [...SPORTS_SKILLS, ...SPORTS_EXTERNAL_SKILLS];
