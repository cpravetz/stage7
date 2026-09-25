import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SCRIPTWRITING_HOME = process.env.SCRIPTWRITING_HOME || '/tmp/scriptwriting';

const NARRATIVE_ARC_PACING_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const script = input.script || '';
const format = input.format || 'script';
const genre = input.genre || 'drama';
const audience = input.audience || 'general';
const targetDuration = input.targetDuration || 0;

const baseDir = process.env.SCRIPTWRITING_HOME || '/tmp/scriptwriting';
const storePath = path.join(baseDir, 'narrative-arc-pacing.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

if (!script) {
  console.log(JSON.stringify({ success: false, error: 'script is required for narrative arc pacing evaluation' }));
  return;
}

const lines = script.split('\\n').filter(l => l.trim().length > 0);
const sceneHeaders = lines.filter(l => /^(INT\\.|EXT\\.|INT\\/EXT\\.)/.test(l.trim()));
const acts = [];
let currentAct = 1;
const actBreaks = [Math.floor(lines.length * 0.25), Math.floor(lines.length * 0.75)];
for (let i = 0; i < lines.length; i++) {
  if (actBreaks.includes(i)) currentAct++;
  acts.push({ line: lines[i], act: currentAct });
}

const pacing = {
  totalScenes: sceneHeaders.length,
  estimatedRuntime: Math.round(lines.length * 0.5) || targetDuration,
  targetDuration: targetDuration,
  acts: currentAct,
  sceneDensity: sceneHeaders.length > 0 ? (lines.length / sceneHeaders.length).toFixed(1) : '0',
  structure: 'three-act' // heuristic
};

const arc = {
  incitingIncident: sceneHeaders[0] || 'Not detected',
  midpoint: sceneHeaders[Math.floor(sceneHeaders.length / 2)] || 'Not detected',
  climax: sceneHeaders[sceneHeaders.length - 1] || 'Not detected',
  resolution: 'Implied by script end',
  genreAlignment: genre,
  audienceFit: audience,
};

const evaluation = {
  id: 'nap_' + Date.now(),
  format,
  genre,
  audience,
  targetDuration,
  pacing,
  arc,
  score: sceneHeaders.length >= 3 ? 'structured' : sceneHeaders.length > 0 ? 'partial' : 'unstructured',
  generatedAt: new Date().toISOString(),
};

store.push(evaluation);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });

console.log(JSON.stringify({ success: true, data: evaluation }));
`;

const NARRATIVE_ARC_PACING_INPUT = {
  type: 'object',
  properties: {
    script: SchemaProps.textarea({ description: 'Script text to evaluate for narrative structure and pacing' }),
    format: SchemaProps.select(['script', 'film', 'video', 'podcast', 'presentation'], { description: 'Script format', default: 'script' }),
    genre: SchemaProps.text({ description: 'Genre (e.g., drama, comedy, thriller, documentary)' }),
    audience: SchemaProps.text({ description: 'Intended audience' }),
    targetDuration: SchemaProps.number({ description: 'Target runtime in minutes', minimum: 1 }),
  },
  required: ['script'],
};

const NARRATIVE_ARC_PACING_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
    error: { type: 'string' },
  },
  required: ['success'],
};

export const NARRATIVE_ARC_PACING_EVALUATOR = createCodeSkill({
  id: 'scriptwriting-narrative-arc-pacing-evaluator',
  name: 'Narrative Arc & Pacing Evaluator',
  description: 'Analyzes script structure for act breaks, scene density, narrative arc progression, and genre/audience alignment. Outputs pacing metrics and structural assessment.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: NARRATIVE_ARC_PACING_SOURCE },
  inputSchema: NARRATIVE_ARC_PACING_INPUT,
  outputSchema: NARRATIVE_ARC_PACING_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Analyze my script structure', 'Check pacing', 'Evaluate narrative arc'] },
  ],
  tier: 'advise',
  domainKnowledge: 'Narrative structure, pacing analysis, story theory, genre conventions',
isSkill: true,
});
