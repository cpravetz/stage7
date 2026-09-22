import { Tool } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const LYRIC_PROSODY_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const lyrics = String(input.lyrics || '').trim();
const genre = String(input.genre || 'general').toLowerCase();
const structure = String(input.structure || 'verse-chorus');
const targetMeter = Number(input.targetMeter || 8);
if (!lyrics) {
  console.log(JSON.stringify({ success: false, error: 'lyrics is required' }));
  return;
}
function estimateSyllables(value) {
  const word = String(value).toLowerCase().replace(/[^a-z']/g, '');
  if (!word) return 0;
  const groups = word.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;
  if (word.endsWith('e') && !word.endsWith('le') && count > 1) count -= 1;
  return Math.max(1, count);
}
function stressPattern(line) {
  return line.split(/\\s+/).map(function (word) {
    return estimateSyllables(word) % 2 === 0 ? 'S' : 's';
  }).join('-');
}
const lines = lyrics.split(/\\r?\\n/).map(function (line) { return line.trim(); }).filter(Boolean);
const lineMetrics = lines.map(function (line, index) {
  const words = line.split(/\\s+/).filter(Boolean);
  const syllables = words.reduce(function (sum, word) { return sum + estimateSyllables(word); }, 0);
  return { line: index + 1, text: line, words: words.length, syllables: syllables, stress: stressPattern(line) };
});
const rhymePairs = [];
for (let i = 0; i < lineMetrics.length; i += 1) {
  for (let j = i + 1; j < lineMetrics.length; j += 1) {
    const left = lineMetrics[i].text.toLowerCase().replace(/[^a-z]/g, '').slice(-2);
    const right = lineMetrics[j].text.toLowerCase().replace(/[^a-z]/g, '').slice(-2);
    if (left.length >= 2 && left === right) rhymePairs.push({ lines: [lineMetrics[i].line, lineMetrics[j].line], rhyme: left });
  }
}
const syllableCounts = lineMetrics.map(function (metric) { return metric.syllables; });
const averageSyllables = syllableCounts.length ? syllableCounts.reduce(function (sum, value) { return sum + value; }, 0) / syllableCounts.length : 0;
const meterVariance = syllableCounts.length ? syllableCounts.reduce(function (sum, value) { return sum + Math.pow(value - targetMeter, 2); }, 0) / syllableCounts.length : 0;
const repeatedWords = {};
lines.forEach(function (line) {
  line.toLowerCase().replace(/[^a-z']/g, ' ').split(/\\s+/).forEach(function (word) {
    if (word.length > 3) repeatedWords[word] = (repeatedWords[word] || 0) + 1;
  });
});
const themeWords = Object.keys(repeatedWords).filter(function (word) { return repeatedWords[word] > 1; }).sort(function (a, b) { return repeatedWords[b] - repeatedWords[a]; }).slice(0, 8);
const rhymeScheme = lineMetrics.map(function (metric) {
  const key = metric.text.toLowerCase().replace(/[^a-z]/g, '').slice(-2);
  return key || '-';
}).join(' ');
const recommendations = [];
if (meterVariance > 4) recommendations.push('Several lines differ materially from the target meter; revise syllable counts before finalizing the melody.');
if (rhymePairs.length === 0) recommendations.push('No repeated end rhymes were detected; add a deliberate rhyme or use slant rhyme intentionally.');
if (themeWords.length === 0) recommendations.push('The lyric has little repeated thematic vocabulary; reinforce the central image or hook.');
if (lines.length < 4) recommendations.push('Provide at least four non-empty lines for a useful structural evaluation.');
if (recommendations.length === 0) recommendations.push('The supplied lyric has a usable meter, rhyme signal, and thematic through-line for further musical development.');
const evaluation = {
  id: 'song_eval_' + Date.now(),
  draftId: input.draftId || null,
  genre: genre,
  structure: structure,
  targetMeter: targetMeter,
  lineCount: lineMetrics.length,
  averageSyllablesPerLine: Math.round(averageSyllables * 10) / 10,
  meterVariance: Math.round(meterVariance * 100) / 100,
  rhymePairs: rhymePairs,
  rhymeScheme: rhymeScheme,
  stressPatterns: lineMetrics.map(function (metric) { return metric.stress; }),
  themeWords: themeWords,
  recommendations: recommendations,
  source: 'local',
  createdAt: new Date().toISOString()
};
const baseDir = process.env.SONGWRITING_HOME || path.join('/tmp', 'songwriting');
fs.mkdirSync(baseDir, { recursive: true });
const storePath = path.join(baseDir, 'lyric-evaluations.json');
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
store.push(evaluation);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });
console.log(JSON.stringify({ success: true, data: { evaluation: evaluation, storePath: storePath } }));
`;

const COCREATION_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const theme = String(input.theme || '').trim();
const genre = String(input.genre || 'pop').toLowerCase();
const mood = String(input.mood || 'hopeful').toLowerCase();
const structure = String(input.structure || 'verse-chorus');
const topic = String(input.topic || theme || 'Untitled song');
const sectionCount = Math.max(2, Math.min(12, Number(input.sectionCount || 4)));
const seed = Math.abs(Number(input.seed || 0) | 0);
if (!theme) {
  console.log(JSON.stringify({ success: false, error: 'theme is required' }));
  return;
}
const structures = {
  standard: ['verse 1', 'chorus', 'verse 2', 'chorus', 'bridge', 'chorus', 'outro'],
  'verse-chorus': ['verse 1', 'chorus', 'verse 2', 'chorus', 'bridge', 'chorus'],
  aaba: ['verse 1', 'verse 2', 'bridge', 'verse 3'],
  simple: ['verse 1', 'chorus', 'verse 2', 'chorus'],
  rap: ['intro', 'verse 1', 'chorus', 'verse 2', 'chorus', 'verse 3', 'outro']
};
const sectionNames = (structures[structure] || structures.standard).slice(0, sectionCount);
const chordSets = {
  pop: ['I', 'V', 'vi', 'IV'], rock: ['I', 'bVII', 'IV', 'I'], country: ['I', 'IV', 'V', 'V'],
  folk: ['I', 'V', 'vi', 'IV'], edm: ['i', 'VI', 'III', 'VII'], rnb: ['ii', 'V', 'Imaj7', 'vi'],
  hiphop: ['i', 'i', 'VI', 'III']
};
const progression = (chordSets[genre] || chordSets.pop).slice();
const vocab = {
  love: ['close', 'light', 'promise', 'home'], loss: ['quiet', 'memory', 'rain', 'after'],
  triumph: ['rise', 'fire', 'forward', 'bright'], journey: ['road', 'horizon', 'steps', 'open'],
  rebellion: ['break', 'voice', 'spark', 'free'], nostalgia: ['summer', 'photograph', 'golden', 'remember']
};
const words = vocab[theme.toLowerCase()] || ['moment', 'truth', 'echo', 'alive'];
const sections = sectionNames.map(function (name, index) {
  const chord = progression[index % progression.length];
  const lineA = words[(index + seed) % words.length] + ' through the ' + mood + ' ' + genre + ' night';
  const lineB = topic + ' is the ' + words[(index + seed + 1) % words.length] + ' we keep in sight';
  return {
    section: name,
    chord: chord,
    lines: [lineA, lineB],
    purpose: name.includes('chorus') ? 'State the central hook and emotional promise.' : 'Advance the story and prepare the next musical turn.',
    transition: index === sectionNames.length - 1 ? 'Resolve to the title or a sustained final chord.' : 'Use a two-bar lift into the next section.'
  };
});
const fullText = sections.map(function (section) {
  return section.section.toUpperCase() + ' [' + section.chord + ']\\n' + section.lines.join('\\n');
}).join('\\n\\n');
const draft = {
  id: 'song_' + Date.now(),
  format: 'song',
  theme: theme,
  genre: genre,
  mood: mood,
  topic: topic,
  structure: structure,
  chordProgression: progression,
  rhymeScheme: 'AABB or ABAB',
  sections: sections,
  lyrics: { sections: sections, fullText: fullText },
  beatSheet: sections.map(function (section, index) { return { order: index + 1, section: section.section, musicalFocus: section.purpose }; }),
  revision: input.existingContent ? { basedOn: 'existingContent', changes: ['Preserve the supplied direction', 'Regenerate section-level musical and lyric options'] } : null,
  source: 'local',
  createdAt: new Date().toISOString()
};
const result = { success: true, data: { draft: draft } };
if (input.save !== false) {
  const baseDir = process.env.SONGWRITING_HOME || path.join('/tmp', 'songwriting');
  fs.mkdirSync(baseDir, { recursive: true });
  const storePath = path.join(baseDir, 'drafts.json');
  const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  store.push(draft);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });
  result.data.storePath = storePath;
}
console.log(JSON.stringify(result));
`;

