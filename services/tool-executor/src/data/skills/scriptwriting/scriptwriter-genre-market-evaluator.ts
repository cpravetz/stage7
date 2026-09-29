import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const GENRE_MARKET_EVALUATOR_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const genre = String(input.genre || input.genreFocus || 'drama').toLowerCase();
  const marketDataSource = String(input.marketDataSource || input.trendDataSource || 'general').toLowerCase();
  const targetFormat = String(input.targetFormat || input.format || 'script');
  const genreFocus = String(input.genreFocus || genre).toLowerCase();
  const topic = String(input.topic || '').trim();
  const script = String(input.script || '');
  const delegatedTo = ['scriptwriting-narrative-arc-pacing-evaluator', 'scriptwriting-scene-beat-dialogue-copilot'];

  if (!topic && !script) {
    console.log(JSON.stringify({
      success: false,
      status: 'error',
      error: 'topic or script is required',
      present: [{ id: 'message', title: 'Not completed', kind: 'text', body: 'Supply a topic, a script, or both to assess genre fit.' }],
      delegatedTo: delegatedTo,
      genre: genre,
      marketDataSource: marketDataSource,
      targetFormat: targetFormat,
    }));
    return;
  }

  // ---- Delegation ---------------------------------------------------------------
  // Each delegation records its own outcome. A refusal or failure is reported rather than
  // swallowed, because a silently missing dependency made this skill report a half-empty
  // evaluation as a full one.
  const delegations = [];
  const results = {};

  async function delegate(toolId, args) {
    const record = { toolId: toolId, connected: false, error: null };
    try {
      const result = await __execute_tool(toolId, args);
      if (result && result.success) {
        record.connected = true;
        delegations.push(record);
        return result.data || null;
      }
      record.error = (result && (result.error || result.message)) || 'Delegated skill returned no result.';
      delegations.push(record);
      return null;
    } catch (error) {
      record.error = error && error.message ? error.message : String(error);
      delegations.push(record);
      return null;
    }
  }

  const pacingData = await delegate('scriptwriting-narrative-arc-pacing-evaluator', {
    script: script || '',
    format: targetFormat,
    genre: genre,
    audience: input.audience || 'general',
    targetDuration: input.targetDuration || 0,
    pageTarget: input.pageTarget || 110,
  });
  if (pacingData) results.narrativeArcPacing = pacingData;

  const copilotData = await delegate('scriptwriting-scene-beat-dialogue-copilot', {
    topic: topic || 'Untitled script',
    format: targetFormat,
    genre: genre,
    audience: input.audience || 'general',
    targetDuration: input.targetDuration || 5,
    logline: input.logline || '',
    save: false,
  });
  if (copilotData) results.sceneBeatDialogue = copilotData;

  const connected = delegations.filter(function (d) { return d.connected; }).map(function (d) { return d.toolId; });
  const failed = delegations.filter(function (d) { return !d.connected; });

  if (!connected.length) {
    console.log(JSON.stringify({
      success: false,
      status: 'not-connected',
      error: 'Not connected: neither ' + delegatedTo.join(' nor ') + ' could be executed, so genre fit could not be assessed.',
      present: [{ id: 'message', title: 'Not connected', kind: 'text', body: 'Genre fit could not be assessed because neither lower-order evaluator could be executed.' }],
      genre: genre,
      genreFocus: genreFocus,
      marketDataSource: marketDataSource,
      targetFormat: targetFormat,
      delegations: delegations,
      delegatedTo: delegatedTo,
    }));
    return;
  }

  // ---- Genre conventions --------------------------------------------------------
  // These are craft conventions for the genre, not measured market demand. They are what this
  // skill can actually evaluate against, and the report says so explicitly.
  const GENRE_CONVENTIONS = {
    drama:     { pages: [95, 120],  minScenes: 8,  act1Share: [0.25, 0.32], act3Share: [0.18, 0.28], requires: ['incitingIncident', 'midpoint', 'climax'], note: 'Character-credible escalation; ambiguity over spectacle.' },
    thriller:  { pages: [95, 115],  minScenes: 10, act1Share: [0.20, 0.28], act3Share: [0.22, 0.32], requires: ['incitingIncident', 'midpoint', 'climax'], note: 'Clock pressure that tightens monotonically; a ticking-timer spine.' },
    horror:    { pages: [85, 110],  minScenes: 9,  act1Share: [0.20, 0.28], act3Share: [0.22, 0.32], requires: ['incitingIncident', 'climax'], note: 'Escalating threat and withheld information.' },
    comedy:    { pages: [85, 110],  minScenes: 10, act1Share: [0.22, 0.30], act3Share: [0.22, 0.32], requires: ['incitingIncident', 'midpoint', 'climax'], note: 'Escalating comic complications with a clean turn at the midpoint.' },
    'sci-fi':  { pages: [100, 125], minScenes: 10, act1Share: [0.22, 0.30], act3Share: [0.20, 0.30], requires: ['incitingIncident', 'midpoint', 'climax'], note: 'One high-concept question answered by the third act.' },
    documentary: { pages: [60, 100], minScenes: 5, act1Share: [0.20, 0.32], act3Share: [0.18, 0.30], requires: ['incitingIncident', 'resolution'], note: 'Access, structure and a clear subject turn.' },
  };
  const conventions = GENRE_CONVENTIONS[genre] || GENRE_CONVENTIONS[genreFocus] || GENRE_CONVENTIONS.drama;

  // ---- Findings -----------------------------------------------------------------
  const findings = [];
  const scenePacing = results.narrativeArcPacing;
  const sceneOutline = results.sceneBeatDialogue;

  if (scenePacing && scenePacing.pacing) {
    const p = scenePacing.pacing;
    if (p.totalPages < conventions.pages[0]) {
      findings.push({ severity: 'warn', code: 'below-genre-length', message: 'Script is ' + p.totalPages + ' pages; ' + genre + ' convention is ' + conventions.pages[0] + '-' + conventions.pages[1] + '. It reads as a short or a single act.' });
    } else if (p.totalPages > conventions.pages[1]) {
      findings.push({ severity: 'warn', code: 'above-genre-length', message: 'Script is ' + p.totalPages + ' pages; ' + genre + ' convention is ' + conventions.pages[0] + '-' + conventions.pages[1] + '. Trim or restructure before submission.' });
    } else {
      findings.push({ severity: 'ok', code: 'length-fit', message: 'Length of ' + p.totalPages + ' pages sits inside the ' + genre + ' convention of ' + conventions.pages[0] + '-' + conventions.pages[1] + '.' });
    }

    if (p.totalScenes < conventions.minScenes) {
      findings.push({ severity: 'warn', code: 'too-few-scenes', message: 'Only ' + p.totalScenes + ' scenes; ' + genre + ' features typically carry at least ' + conventions.minScenes + ' to sustain pace.' });
    }

    if (Array.isArray(p.actBreakdown) && p.actBreakdown.length === 3) {
      const act1 = p.actBreakdown[0].pageShare;
      const act3 = p.actBreakdown[2].pageShare;
      if (act1 > conventions.act1Share[1]) {
        findings.push({ severity: 'warn', code: 'front-loaded', message: 'Act 1 runs ' + act1 + '% of the script against a ' + genre + ' target of ' + conventions.act1Share[0] + '-' + conventions.act1Share[1] + '%. The middle will feel thin.' });
      }
      if (act3 < conventions.act3Share[0]) {
        findings.push({ severity: 'warn', code: 'rushed-ending', message: 'Act 3 runs ' + act3 + '% of the script against a ' + genre + ' target of ' + conventions.act3Share[0] + '-' + conventions.act3Share[1] + '%. The resolution is compressed.' });
      }
    }

    if (scenePacing.pacingFlags && scenePacing.pacingFlags.length) {
      const warns = scenePacing.pacingFlags.filter(function (f) { return f.severity === 'warn'; }).length;
      findings.push({
        severity: warns ? 'warn' : 'info',
        code: 'pacing-flags',
        message: scenePacing.pacingFlags.length + ' pacing flag(s) raised on the script, ' + warns + ' of them warnings. See the narrative arc report for the per-scene detail.',
      });
    }
  } else if (!script) {
    findings.push({ severity: 'info', code: 'no-script', message: 'No script was supplied, so structural findings were skipped. Only topic and outline signals are available.' });
  }

  if (sceneOutline) {
    const beats = Array.isArray(sceneOutline.scenes) ? sceneOutline.scenes.map(function (s) { return s.storyBeat; }) : [];
    conventions.requires.forEach(function (beat) {
      if (beats.indexOf(beat) === -1) {
        findings.push({ severity: 'warn', code: 'missing-beat', message: 'The generated outline does not place a ' + beat + '. ' + genre + ' features are expected to carry it.' });
      }
    });
    findings.push({ severity: 'ok', code: 'outline-coverage', message: 'Outline covers ' + beats.length + ' distinct story beat(s): ' + (beats.join(', ') || 'none') + '.' });
    if (sceneOutline.logline) {
      findings.push({ severity: 'ok', code: 'logline-present', message: 'A logline was supplied, so the outline has a single through-line to sell.' });
    } else {
      findings.push({ severity: 'info', code: 'no-logline', message: 'No logline was supplied. A one-sentence logline is the first thing a buyer or reader screens on.' });
    }
  }

  findings.push({ severity: 'info', code: 'genre-note', message: genre + ' convention applied: ' + conventions.note });

  const weights = { ok: 1, info: 0.5, warn: 0 };
  const scored = findings.filter(function (f) { return f.code !== 'genre-note'; });
  const readiness = scored.length ? Math.round((scored.reduce(function (sum, f) { return sum + weights[f.severity]; }, 0) / scored.length) * 100) : 0;
  const readinessRating = readiness >= 80 ? 'ready-to-submit' : readiness >= 55 ? 'needs-revision' : 'not-ready';

  const status = failed.length === 0 ? 'live' : 'partial';

  const marketFit = {
    genre: genre,
    genreFocus: genreFocus,
    marketDataSource: marketDataSource,
    marketDataScope: 'unavailable',
    marketDataNote: 'No external market, chart or trend data is queried by this skill. "' + marketDataSource + '" is recorded as the intended source; the findings below are structural evaluation against ' + genre + ' craft conventions, not measured demand.',
    targetFormat: targetFormat,
    connectedTools: connected,
    unavailableTools: failed.map(function (d) { return d.toolId; }),
    evaluationCoverage: connected.length + '/' + delegatedTo.length,
    narrativeArcAvailable: Boolean(results.narrativeArcPacing),
    sceneBeatDialogueAvailable: Boolean(results.sceneBeatDialogue),
    genreConventions: conventions,
    structuralReadiness: readiness,
    structuralReadinessRating: readinessRating,
    structuralReadinessNote: 'Structural readiness is the share of structural checks passed. It is not a market score.',
    findings: findings,
    delegations: delegations,
    narrativeArcPacing: results.narrativeArcPacing || null,
    sceneBeatDialogue: results.sceneBeatDialogue || null,
    delegatedTo: delegatedTo,
    generatedAt: new Date().toISOString(),
  };

  const reportLines = [];
  reportLines.push('Genre: ' + genre + (genreFocus !== genre ? '  (focus: ' + genreFocus + ')' : ''));
  reportLines.push('Target format: ' + targetFormat);
  reportLines.push('Evaluation coverage: ' + marketFit.evaluationCoverage + ' (' + connected.join(', ') + ')');
  if (failed.length) {
    reportLines.push('Unavailable: ' + failed.map(function (d) { return d.toolId + ' - ' + d.error; }).join('; '));
  }
  reportLines.push('');
  reportLines.push('DATA SCOPE');
  reportLines.push('  ' + marketFit.marketDataNote);
  reportLines.push('');
  reportLines.push('GENRE CONVENTION');
  reportLines.push('  Pages: ' + conventions.pages.join('-') + '   Minimum scenes: ' + conventions.minScenes);
  reportLines.push('  Act 1 share: ' + Math.round(conventions.act1Share[0] * 100) + '-' + Math.round(conventions.act1Share[1] * 100) + '%   Act 3 share: ' + Math.round(conventions.act3Share[0] * 100) + '-' + Math.round(conventions.act3Share[1] * 100) + '%');
  reportLines.push('  Required beats: ' + conventions.requires.join(', '));
  reportLines.push('  ' + conventions.note);
  reportLines.push('');
  reportLines.push('FINDINGS (' + findings.length + ')');
  findings.forEach(function (f) { reportLines.push('  [' + f.severity.toUpperCase() + '] ' + f.message); });
  reportLines.push('');
  reportLines.push('STRUCTURAL READINESS: ' + readiness + '% (' + readinessRating + ')');
  reportLines.push('  ' + marketFit.structuralReadinessNote);

  const evaluation = {
    id: 'market_eval_' + Date.now(),
    status: status,
    marketFit: marketFit,
    createdAt: new Date().toISOString(),
  };

  const baseDir = process.env.SCRIPTWRITING_HOME || '/tmp/scriptwriting';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'genre-market-evaluations.json');
  fs.mkdirSync(baseDir, { recursive: true });
  const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  store.push(evaluation);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });
  evaluation.storePath = storePath;

  // The skill owns its report layout; 'present' is the generic block contract.
  console.log(JSON.stringify({
    success: true,
    status: status,
    data: evaluation,
    delegatedTo: delegatedTo,
    present: [{ id: 'report', title: 'Genre & Structural Readiness', kind: 'text', body: reportLines.join('\\n') }],
  }));
})()`;

const GENRE_MARKET_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    marketDataSource: SchemaProps.select(['spotify', 'soundcharts', 'billboard', 'general', 'custom'], { title: 'Market Data Source', description: 'Intended market/audience trend data source', order: 1, hint: 'Recorded on the report. No external trend data is fetched by this skill; the report states this explicitly.' }),
    targetFormat: SchemaProps.select(['script', 'film', 'video', 'podcast', 'presentation'], { title: 'Target Format', description: 'Target script format for readiness evaluation', order: 2, default: 'script', hint: 'The format being evaluated against genre conventions' }),
  },
};

export const SCRIPTWRITER_GENRE_MARKET_EVALUATOR = createCodeSkill({
  id: 'scriptwriting-genre-market-evaluator',
  name: 'Scriptwriter Genre & Market Evaluator',
  description: 'Evaluates a script or topic against genre craft conventions by delegating to narrative-arc-pacing-evaluator and scene-beat-dialogue-copilot, scoring structural readiness, and reporting which dependencies answered. Reports not-connected or partial status when a dependency fails instead of silently returning a half-empty evaluation. Does not query external market or chart data and says so in its output.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: GENRE_MARKET_EVALUATOR_SOURCE, configSchema: GENRE_MARKET_CONFIG_SCHEMA },
  inputSchema: {
    type: 'object',
    properties: {
      genre: SchemaProps.text({ title: 'Genre', description: 'Genre or storytelling mode', order: 1, default: 'drama', hint: 'e.g. drama, thriller, horror, comedy, sci-fi, documentary' }),
      genreFocus: SchemaProps.text({ title: 'Genre Focus', description: 'Primary genre for the assessment focus', order: 2, hint: 'Defaults to genre when omitted' }),
      marketDataSource: SchemaProps.select(['spotify', 'soundcharts', 'billboard', 'general', 'custom'], { title: 'Market Data Source', description: 'Intended source for market/audience trend data', order: 3, default: 'general', hint: 'Recorded on the report; no external data is fetched' }),
      targetFormat: SchemaProps.select(['script', 'film', 'video', 'podcast', 'presentation'], { title: 'Target Format', description: 'Target script format for evaluation', order: 4, default: 'script', hint: 'The format being evaluated against genre conventions' }),
      topic: SchemaProps.text({ title: 'Topic', description: 'Central story topic or premise', order: 5, hint: 'Used to generate the outline for beat coverage' }),
      logline: SchemaProps.text({ title: 'Logline', description: 'One-sentence story summary', order: 6, hint: 'Sharpens the generated outline and is flagged when missing' }),
      script: SchemaProps.textarea({ title: 'Script', description: 'Complete script or scene text to evaluate', order: 7, hint: 'Required for structural findings; omit to get outline-only evaluation' }),
      audience: SchemaProps.text({ title: 'Audience', description: 'Intended audience or distribution platform', order: 8, hint: 'Passed through to the delegated evaluators' }),
      targetDuration: SchemaProps.number({ title: 'Target Runtime', description: 'Target runtime in minutes', order: 9, minimum: 1, hint: 'Converts to a page target for the structural evaluation' }),
      pageTarget: SchemaProps.number({ title: 'Page Target', description: 'Target page count', order: 10, minimum: 1, default: 110, hint: 'Used when no target runtime is given' }),
    },
    required: ['genre'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the evaluation completed successfully' },
      status: { type: 'string', description: 'Execution status: live, partial, not-connected, or error' },
      data: { type: 'object', description: 'Genre conventions, structural readiness score, findings, delegation outcomes, and a formatted report' },
      delegatedTo: { type: 'array', items: { type: 'string' }, description: 'Lower-order tool IDs this skill delegates to' },
        present: {
      type: 'array',
      description: 'Pre-formatted, user-facing text blocks. This is how a skill controls its own layout without the renderer needing any knowledge of the skill.',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Stable identifier for the block' },
          title: { type: 'string', description: 'Optional heading shown above the block' },
          kind: { type: 'string', description: "How to interpret the body. Defaults to 'text'." },
          body: { type: 'string', description: 'Pre-formatted plain text, rendered verbatim with line breaks preserved' },
        },
        required: ['id', 'body'],
      },
    },
      error: { type: 'string', description: 'Error message if failed' },
    },
    required: ['success', 'status', 'present'],
  },
  triggers: [
    { kind: 'schedule', cadence: 'Periodic genre market fit monitoring' },
  ],
  tier: 'advise',
  domainKnowledge: 'Scriptwriting genre conventions, structural readiness analysis, audience alignment',
  isSkill: true,
});
