import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SCRIPTWRITING_HOME = process.env.SCRIPTWRITING_HOME || '/tmp/scriptwriting';

const SCENE_BEAT_DIALOGUE_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const topic = input.topic || 'Untitled scene';
const format = input.format || 'script';
const genre = input.genre || 'drama';
const audience = input.audience || 'general';
const targetDuration = input.targetDuration || 5;
const save = input.save !== false;

const baseDir = process.env.SCRIPTWRITING_HOME || '/tmp/scriptwriting';
const storePath = path.join(baseDir, 'scene-beat-dialogue.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

const sceneCount = Math.max(1, Math.min(10, Math.floor(targetDuration)));
const scenes = [];

for (let i = 1; i <= sceneCount; i++) {
  const act = sceneCount > 3 ? (i <= sceneCount * 0.25 ? 1 : i <= sceneCount * 0.75 ? 2 : 3) : 1;
  const location = i % 2 === 1 ? 'INT. LOCATION - DAY' : 'EXT. LOCATION - NIGHT';
  scenes.push({
    number: i,
    act: act,
    location: location,
    beats: [
      'Establish setting and character',
      'Introduce conflict or goal',
      'Complication or reversal',
      'Resolution or cliffhanger',
    ],
    dialogue: [
      { character: 'PROTAGONIST', line: 'We need to talk about ' + topic },
      { character: 'ANTAGONIST', line: 'There is nothing to discuss.' },
      { character: 'PROTAGONIST', line: 'Then we have a problem.' },
    ],
    pacing: genre === 'comedy' ? 'fast' : genre === 'thriller' ? 'tense' : 'measured',
  });
}

const result = {
  id: 'sbd_' + Date.now(),
  topic,
  format,
  genre,
  audience,
  targetDuration,
  sceneCount,
  scenes,
  generatedAt: new Date().toISOString(),
};

if (save) {
  store.push(result);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });
}

console.log(JSON.stringify({ success: true, data: result }));
`;

const SCENE_BEAT_DIALOGUE_INPUT = {
  type: 'object',
  properties: {
    topic: SchemaProps.text({ description: 'Scene topic or premise' }),
    format: SchemaProps.select(['script', 'film', 'video', 'podcast', 'presentation'], { description: 'Script format', default: 'script' }),
    genre: SchemaProps.text({ description: 'Genre (e.g., drama, comedy, thriller, documentary)' }),
    audience: SchemaProps.text({ description: 'Intended audience' }),
    targetDuration: SchemaProps.number({ description: 'Target runtime in minutes', minimum: 1, default: 5 }),
    save: SchemaProps.boolean({ description: 'Persist generated scene', default: true }),
  },
  required: ['topic'],
};

const SCENE_BEAT_DIALOGUE_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
    error: { type: 'string' },
  },
  required: ['success'],
};

export const SCENE_BEAT_DIALOGUE_COPILOT = createCodeSkill({
  id: 'scriptwriting-scene-beat-dialogue-copilot',
  name: 'Scene, Beat & Dialogue Copilot',
  description: 'Generates structured scenes with beats, dialogue exchanges, and pacing guidance for a given topic, genre, and format. Outputs complete scene outlines ready for writer review.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: SCENE_BEAT_DIALOGUE_SOURCE },
  inputSchema: SCENE_BEAT_DIALOGUE_INPUT,
  outputSchema: SCENE_BEAT_DIALOGUE_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Generate a scene', 'Write dialogue for', 'Outline beats for'] },
  ],
  tier: 'aid',
  domainKnowledge: 'Screenwriting craft, scene structure, dialogue writing, beat sheets',
});
