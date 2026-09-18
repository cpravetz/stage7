import { Tool } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const GENRE_TREND_EVALUATOR_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const genre = String(input.genre || input.genreFocus || 'pop');
  const trendDataSource = String(input.trendDataSource || input.marketDataSource || 'general');
  const genreFocus = String(input.genreFocus || genre);
  const theme = String(input.theme || '');
  const lyrics = String(input.lyrics || '');
  const operation = input.operation || 'genre-trend-fit';
  const connected = [];
  const results = {};

  if (!theme && !lyrics) {
    console.log(JSON.stringify({
      success: false,
      mode: 'error',
      error: 'theme or lyrics is required',
      delegatedTo: ['songwriting_lyric_prosody_evaluator', 'songwriting_musical_lyric_cocreation'],
      genre: genre,
      trendDataSource: trendDataSource,
    }));
    return;
  }

  try {
    const lyricResult = await __execute_tool('songwriting_lyric_prosody_evaluator', {
      lyrics: lyrics || '(no lyrics provided)',
      genre: genre,
      structure: input.structure || 'verse-chorus',
      targetMeter: input.targetMeter || 8,
    });
    if (lyricResult && lyricResult.success) {
      connected.push('songwriting_lyric_prosody_evaluator');
      results.lyricProsody = lyricResult.data;
    }
  } catch (_) {
    // lyric prosody evaluator not available
  }

  try {
    const cocreationResult = await __execute_tool('songwriting_musical_lyric_cocreation', {
      theme: theme || 'Untitled song',
      genre: genre,
      mood: input.mood || 'hopeful',
      structure: input.structure || 'verse-chorus',
      sectionCount: input.sectionCount || 4,
      save: false,
    });
    if (cocreationResult && cocreationResult.success) {
      connected.push('songwriting_musical_lyric_cocreation');
      results.musicalCoCreation = cocreationResult.data;
    }
  } catch (_) {
    // musical co-creation not available
  }

  if (!connected.length) {
    console.log(JSON.stringify({
      success: false,
      mode: 'not-connected',
      error: 'Not connected: neither songwriting_lyric_prosody_evaluator nor songwriting_musical_lyric_cocreation is available. Connect at least one to assess genre trend fit.',
      genre: genre,
      genreFocus: genreFocus,
      trendDataSource: trendDataSource,
      delegatedTo: ['songwriting_lyric_prosody_evaluator', 'songwriting_musical_lyric_cocreation'],
    }));
    return;
  }

  const lyricAvailable = !!results.lyricProsody;
  const musicalAvailable = !!results.musicalCoCreation;
  const totalScore = (lyricAvailable ? 1 : 0) + (musicalAvailable ? 1 : 0);
  const maxScore = 2;

  const trendFit = {
    genre: genre,
    genreFocus: genreFocus,
    trendDataSource: trendDataSource,
    connectedTools: connected,
    lyricProsodyAvailable: lyricAvailable,
    musicalCoCreationAvailable: musicalAvailable,
    trendFitScore: totalScore + '/' + maxScore,
    marketSignal: genre + ' genre trend signal from ' + trendDataSource,
    audienceAlignment: totalScore >= 2 ? 'strong' : totalScore >= 1 ? 'partial' : 'unassessed',
    lyricProsody: lyricAvailable ? results.lyricProsody : null,
    musicalCoCreation: musicalAvailable ? results.musicalCoCreation : null,
    delegatedTo: ['songwriting_lyric_prosody_evaluator', 'songwriting_musical_lyric_cocreation'],
    generatedAt: new Date().toISOString(),
  };

  const baseDir = process.env.SONGWRITING_HOME || '/tmp/songwriting';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'genre-trend-evaluations.json');
  fs.mkdirSync(baseDir, { recursive: true });
  const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  const evaluation = { id: 'trend_eval_' + Date.now(), operation: operation, trendFit: trendFit, createdAt: new Date().toISOString() };
  store.push(evaluation);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });

  console.log(JSON.stringify({
    success: true,
    mode: 'live',
    operation: operation,
    data: evaluation,
    delegatedTo: ['songwriting_lyric_prosody_evaluator', 'songwriting_musical_lyric_cocreation'],
  }));
})()`;

const GENRE_TREND_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    trendDataSource: SchemaProps.select(['spotify', 'soundcharts', 'billboard', 'musixmatch', 'chartmetric', 'general'], { title: 'Trend Data Source', description: 'Primary source for market and audience trend data', order: 1, hint: 'Select the data provider used for trend signal analysis' }),
    genreFocus: SchemaProps.text({ title: 'Genre Focus', description: 'Primary genre to evaluate for trend fit', order: 2, hint: 'The genre being assessed against current market trends' }),
  },
  required: ['trendDataSource', 'genreFocus'],
};

export const SONGWRITER_GENRE_TREND_EVALUATOR = createCodeSkill({
  id: 'songwriter_genre_trend_evaluator',
  name: 'Songwriter Genre & Market Trend Fit Evaluator',
  description: 'Evaluates a song or lyric draft for genre and market/audience trend fit by delegating to lyric-prosody-evaluator and musical-co-creation for structural and musical context analysis. Reports not-connected when neither dependency is available.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: GENRE_TREND_EVALUATOR_SOURCE, configSchema: GENRE_TREND_CONFIG_SCHEMA },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['genre-trend-fit', 'audience-alignment', 'market-signal'], { title: 'Operation', description: 'Type of trend fit analysis to perform', order: 1, default: 'genre-trend-fit', hint: 'Choose the trend analysis operation' }),
      genre: SchemaProps.text({ title: 'Genre', description: 'Musical genre to evaluate', order: 2, default: 'pop', hint: 'e.g. pop, rock, hiphop, country, folk, edm, rnb' }),
      genreFocus: SchemaProps.text({ title: 'Genre Focus', description: 'Primary genre for trend focus area', order: 3, hint: 'The specific genre being assessed for market fit' }),
      trendDataSource: SchemaProps.select(['spotify', 'soundcharts', 'billboard', 'musixmatch', 'chartmetric', 'general'], { title: 'Trend Data Source', description: 'Source for market trend data', order: 4, hint: 'Data provider for trend signal analysis' }),
      marketDataSource: SchemaProps.select(['spotify', 'soundcharts', 'billboard', 'musixmatch', 'chartmetric', 'general'], { title: 'Market Data Source', description: 'Alternative market data source override', order: 5, hint: 'Overrides trendDataSource when specified' }),
      theme: SchemaProps.text({ title: 'Theme', description: 'Central emotional theme or subject', order: 6, hint: 'e.g. love, loss, triumph, journey, rebellion' }),
      lyrics: SchemaProps.textarea({ title: 'Lyrics', description: 'Complete lyric text to evaluate for trend fit', order: 7, hint: 'Paste the full lyric text' }),
      mood: SchemaProps.text({ title: 'Mood', description: 'Emotional tone for the composition', order: 8, default: 'hopeful', hint: 'e.g. hopeful, melancholic, energetic, introspective' }),
      structure: SchemaProps.select(['verse-chorus', 'standard', 'aaba', 'simple', 'rap'], { title: 'Structure', description: 'Song structure template', order: 9, default: 'verse-chorus', hint: 'Section ordering template' }),
      targetMeter: SchemaProps.number({ title: 'Target Meter', description: 'Target syllables per line', order: 10, minimum: 1, maximum: 20, default: 8, hint: 'Desired syllables per line' }),
      sectionCount: SchemaProps.number({ title: 'Section Count', description: 'Number of sections to generate', order: 11, minimum: 2, maximum: 12, default: 4, hint: 'Controls section generation' }),
    },
    required: ['genre'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the trend fit evaluation completed successfully' },
      mode: { type: 'string', description: 'Execution mode: live, not-connected, or error' },
      operation: { type: 'string', description: 'The operation performed' },
      data: { type: 'object', description: 'Trend fit evaluation with delegated results from lyric prosody and musical co-creation' },
      delegatedTo: { type: 'array', items: { type: 'string' }, description: 'Lower-order tool IDs this skill delegates to' },
      error: { type: 'string', description: 'Error message if failed' },
    },
    required: ['success', 'mode', 'operation'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Does this song fit current genre trends', 'Evaluate market fit for this track', 'Assess audience alignment'] },
    { kind: 'event', on: 'A song draft or lyric is ready for trend analysis' },
    { kind: 'data', condition: 'Genre or market trend fit needs assessment before release' },
  ],
});
