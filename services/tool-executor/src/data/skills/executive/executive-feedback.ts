import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const EXECUTIVE_HOME = process.env.EXECUTIVE_HOME || '/tmp/executive';

const FEEDBACK_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const focusArea = input.focusArea || 'feedback-collector';
  const executiveId = input.executiveId || '';
  const baseDir = process.env.EXECUTIVE_HOME || '${EXECUTIVE_HOME}';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'feedback.json');
  fs.mkdirSync(baseDir, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  let result;
  switch (focusArea) {
    case 'feedback-collector':
      result = { focusArea: 'feedback-collector', executiveId, respondents: input.respondents || [], dimensions: input.dimensions || ['Leadership', 'Communication', 'Teamwork'], questions: input.questions || [], period: input.period || '', status: 'pending' };
      break;
    case 'feedback-analysis':
      result = { focusArea: 'feedback-analysis', executiveId, feedback: input.feedback || [], themes: input.themes || [], summary: input.feedback ? 'Analyzed ' + input.feedback.length + ' items.' : 'No feedback provided.' };
      break;
    case 'performance-analyzer':
      result = { focusArea: 'performance-analyzer', executiveId, metrics: (input.metrics || []).map(m => ({ name: m, value: null, trend: null, target: null })), kpis: input.kpis || [], period: input.period || 'quarter', benchmark: input.benchmark || '' };
      break;
    default: throw new Error('Unknown focusArea: ' + focusArea);
  }
  store.push(result);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  console.log(JSON.stringify({ success: true, focusArea, data: result, storePath }));
})();`;

const FEEDBACK_INPUT = {
  type: 'object',
  properties: {
    focusArea: SchemaProps.select(['feedback-collector', 'feedback-analysis', 'performance-analyzer'], { description: 'Feedback area', required: true }),
    executiveId: SchemaProps.text({ description: 'Executive identifier' }),
    period: SchemaProps.text({ description: 'Review period' }),
    respondents: SchemaProps.stringArray({ description: 'Respondent identifiers' }),
    dimensions: SchemaProps.stringArray({ description: 'Assessment dimensions' }),
    questions: SchemaProps.stringArray({ description: 'Survey questions' }),
    feedback: SchemaProps.objectArray(SchemaProps.object({ text: SchemaProps.text({}), author: SchemaProps.text({}), date: SchemaProps.text({}) }, {}), { description: 'Feedback entries' }),
    themes: SchemaProps.stringArray({ description: 'Feedback themes' }),
    metrics: SchemaProps.stringArray({ description: 'Performance metrics' }),
    kpis: SchemaProps.stringArray({ description: 'Key performance indicators' }),
    benchmark: SchemaProps.text({ description: 'Benchmark' }),
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

const FEEDBACK = createCodeSkill({
  id: 'executive-feedback',
  name: 'Feedback Collection & Analysis',
  description: 'Hybrid skill for collecting feedback, analyzing themes/sentiment, and performance analysis. Use focusArea to select.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: FEEDBACK_SOURCE },
  inputSchema: FEEDBACK_INPUT,
  outputSchema: COMMON_OUTPUT,
  triggers: [{ kind: 'user', phrase_examples: ['Collect feedback', 'Analyze feedback', 'Review performance'] }],
isSkill: true,
});

export { FEEDBACK };
