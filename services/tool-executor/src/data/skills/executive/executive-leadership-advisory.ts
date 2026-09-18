import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const EXECUTIVE_HOME = process.env.EXECUTIVE_HOME || '/tmp/executive';

const LEADERSHIP_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const focusArea = input.focusArea || 'coaching';
  const executiveId = input.executiveId || '';
  const baseDir = process.env.EXECUTIVE_HOME || '${EXECUTIVE_HOME}';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'leadership-advisory.json');
  fs.mkdirSync(baseDir, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  const ctx = { role: input.role || '', level: input.level || '', strengths: input.strengths || [], gaps: input.gaps || [], goals: input.goals || [], context: input.context || '' };

  let result;
  switch (focusArea) {
    case 'coaching':
      result = { focusArea: 'coaching', executiveId, sessions: [{ topic: 'Self-awareness', agenda: ['Strengths review', 'Reflection goals'] }, { topic: 'Decision-making', agenda: ['Framework practice', 'Past decisions review'] }], ctx };
      break;
    case 'decision-framework':
      result = { focusArea: 'decision-framework', executiveId, decision: input.decision || '', options: input.options || [], criteria: input.criteria || [], ctx };
      break;
    case 'leadership-assessment':
      result = { focusArea: 'leadership-assessment', executiveId, competencies: (input.competencies || ['Strategic Thinking', 'Emotional Intelligence', 'Communication']).map(c => ({ name: c, selfRating: null, targetRating: null, evidence: [] })), ctx };
      break;
    case 'eq-assessment':
      result = { focusArea: 'eq-assessment', executiveId, dimensions: (input.dimensions || ['Self-Awareness', 'Self-Regulation', 'Motivation', 'Empathy', 'Social Skill']).map(d => ({ name: d, score: null, descriptor: '' })), ctx };
      break;
    case 'presence-analyzer':
      result = { focusArea: 'presence-analyzer', executiveId, sessions: input.sessions || [], factors: ['Body Language', 'Vocal Tone', 'Engagement', 'Clarity', 'Authority', 'Authenticity'], ctx };
      break;
    case 'communication-analyzer':
      result = { focusArea: 'communication-analyzer', executiveId, text: input.text || input.transcript || '', dimensions: ['Clarity', 'Conciseness', 'Tone', 'Persuasiveness', 'Structure', 'Empathy'], ctx };
      break;
    case 'communication-coach':
      result = { focusArea: 'communication-coach', executiveId, message: input.message || input.draft || '', channel: input.channel || 'unknown', audience: input.audience || '', suggestions: ['Review clarity', 'Check tone', 'Strengthen opening', 'Verify audience alignment'], ctx };
      break;
    default: throw new Error('Unknown focusArea: ' + focusArea);
  }
  store.push(result);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  console.log(JSON.stringify({ success: true, focusArea, data: result, storePath }));
})();`;

const LEADERSHIP_INPUT = {
  type: 'object',
  properties: {
    focusArea: SchemaProps.select(['coaching', 'decision-framework', 'leadership-assessment', 'eq-assessment', 'presence-analyzer', 'communication-analyzer', 'communication-coach'], { description: 'Leadership advisory area', required: true }),
    executiveId: SchemaProps.text({ description: 'Executive identifier' }),
    role: SchemaProps.text({ description: 'Current role' }),
    level: SchemaProps.text({ description: 'Seniority level' }),
    context: SchemaProps.text({ description: 'Additional context' }),
    strengths: SchemaProps.stringArray({ description: 'Known strengths' }),
    gaps: SchemaProps.stringArray({ description: 'Known development gaps' }),
    goals: SchemaProps.stringArray({ description: 'Goals' }),
    decision: SchemaProps.text({ description: 'Decision to analyze' }),
    options: SchemaProps.objectArray(SchemaProps.object({ label: SchemaProps.text({}), description: SchemaProps.text({}) }, {}), { description: 'Options to evaluate' }),
    criteria: SchemaProps.stringArray({ description: 'Decision criteria' }),
    competencies: SchemaProps.stringArray({ description: 'Competencies to assess' }),
    dimensions: SchemaProps.stringArray({ description: 'Dimensions to evaluate' }),
    text: SchemaProps.text({ description: 'Text to analyze', multiline: true }),
    transcript: SchemaProps.text({ description: 'Transcript', multiline: true }),
    message: SchemaProps.text({ description: 'Message to coach', multiline: true }),
    draft: SchemaProps.text({ description: 'Draft message', multiline: true }),
    channel: SchemaProps.text({ description: 'Communication channel' }),
    audience: SchemaProps.text({ description: 'Target audience' }),
    sessions: SchemaProps.objectArray(SchemaProps.object({ topic: SchemaProps.text({}), description: SchemaProps.text({}) }, {}), { description: 'Session data' }),
  },
  required: ['focusArea'],
};

const COMMON_OUTPUT = {
  type: 'object',
  properties: {
    success: { type: 'boolean' },
    focusArea: { type: 'string' },
    data: { type: 'object' },
    storePath: { type: 'string' },
    error: { type: 'string' },
  },
  required: ['success', 'focusArea', 'data'],
};

const LEADERSHIP_ADVISORY = createCodeSkill({
  id: 'executive-leadership-advisory',
  name: 'Leadership Advisory',
  description: 'Unified leadership advisory covering coaching, decision frameworks, assessment, EQ, presence, and communication analysis/coaching. Use focusArea to select.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: LEADERSHIP_SOURCE },
  inputSchema: LEADERSHIP_INPUT,
  outputSchema: COMMON_OUTPUT,
  triggers: [{ kind: 'user', phrase_examples: ['Coach me', 'Help me decide', 'Assess my leadership', 'Analyze communication'] }, { kind: 'schedule', cadence: 'Weekly leadership review' }],
});

export { LEADERSHIP_ADVISORY };