const DISPATCH_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');
const operation = input.operation || 'format-lead-sheet';
const title = String(input.title || 'Untitled song');
const lyrics = String(input.lyrics || '');
const chords = Array.isArray(input.chords) ? input.chords : [];
const artifact = {
  id: 'song_asset_' + Date.now(),
  operation: operation,
  title: title,
  format: input.format || 'lead-sheet',
  lyrics: lyrics,
  chords: chords,
  registration: input.registration || null,
  createdAt: new Date().toISOString()
};
const baseDir = process.env.SONGWRITING_HOME || path.join('/tmp', 'songwriting');
fs.mkdirSync(baseDir, { recursive: true });
const storePath = path.join(baseDir, operation === 'stage-registration' ? 'registration-records.json' : 'lead-sheets.json');
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
store.push({ ...artifact, status: 'staged' });
fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });
const endpoint = String(input.endpointUrl || process.env.SONGWRITING_DISPATCH_ENDPOINT || '');
const apiKey = String(input.apiKey || process.env.SONGWRITING_DISPATCH_API_KEY || '');
const result = {
  success: true,
  mode: 'dry-run',
  connected: false,
  artifact: artifact,
  storePath: storePath,
  response: null,
  message: endpoint ? 'Artifact staged; set dryRun to false and confirm before dispatch.' : 'Not connected: no asset endpoint is configured. The artifact is staged locally.'
};
if (input.dryRun === false && endpoint && (input.confirmed === true || input.confirmation === true)) {
  (async function () {
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers['X-API-Key'] = apiKey;
      const response = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify(artifact) });
      const text = await response.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = { text: text }; }
      result.mode = 'live';
      result.connected = true;
      result.response = { status: response.status, data: data };
      result.message = response.ok ? 'Artifact dispatched after confirmation.' : 'Asset endpoint returned an error; staged artifact remains available.';
      console.log(JSON.stringify({ success: true, data: result }));
    } catch (error) {
      result.mode = 'error';
      result.message = 'Artifact dispatch failed; staged artifact remains available.';
      result.error = error instanceof Error ? error.message : String(error);
      console.log(JSON.stringify({ success: false, data: result }));
    }
  })();
} else {
  console.log(JSON.stringify({ success: true, data: result }));
}
`;

const SONGWRITER_DISPATCH_CONFIG_SCHEMA = {
  type: 'object',
  properties: {
    endpointUrl: SchemaProps.url({ title: 'Endpoint URL', description: 'Lead-sheet, demo-asset, or registration endpoint URL', order: 1, hint: 'Provider endpoint for live dispatch of lead sheets, demo metadata, or registration records' }),
    apiKey: SchemaProps.password({ title: 'API Key', description: 'API key for the configured asset or registration provider', order: 2, hint: 'Authentication key for the configured provider endpoint' }),
    provider: SchemaProps.select(['custom', 'daw', 'registration-portal'], { title: 'Provider', description: 'Configured asset or registration provider', order: 3, default: 'custom', hint: 'Select the service that will receive dispatched assets' }),
    defaultFormat: SchemaProps.select(['lead-sheet', 'demo-metadata', 'registration'], { title: 'Default Format', description: 'Default dispatch artifact format', order: 4, default: 'lead-sheet', hint: 'Default artifact type when none is specified at dispatch time' }),
    confirmBeforeSend: SchemaProps.boolean({ title: 'Confirm Before Send', description: 'Require explicit confirmation before a live asset dispatch', order: 5, default: true, hint: 'When enabled, live dispatch requires explicit confirmation input' }),
  },
};

function withConfirmation(skill: Tool): Tool {
  return {
    ...skill,
    confirmBeforeSend: true,
    manifest: { ...skill.manifest, confirmBeforeSend: true },
  };
}

export const lyricProsodyEvaluator = createCodeSkill({
  id: 'songwriting_lyric_prosody_evaluator',
  name: 'Advise Lyric & Structural Prosody Evaluator',
  description: 'Analyzes song lyrics for meter, syllable variance, rhyme signal, stress patterns, and thematic coherence, then returns concrete structural revision recommendations for the songwriter.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: LYRIC_PROSODY_SOURCE },
  inputSchema: {
    type: 'object',
    properties: {
      draftId: SchemaProps.text({ title: 'Draft ID', description: 'Optional song draft identifier to attach to the evaluation', order: 1, hint: 'Links this evaluation to a specific draft in your lyric sketchbook' }),
      lyrics: SchemaProps.textarea({ title: 'Lyrics', description: 'Complete lyric text to evaluate', order: 2, hint: 'Paste the full lyric text you want analyzed for prosody and structure' }),
      genre: SchemaProps.text({ title: 'Genre', description: 'Musical genre used as context for structural expectations', order: 3, default: 'general', hint: 'e.g. pop, rock, hiphop, country, folk, edm, rnb' }),
      structure: SchemaProps.select(['verse-chorus', 'standard', 'aaba', 'simple', 'rap'], { title: 'Structure', description: 'Expected song structure', order: 4, default: 'verse-chorus', hint: 'The structural template the lyric is expected to follow' }),
      targetMeter: SchemaProps.number({ title: 'Target Meter', description: 'Target syllables per line for meter analysis', order: 5, minimum: 1, maximum: 20, default: 8, hint: 'Desired syllables per line; deviations are flagged as meter variance' }),
      referenceLyrics: SchemaProps.textarea({ title: 'Reference Lyrics', description: 'Optional reference lyric or style sample for comparison', order: 6, hint: 'Paste a reference lyric or style sample to compare against' }),
    },
    required: ['lyrics'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the evaluation completed successfully' },
      data: { type: 'object', description: 'Prosody metrics, rhyme pairs, theme signals, recommendations, and local store path' },
      error: { type: 'string', description: 'Validation or execution error message' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Evaluate the meter and rhyme of these lyrics', 'Is this chorus structurally strong', 'Analyze the prosody of my song'] },
    { kind: 'event', on: 'A lyric draft or chorus is revised' },
    { kind: 'data', condition: 'Meter variance, rhyme density, or thematic coherence falls below the song brief threshold' },
  ],
});

export const musicalCoCreation = createCodeSkill({
  id: 'songwriting_musical_lyric_cocreation',
  name: 'Aid Musical & Lyric Co-Creation Engine',
  description: 'Generates a structured song draft with genre-aware chord progression, lyric sections, rhyme direction, transitions, and a section beat sheet from a creative brief.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: COCREATION_SOURCE },
  inputSchema: {
    type: 'object',
    properties: {
      theme: SchemaProps.text({ title: 'Theme', description: 'Central emotional theme or subject of the song', order: 1, hint: 'e.g. love, loss, triumph, journey, rebellion, nostalgia' }),
      topic: SchemaProps.text({ title: 'Topic', description: 'Optional title or concrete subject used in the hook', order: 2, hint: 'Concrete subject or title surfaced in the song hook' }),
      genre: SchemaProps.text({ title: 'Genre', description: 'Musical genre or style direction', order: 3, default: 'pop', hint: 'e.g. pop, rock, hiphop, country, folk, edm, rnb' }),
      mood: SchemaProps.text({ title: 'Mood', description: 'Emotional tone for the composition', order: 4, default: 'hopeful', hint: 'e.g. hopeful, melancholic, energetic, introspective' }),
      structure: SchemaProps.select(['verse-chorus', 'standard', 'aaba', 'simple', 'rap'], { title: 'Structure', description: 'Requested song structure', order: 5, default: 'verse-chorus', hint: 'Section ordering template for the generated draft' }),
      sectionCount: SchemaProps.number({ title: 'Section Count', description: 'Number of sections to generate, from 2 to 12', order: 6, minimum: 2, maximum: 12, default: 4, hint: 'Controls how many sections the engine produces from the template' }),
      seed: SchemaProps.integer({ title: 'Seed', description: 'Optional deterministic seed for repeatable co-creation variations', order: 7, minimum: 0, hint: 'Enter a number for reproducible draft variations across runs' }),
      existingContent: SchemaProps.textarea({ title: 'Existing Content', description: 'Optional existing lyric or brief to preserve while generating a revision', order: 8, hint: 'Paste existing material to build upon or revise' }),
      save: SchemaProps.boolean({ title: 'Save', description: 'Persist the generated draft in the songwriter workspace', order: 9, default: true, hint: 'Writes the draft to SONGWRITING_HOME/drafts.json when true' }),
    },
    required: ['theme'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the song draft was generated successfully' },
      data: { type: 'object', description: 'Generated song draft, chords, sections, beat sheet, and optional store path' },
      error: { type: 'string', description: 'Validation or execution error message' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Write a song about this theme', 'Generate chords and lyrics for this brief', 'Create a verse-chorus draft'] },
    { kind: 'event', on: 'A songwriter brief or artist direction changes' },
    { kind: 'data', condition: 'A draft needs a new section, transition, or rhyme variation' },
  ],
});

export const leadSheetDemoDispatcher = withConfirmation(createCodeSkill({
  id: 'songwriting_lead_sheet_demo_dispatcher',
  name: 'Represent Lead Sheet & Demo Asset Dispatcher',
  description: 'Formats completed lyrics and chords into a lead sheet or demo metadata, stages registration records, and optionally dispatches the artifact to a configured provider after explicit confirmation.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: DISPATCH_SOURCE,
    configSchema: SONGWRITER_DISPATCH_CONFIG_SCHEMA,
    endpointEnvVar: 'SONGWRITING_DISPATCH_ENDPOINT',
    confirmBeforeSend: true,
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['format-lead-sheet', 'prepare-demo-assets', 'stage-registration'], { title: 'Operation', description: 'Asset operation to stage or dispatch', order: 1, default: 'format-lead-sheet', hint: 'Choose the asset preparation or registration workflow' }),
      draftId: SchemaProps.text({ title: 'Draft ID', description: 'Optional source draft identifier', order: 2, hint: 'Links the staged artifact to its source draft' }),
      title: SchemaProps.text({ title: 'Title', description: 'Song title for the lead sheet or registration record', order: 3, default: 'Untitled song', hint: 'Display title for the formatted artifact' }),
      lyrics: SchemaProps.textarea({ title: 'Lyrics', description: 'Final lyric text to format', order: 4, hint: 'Complete lyric text to include in the lead sheet or demo asset' }),
      chords: SchemaProps.stringArray({ title: 'Chords', description: 'Chord symbols aligned with the lyric sections', order: 5, hint: 'Chord symbols such as I, V, vi, IV aligned to sections' }),
      format: SchemaProps.select(['lead-sheet', 'demo-metadata', 'registration'], { title: 'Format', description: 'Artifact format to produce', order: 6, default: 'lead-sheet', hint: 'Output format for the staged or dispatched artifact' }),
      registration: SchemaProps.object({
        writers: SchemaProps.stringArray({ title: 'Writers', description: 'Songwriter names for registration metadata', order: 1, hint: 'List of songwriter names for copyright registration' }),
        publishers: SchemaProps.stringArray({ title: 'Publishers', description: 'Publisher names for registration metadata', order: 2, hint: 'List of publisher names for registration' }),
        rightsNote: SchemaProps.text({ title: 'Rights Note', description: 'Rights or ownership note for the staged record', order: 3, hint: 'Any rights or ownership clarification for the record' }),
      }, { title: 'Registration', description: 'Optional copyright or registration metadata', order: 7, hint: 'Include writer/publisher metadata when staging a registration record' }),
      apiKey: SchemaProps.password({ title: 'API Key', description: 'Optional provider API key override', order: 9, hint: 'Override the configured API key for this dispatch' }),
      dryRun: SchemaProps.boolean({ title: 'Dry Run', description: 'Stage the artifact without sending it; defaults to true', order: 10, default: true, hint: 'When true, the artifact is staged locally and no live dispatch occurs' }),
      confirmation: SchemaProps.boolean({ title: 'Confirmation', description: 'Explicit approval for a live dispatch; dry-run does not require approval', order: 11, default: false, hint: 'Set to true only when authorizing a live dispatch to the configured endpoint' }),
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether staging or dispatch completed successfully' },
      mode: { type: 'string', enum: ['dry-run', 'live', 'error'], description: 'Execution mode: dry-run, live, or error' },
      connected: { type: 'boolean', description: 'Whether a configured endpoint was used for dispatch' },
      artifact: { type: 'object', description: 'Formatted lead sheet, demo metadata, or registration artifact' },
      response: { type: ['object', 'null'], description: 'Provider response when a live dispatch succeeds or fails' },
      storePath: { type: 'string', description: 'Category-specific local staging path in SONGWRITING_HOME' },
      message: { type: 'string', description: 'Human-readable connection, staging, or dispatch status' },
      error: { type: 'string', description: 'Dispatch error message when mode is error' },
    },
    required: ['success', 'mode', 'connected', 'artifact', 'storePath', 'message'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Format this song as a lead sheet', 'Prepare demo metadata', 'Stage the registration record'] },
    { kind: 'event', on: 'A song draft is marked complete' },
    { kind: 'data', condition: 'A completed lyric and chord artifact is ready for review or dispatch' },
  ],
}));
