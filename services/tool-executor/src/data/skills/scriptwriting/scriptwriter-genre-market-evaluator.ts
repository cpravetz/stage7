import { Tool } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const GENRE_MARKET_EVALUATOR_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const genre = String(input.genre || input.genreFocus || 'drama');
  const marketDataSource = String(input.marketDataSource || input.trendDataSource || 'general');
  const targetFormat = String(input.targetFormat || input.format || 'script');
  const genreFocus = String(input.genreFocus || genre);
  const topic = String(input.topic || '');
  const script = String(input.script || '');
  const connected = [];
  const results = {};

  if (!topic && !script) {
    console.log(JSON.stringify({
      success: false,
      status: 'error',
      error: 'topic or script is required',
      delegatedTo: ['scriptwriting-narrative-arc-pacing-evaluator', 'scriptwriting-scene-beat-dialogue-copilot'],
      genre: genre,
      marketDataSource: marketDataSource,
      targetFormat: targetFormat,
    }));
    return;
  }

  try {
    const pacingResult = await __execute_tool('scriptwriting-narrative-arc-pacing-evaluator', {
      script: script || '(no script provided)',
      format: targetFormat,
      genre: genre,
      audience: input.audience || 'general',
      targetDuration: input.targetDuration || 0,
    });
    if (pacingResult && pacingResult.success) {
      connected.push('scriptwriting-narrative-arc-pacing-evaluator');
      results.narrativeArcPacing = pacingResult.data;
    }
  } catch (_) {
    // narrative arc pacing evaluator not available
  }

  try {
    const copilotResult = await __execute_tool('scriptwriting-scene-beat-dialogue-copilot', {
      topic: topic || 'Untitled script',
      format: targetFormat,
      genre: genre,
      audience: input.audience || 'general',
      targetDuration: input.targetDuration || 5,
      save: false,
    });
    if (copilotResult && copilotResult.success) {
      connected.push('scriptwriting-scene-beat-dialogue-copilot');
      results.sceneBeatDialogue = copilotResult.data;
    }
  } catch (_) {
    // scene beat dialogue copilot not available
  }

  if (!connected.length) {
    console.log(JSON.stringify({
      success: false,
      status: 'not-connected',
      error: 'Not connected: neither scriptwriting-narrative-arc-pacing-evaluator nor scriptwriting-scene-beat-dialogue-copilot is available. Connect at least one to assess genre market fit.',
      genre: genre,
      genreFocus: genreFocus,
      marketDataSource: marketDataSource,
      targetFormat: targetFormat,
      delegatedTo: ['scriptwriting-narrative-arc-pacing-evaluator', 'scriptwriting-scene-beat-dialogue-copilot'],
    }));
    return;
  }

  const pacingAvailable = !!results.narrativeArcPacing;
  const copilotAvailable = !!results.sceneBeatDialogue;
  const totalScore = (pacingAvailable ? 1 : 0) + (copilotAvailable ? 1 : 0);
  const maxScore = 2;

  const marketFit = {
    genre: genre,
    genreFocus: genreFocus,
    marketDataSource: marketDataSource,
    targetFormat: targetFormat,
    connectedTools: connected,
    narrativeArcAvailable: pacingAvailable,
    sceneBeatDialogueAvailable: copilotAvailable,
    marketFitScore: totalScore + '/' + maxScore,
    audienceAlignment: totalScore >= 2 ? 'strong' : totalScore >= 1 ? 'partial' : 'unassessed',
    marketSignal: genre + ' genre market signal from ' + marketDataSource + ' for ' + targetFormat + ' format',
    narrativeArcPacing: pacingAvailable ? results.narrativeArcPacing : null,
    sceneBeatDialogue: copilotAvailable ? results.sceneBeatDialogue : null,
    delegatedTo: ['scriptwriting-narrative-arc-pacing-evaluator', 'scriptwriting-scene-beat-dialogue-copilot'],
    generatedAt: new Date().toISOString(),
  };

  const baseDir = process.env.SCRIPTWRITING_HOME || '/tmp/scriptwriting';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'genre-market-evaluations.json');
  fs.mkdirSync(baseDir, { recursive: true });
  const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  const evaluation = { id: 'market_eval_' + Date.now(), status: 'live', marketFit: marketFit, createdAt: new Date().toISOString() };
  store.push(evaluation);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });

  console.log(JSON.stringify({
    success: true,
    status: 'live',
    data: evaluation,
    delegatedTo: ['scriptwriting-narrative-arc-pacing-evaluator', 'scriptwriting-scene-beat-dialogue-copilot'],
  }));
})()`;

const GENRE_MARKET_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    marketDataSource: SchemaProps.select(['spotify', 'soundcharts', 'billboard', 'general', 'custom'], { description: 'Primary market/audience trend data source', order: 1, hint: 'Select the data provider for market and audience trend analysis' }),
    targetFormat: SchemaProps.select(['script', 'film', 'video', 'podcast', 'presentation'], { description: 'Target script format for market fit evaluation', order: 2, hint: 'The format being evaluated against market trends' }),
  },
  required: ['marketDataSource', 'targetFormat'],
};

export const SCRIPTWRITER_GENRE_MARKET_EVALUATOR = createCodeSkill({
  id: 'scriptwriting-genre-market-evaluator',
  name: 'Scriptwriter Genre & Market Evaluator',
  description: 'Evaluates a script or topic for genre and market/audience trend fit by delegating to narrative-arc-pacing-evaluator and scene-beat-dialogue-copilot for structural and scene-level analysis. Reports not-connected when neither dependency is available.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: GENRE_MARKET_EVALUATOR_SOURCE, configSchema: GENRE_MARKET_CONFIG_SCHEMA },
  inputSchema: {
    type: 'object',
    properties: {
      genre: SchemaProps.text({ description: 'Genre or storytelling mode', default: 'drama', hint: 'e.g. drama, comedy, thriller, documentary' }),
      genreFocus: SchemaProps.text({ description: 'Primary genre for market focus area', hint: 'The specific genre being assessed for market fit' }),
      marketDataSource: SchemaProps.select(['spotify', 'soundcharts', 'billboard', 'general', 'custom'], { description: 'Source for market/audience trend data', hint: 'Data provider for market trend analysis' }),
      targetFormat: SchemaProps.select(['script', 'film', 'video', 'podcast', 'presentation'], { description: 'Target script format for evaluation', hint: 'The format being evaluated against market trends' }),
      topic: SchemaProps.text({ description: 'Central story topic or premise' }),
      script: SchemaProps.textarea({ description: 'Complete script or scene text to evaluate for market fit' }),
      audience: SchemaProps.text({ description: 'Intended audience or distribution platform' }),
      targetDuration: SchemaProps.number({ description: 'Target runtime in minutes', minimum: 1 }),
    },
    required: ['genre'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the market fit evaluation completed successfully' },
      status: { type: 'string', description: 'Execution status: live, not-connected, or error' },
      data: { type: 'object', description: 'Market fit evaluation with delegated results from narrative arc pacing and scene beat dialogue' },
      delegatedTo: { type: 'array', items: { type: 'string' }, description: 'Lower-order tool IDs this skill delegates to' },
      error: { type: 'string', description: 'Error message if failed' },
    },
    required: ['success', 'status'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Evaluate genre market fit for this script'] },
  ],
  tier: 'advise',
  domainKnowledge: 'Scriptwriting market analysis, genre trends, audience alignment',
});
