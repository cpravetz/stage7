import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const SCRIPTWRITING_HOME = process.env.SCRIPTWRITING_HOME || '/tmp/scriptwriting';

const SCRIPT_FORMATTING_SOURCE = `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const script = input.script || '';
const format = input.format || 'standard';
const targetFormat = input.targetFormat || 'pdf';
const submitTo = input.submitTo || [];

const baseDir = process.env.SCRIPTWRITING_HOME || '/tmp/scriptwriting';
const storePath = path.join(baseDir, 'formatting-submissions.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

if (!script) {
  console.log(JSON.stringify({ success: false, error: 'script is required for formatting' }));
  return;
}

const lines = script.split('\\n');
const formatted = lines.map((line, i) => {
  const trimmed = line.trim();
  if (/^(INT\\.|EXT\\.|INT\\/EXT\\.)/.test(trimmed)) {
    return 'SCENE HEADING: ' + trimmed;
  }
  if (/^[A-Z][A-Z\\s]+:/.test(trimmed)) {
    return 'CHARACTER: ' + trimmed;
  }
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return 'PARENTHETICAL: ' + trimmed;
  }
  if (trimmed.length > 0) {
    return 'ACTION: ' + trimmed;
  }
  return '';
}).filter(l => l.length > 0);

const output = {
  id: 'sfm_' + Date.now(),
  format,
  targetFormat,
  submitTo,
  formattedLineCount: formatted.length,
  formattedScript: formatted.join('\\n'),
  originalLineCount: lines.length,
  submissionStatus: submitTo.length > 0 ? 'queued' : 'formatted-only',
  generatedAt: new Date().toISOString(),
};

store.push(output);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2), { mode: 0o600 });

console.log(JSON.stringify({ success: true, data: output }));
`;

const SCRIPT_FORMATTING_INPUT = {
  type: 'object',
  properties: {
    script: SchemaProps.textarea({ description: 'Raw script text to format' }),
    format: SchemaProps.select(['standard', 'fountain', 'finaldraft', 'celtx', 'writerduet'], { description: 'Input script format', default: 'standard' }),
    targetFormat: SchemaProps.select(['pdf', 'fountain', 'finaldraft', 'celtx', 'txt'], { description: 'Output format', default: 'pdf' }),
    submitTo: SchemaProps.stringArray({ description: 'Platforms to submit to (e.g., blacklist, coverage-services, contests)' }),
  },
  required: ['script'],
};

const SCRIPT_FORMATTING_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    data: { type: 'object' },
    error: { type: 'string' },
  },
  required: ['success'],
};

export const SCRIPT_FORMATTING_SUBMISSION_MANAGER = createCodeSkill({
  id: 'scriptwriting-script-formatting-submission-manager',
  name: 'Script Formatting & Submission Manager',
  description: 'Formats raw script text to industry-standard screenplay format (scene headings, character cues, parentheticals, action lines) and manages submission queues for platforms like Blacklist, coverage services, and contests.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: SCRIPT_FORMATTING_SOURCE },
  inputSchema: SCRIPT_FORMATTING_INPUT,
  outputSchema: SCRIPT_FORMATTING_OUTPUT,
  triggers: [
    { kind: 'user', phrase_examples: ['Format my script', 'Submit to Blacklist', 'Prepare for coverage'] },
  ],
  tier: 'represent',
  confirmBeforeSend: true,
  domainKnowledge: 'Screenplay formatting standards (Master Scene Heading style), script submission platforms, industry formatting guidelines',
isSkill: true,
});
