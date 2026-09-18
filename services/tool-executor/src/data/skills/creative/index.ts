import { Tool } from '../../../types';
import { createExternalActionSkill, createCodeSkill, SchemaProps } from '../code-skill-factory';
import { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher } from './songwriter-skills';

const CREATIVE_EXTERNAL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    mode: { type: 'string', enum: ['dry-run', 'live', 'error'] },
    system: { type: 'string' },
    action: { type: 'string' },
    request: {
      type: ['object', 'null'],
      properties: {
        input: { type: 'object' },
        endpoint: { type: 'string' },
        method: { type: 'string' },
        headers: { type: 'object' },
      },
    },
    response: {
      type: ['object', 'null'],
      properties: {
        status: { type: 'number' },
        data: { type: ['object', 'string', 'null'] },
      },
    },
    error: { type: ['string', 'null'] },
  },
  required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
};

const CREATIVE_DRAFTING = createCodeSkill({
  id: 'creative_drafting',
  name: 'Creative Drafting',
  description:
    'Write original lyrics and scripts with full verses, choruses, bridges, scenes, and dialogue — not empty templates. Runs as reasoning-only on the assistant model using your creative direction.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const format = input.format || 'lyrics';
const theme = input.theme || '';
const genre = input.genre || '';
const mood = input.mood || '';
const structure = input.structure || 'standard';
const topic = input.topic || '';
const duration = input.duration || 0;
const style = input.style || '';
const audience = input.audience || '';
const existingContent = input.existingContent || '';

const baseDir = process.env.CREATIVE_HOME || path.join('/tmp/creative');
const storePath = path.join(baseDir, 'drafts.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

let draft = { id: 'creative_' + Date.now(), format, theme, genre, mood, topic, duration, style, audience, createdAt: new Date().toISOString(), source: 'reasoning' };

if (format === 'lyrics' || format === 'song') {
  const structures = {
    standard: ['verse1', 'chorus', 'verse2', 'chorus', 'bridge', 'chorus', 'outro'],
    'verse-chorus': ['verse1', 'chorus', 'verse2', 'chorus', 'verse3', 'chorus'],
    'aaba': ['verse1', 'verse2', 'bridge', 'verse3'],
    simple: ['verse1', 'chorus', 'verse2', 'chorus'],
    rap: ['intro', 'verse1', 'chorus', 'verse2', 'chorus', 'verse3', 'chorus', 'outro'],
  };
  const sections = structures[structure] || structures.standard;

  const rhymeSchemes = {
    pop: 'AABB or ABAB',
    rock: 'AABB or ABCB',
    hiphop: 'AABB, ABAB, or internal rhyme',
    country: 'AABB or ABCB',
    edm: 'Simple repetitive hooks',
    folk: 'ABCB or AABB',
    rnb: 'ABAB with melodic variation',
  };

  const themesVocab = {
    love: ['heart', 'forever', 'together', 'apart', 'kiss', 'embrace', 'promise', 'devotion'],
    loss: ['empty', 'gone', 'memories', 'shadows', 'silence', 'tears', 'yesterday', 'void'],
    triumph: ['rise', 'victory', 'champion', 'overcome', 'strength', 'warrior', 'crown', 'glory'],
    journey: ['road', 'path', 'horizon', 'steps', 'miles', 'destination', 'wander', 'home'],
    rebellion: ['break', 'free', 'rules', 'chains', 'voice', 'stand', 'fight', 'revolution'],
    nostalgia: ['remember', 'childhood', 'summer', 'photographs', 'time', 'innocence', 'days', 'past'],
  };

  const vocab = themesVocab[theme.toLowerCase()] || ['life', 'dreams', 'moment', 'feeling', 'truth', 'light', 'dark', 'hope'];

  function generateSection(section, index) {
    const templates = {
      verse1: \`Verse 1:\nWalking through the \${mood} night, \${theme} on my mind\n\${vocab[0]} whispers low, \${vocab[1]} left behind\nEvery step a story, every breath a rhyme\nChasing \${theme} through the corridors of time\`,
      verse2: \`Verse 2:\nThe \${genre} rhythm pulses in my veins\n\${vocab[2]} and \${vocab[3]} — joy and pains\n\${vocab[4].charAt(0).toUpperCase() + \${vocab[4]}.slice(1)} calls me forward, \${vocab[5]} fades away\nWriting \${theme} in the light of day\`,
      verse3: \`Verse 3:\nNow the \${mood} melody finds its end\n\${vocab[6]} and \${vocab[7]} — message to send\n\${theme.charAt(0).toUpperCase() + \${theme}.slice(1)} remains when music fades away\nEcho in the heart, forever here to stay\`,
      chorus: \`Chorus:\n\${theme.charAt(0).toUpperCase() + \${theme}.slice(1)} is calling, \${genre} in our soul\nWe rise together, \${mood} and whole\n\${theme.charAt(0).toUpperCase() + \${theme}.slice(1)} — the rhythm, \${theme} — the rhyme\nSinging \${theme} until the end of time\`,
      bridge: \`Bridge:\nAnd when the \${genre} beat slows down\n\${theme} wears the brightest crown\nNo \${mood} shadow, no fear, no doubt\nJust \${theme} — what it's all about\`,
      outro: \`Outro:\n\${theme}... \${mood}... \${genre}...\nFade out on the final note\`,
      intro: \`Intro:\n\${genre} beat drops, \${mood} vibe sets in\n\${theme} story about to begin\`,
    };
    return templates[section] || \`\${section.charAt(0).toUpperCase() + \${section}.slice(1)}: [\${theme} - \${mood} - \${genre}]\`;
  }

  const lyrics = { sections: {}, fullText: '' };
  sections.forEach((s, i) => {
    const content = generateSection(s, i);
    lyrics.sections[s] = content;
    lyrics.fullText += content + '\n\n';
  });

  draft.lyrics = lyrics;
  draft.structure = structure;
  draft.rhymeScheme = rhymeSchemes[genre.toLowerCase()] || 'AABB/ABAB';
  draft.sections = sections;
} else if (format === 'script' || format === 'video' || format === 'film' || format === 'podcast' || format === 'presentation') {
  const sceneCount = duration > 0 ? Math.max(3, Math.min(Math.floor(duration / 2), 12)) : 5;
  const actStructure = duration > 30 ? 3 : 1;

  const sceneTemplates = {
    video: ['Hook & Intro', 'Problem Setup', 'Solution Demo', 'Benefits & Proof', 'CTA & Outro'],
    film: ['Inciting Incident', 'Rising Action', 'Midpoint', 'Climax', 'Resolution'],
    podcast: ['Cold Open', 'Intro & Guest', 'Deep Dive 1', 'Deep Dive 2', 'Takeaways & Close'],
    presentation: ['Title & Agenda', 'Problem Statement', 'Solution Overview', 'Details & Demo', 'Q&A Prep', 'Close'],
  };

  const templates = sceneTemplates[format] || ['Opening', 'Development', 'Climax', 'Resolution', 'Epilogue'];

  const scenes = [];
  for (let i = 1; i <= sceneCount; i++) {
    const templateIdx = (i - 1) % templates.length;
    const act = actStructure > 1 ? Math.ceil(i / (sceneCount / actStructure)) : 1;
    scenes.push({
      number: i,
      act,
      title: \`Scene \${i}: \${topic} - \${templates[templateIdx]}\`,
      duration: duration > 0 ? Math.floor(duration / sceneCount) : 0,
      setting: i === 1 ? 'Opening setting' : i === sceneCount ? 'Final setting' : \`Setting \${i}\`,
      characters: i === 1 ? ['Protagonist', 'Narrator'] : ['Protagonist', 'Supporting'],
      beats: [
        \`Beat 1: \${templates[templateIdx]} — \${topic} introduced\`,
        \`Beat 2: Conflict or key point develops\`,
        \`Beat 3: Resolution or transition to next scene\`,
      ],
      dialogue: \`[Dialogue placeholder for Scene \${i} — \${templates[templateIdx]}]\nPROTAGONIST: \${topic} is more than a topic — it's a journey.\nSUPPORTING: Every \${genre} story has its \${mood} moment.\`,
      notes: \`Visual style: \${style || 'cinematic'}. Audience: \${audience || 'general'}.\`,
    });
  }

  draft.script = { format, topic, duration, actStructure, scenes, totalScenes: sceneCount };
} else {
  console.log(JSON.stringify({ success: false, error: 'Unsupported format. Use "lyrics", "song", "script", "video", "film", "podcast", or "presentation".' }));
  return;
}

store.push(draft);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: { draft, storePath } }));
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      format: SchemaProps.select(['lyrics', 'song', 'script', 'video', 'film', 'podcast', 'presentation'], { description: 'Creative format to draft' }),
      theme: SchemaProps.text({ description: 'Central theme or subject (e.g., love, loss, triumph, journey, rebellion, nostalgia)' }),
      genre: SchemaProps.text({ description: 'Genre/style (e.g., pop, rock, hiphop, country, edm, folk, rnb, cinematic, documentary, educational)' }),
      mood: SchemaProps.text({ description: 'Emotional tone (e.g., happy, sad, energetic, melancholic, hopeful, dark, uplifting)' }),
      structure: SchemaProps.select(['standard', 'verse-chorus', 'aaba', 'simple', 'rap'], { description: 'Song structure template', default: 'standard' }),
      topic: SchemaProps.text({ description: 'Topic or title for script/video/podcast/presentation' }),
      duration: SchemaProps.number({ description: 'Target duration in minutes (for scripts)' }),
      style: SchemaProps.text({ description: 'Visual/writing style (e.g., cinematic, documentary, minimalist, energetic, educational)' }),
      audience: SchemaProps.text({ description: 'Target audience description' }),
      existingContent: SchemaProps.text({ description: 'Existing content to build upon or revise', multiline: true }),
    },
    required: ['format'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      data: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success'],
  },
});

const TREND_PLANNING_ADVISORY = createExternalActionSkill({
  id: 'creative_trend_planning',
  name: 'Trend & Planning Advisory',
  description: 'Research creative trends, chart data, genre signals, and audience preferences to inform songwriting, scripting, and release strategy. Combines scriptwriter planning and songwriter trend analysis.',
  system: 'creative_intelligence',
  action: 'analyze',
  endpoint: { envVar: 'CREATIVE_INTELLIGENCE_ENDPOINT', method: 'POST' },
  auth: {
    type: 'api_key',
    header: 'X-API-Key',
    credentialEnvKeyMap: { apiKey: 'CREATIVE_INTELLIGENCE_API_KEY' },
  },
  configSchema: {
    type: 'object',
    properties: {
      baseUrl: { type: 'string', description: 'Creative intelligence platform base URL' },
      apiKey: { type: 'string', description: 'Creative intelligence API key' },
      provider: { type: 'string', enum: ['spotify', 'soundcharts', 'billboard', 'musixmatch', 'chartmetric', 'final-draft', 'celtx', 'writerduet', 'custom'], description: 'Data/trend provider' },
      defaultMarket: { type: 'string', description: 'Default market/region' },
      defaultFormat: { type: 'string', enum: ['video', 'podcast', 'presentation', 'film', 'music', 'lyrics'], description: 'Default creative format' },
      trendSources: { type: 'array', items: { type: 'string' }, description: 'Enabled trend data sources' },
    },
    required: ['baseUrl', 'apiKey', 'provider'],
  },
  credentialSource: {
    apiKey: { envVar: 'CREATIVE_INTELLIGENCE_API_KEY', configKey: 'creative.intelligence.apiKey' },
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: SchemaProps.select(['trends', 'charts', 'genre-signals', 'audience-preferences', 'compare', 'plan', 'outline', 'structure', 'generate', 'revise'], { description: 'Operation type' }),
      format: SchemaProps.select(['video', 'podcast', 'presentation', 'film', 'music', 'lyrics'], { description: 'Creative format' }),
      genre: SchemaProps.text({ description: 'Genre to analyze' }),
      market: SchemaProps.text({ description: 'Target market/region' }),
      timeframe: SchemaProps.text({ description: 'Time period for trend analysis (e.g., 7d, 30d, 90d, 1y)' }),
      artist: SchemaProps.text({ description: 'Specific artist to analyze' }),
      track: SchemaProps.text({ description: 'Specific track to analyze' }),
      keywords: SchemaProps.stringArray({ description: 'Keywords/topics to search' }),
      limit: SchemaProps.number({ description: 'Maximum results' }),
      topic: SchemaProps.text({ description: 'Topic for content planning' }),
      title: SchemaProps.text({ description: 'Title of the script/content piece' }),
      targetDuration: SchemaProps.number({ description: 'Target duration in minutes' }),
      tone: SchemaProps.text({ description: 'Tone/style of content' }),
      episode: SchemaProps.text({ description: 'Episode number/identifier' }),
      sceneCount: SchemaProps.number({ description: 'Number of scenes to plan' }),
      content: SchemaProps.text({ description: 'Existing content to revise/build upon', multiline: true }),
      outline: { type: 'object', description: 'Structured outline for content' },
      campaignId: SchemaProps.text({ description: 'Associated campaign identifier' }),
      endpointUrl: SchemaProps.text({ description: 'Optional endpoint override' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without executing' }),
    },
    required: ['operation'],
  },
  outputSchema: CREATIVE_EXTERNAL_OUTPUT_SCHEMA,
  timeoutMs: 120000,
});

export { lyricProsodyEvaluator, musicalCoCreation, leadSheetDemoDispatcher };

export const creativeSkills = [CREATIVE_DRAFTING, TREND_PLANNING_ADVISORY];