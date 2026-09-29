import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory';
import { executiveResultSchema } from './executive-contract';

function withUxMetadata(schema: SchemaRecord): SchemaRecord {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return schema;
  Object.entries(properties).forEach(([key, property], index) => {
    if (!property || typeof property !== 'object') return;
    property.title = property.title || key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
    property.order = typeof property.order === 'number' ? property.order : index + 1;
    property.hint = property.hint || property.description || 'See the tool documentation for details.';
  });
  return schema;
}

const EXECUTIVE_HOME = process.env.EXECUTIVE_HOME || '/tmp/executive';
const SAFETY_BOUNDARY = 'Executive advisory only: feedback collection and analysis are for development purposes; do not use for compensation, promotion, or disciplinary decisions without proper HR process.';

const FEEDBACK_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';
  const SAFETY = ${JSON.stringify(SAFETY_BOUNDARY)};

  function fail(status, message, title, extra) {
    const base = { success: false, status: status, error: message, data: null, present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }] };
    if (extra) { for (const key in extra) { base[key] = extra[key]; } }
    console.log(JSON.stringify(base));
  }

  const focusArea = input.focusArea || 'feedback-collector';
  const executiveId = input.executiveId || '';
  const baseDir = process.env.EXECUTIVE_HOME || '/tmp/executive';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'feedback.json');
  fs.mkdirSync(baseDir, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

  let result;
  let present;
  switch (focusArea) {
    case 'feedback-collector': {
      const respondents = Array.isArray(input.respondents) ? input.respondents : [];
      const dimensions = Array.isArray(input.dimensions) ? input.dimensions : ['Leadership', 'Communication', 'Teamwork'];
      const questions = Array.isArray(input.questions) ? input.questions : [];
      const period = input.period || '';

      if (!respondents.length && !dimensions.length && !questions.length) {
        fail('not-connected', 'Not connected: no respondents, dimensions, or questions provided for feedback collection', 'Input required');
        return;
      }

      const lines = [
        'Feedback Collection Plan',
        '========================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Review Period: ' + (period || 'unspecified'),
        'Respondents: ' + (respondents.length ? respondents.join(', ') : 'none specified'),
        'Dimensions: ' + dimensions.join(', '),
        'Questions: ' + (questions.length ? questions.length + ' provided' : 'none provided'),
        '',
      ];

      if (respondents.length > 0) {
        lines.push('Respondent list:');
        respondents.forEach(function(r, i) { lines.push('  ' + (i + 1) + '. ' + String(r)); });
        lines.push('');
      }

      if (dimensions.length > 0) {
        lines.push('Assessment dimensions:');
        dimensions.forEach(function(d, i) { lines.push('  ' + (i + 1) + '. ' + String(d)); });
        lines.push('');
      }

      if (questions.length > 0) {
        lines.push('Survey questions:');
        questions.forEach(function(q, i) { lines.push('  ' + (i + 1) + '. ' + String(q)); });
        lines.push('');
      }

      lines.push('Status: Ready for distribution');

      result = { focusArea: 'feedback-collector', executiveId, respondents, dimensions, questions, period, status: 'ready' };
      present = [{ id: 'plan', title: 'Executive Feedback Collection Plan', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'feedback-analysis': {
      const feedback = Array.isArray(input.feedback) ? input.feedback : [];
      const themes = Array.isArray(input.themes) ? input.themes : [];

      if (!feedback.length) {
        fail('not-connected', 'Not connected: no feedback entries provided for analysis', 'Input required');
        return;
      }

      // Derive themes from feedback text if not provided
      let derivedThemes = [];
      if (!themes.length) {
        const allWords = feedback.map(function(f) {
          const text = f && f.text ? String(f.text) : String(f);
          return text.toLowerCase().match(/\\b\\w{4,}\\b/g) || [];
        }).flat();
        const freq = {};
        allWords.forEach(function(w) { freq[w] = (freq[w] || 0) + 1; });
        const stopWords = {'this':1,'that':1,'with':1,'from':1,'have':1,'been':1,'were':1,'will':1,'would':1,'could':1,'should':1,'about':1,'their':1,'there':1,'where':1,'when':1,'which':1,'while':1,'after':1,'before':1,'during':1,'under':1,'over':1,'between':1,'among':1,'through':1,'across':1,'into':1,'onto':1,'upon':1,'within':1,'without':1,'against':1,'toward':1,'because':1,'since':1,'although':1,'though':1,'unless':1,'until':1,'whether':1,'either':1,'neither':1,'both':1,'each':1,'every':1,'other':1,'another':1,'such':1,'only':1,'just':1,'still':1,'even':1,'also':1,'then':1,'than':1,'very':1,'much':1,'more':1,'most':1,'many':1,'some':1,'few':1,'several':1,'various':1,'different':1,'similar':1,'same':1,'own':1,'self':1,'its':1,'your':1,'our':1,'their':1,'his':1,'her':1,'my':1,'me':1,'us':1,'him':1,'them':1};
        derivedThemes = Object.keys(freq).filter(function(w) { return !stopWords[w]; }).sort(function(a,b) { return freq[b] - freq[a]; }).slice(0, 10);
      }

      const lines = [
        'Feedback Analysis',
        '=================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Feedback entries analyzed: ' + feedback.length,
        'Themes identified: ' + (themes.length ? themes.length + ' (provided)' : derivedThemes.length + ' (derived)'),
        '',
      ];

      if (derivedThemes.length > 0 && !themes.length) {
        lines.push('Derived themes from feedback text:');
        derivedThemes.forEach(function(t, i) { lines.push('  ' + (i + 1) + '. ' + t); });
        lines.push('');
      }

      if (themes.length > 0) {
        lines.push('Provided themes:');
        themes.forEach(function(t, i) { lines.push('  ' + (i + 1) + '. ' + String(t)); });
        lines.push('');
      }

      lines.push('Feedback entries:');
      feedback.forEach(function(f, i) {
        const text = f && f.text ? String(f.text) : String(f);
        const author = f && f.author ? String(f.author) : 'anonymous';
        const date = f && f.date ? String(f.date) : 'unknown date';
        lines.push('  ' + (i + 1) + '. [' + date + '] ' + author + ': ' + text.slice(0, 200) + (text.length > 200 ? '...' : ''));
      });

      const summary = 'Analyzed ' + feedback.length + ' feedback items. ' + (themes.length ? themes.length + ' themes provided.' : derivedThemes.length + ' themes derived from text.');

      result = { focusArea: 'feedback-analysis', executiveId, feedback, themes: themes.length ? themes : derivedThemes, summary };
      present = [{ id: 'analysis', title: 'Executive Feedback Analysis', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'performance-analyzer': {
      const metrics = Array.isArray(input.metrics) ? input.metrics : [];
      const kpis = Array.isArray(input.kpis) ? input.kpis : [];
      const period = input.period || 'quarter';
      const benchmark = input.benchmark || '';

      if (!metrics.length && !kpis.length) {
        fail('not-connected', 'Not connected: no metrics or KPIs provided for performance analysis', 'Input required');
        return;
      }

      const lines = [
        'Performance Analysis',
        '===================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Period: ' + period,
        'Benchmark: ' + (benchmark || 'none specified'),
        'Metrics analyzed: ' + metrics.length,
        'KPIs tracked: ' + kpis.length,
        '',
      ];

      if (metrics.length > 0) {
        lines.push('Metrics:');
        metrics.forEach(function(m, i) {
          lines.push('  ' + (i + 1) + '. ' + String(m) + ': value=unavailable, trend=unavailable, target=unavailable');
        });
        lines.push('');
        lines.push('Note: Metric values, trends, and targets must be supplied for quantitative analysis.');
        lines.push('');
      }

      if (kpis.length > 0) {
        lines.push('Key Performance Indicators:');
        kpis.forEach(function(k, i) { lines.push('  ' + (i + 1) + '. ' + String(k)); });
        lines.push('');
      }

      const summary = 'Performance analysis for ' + period + '. ' + metrics.length + ' metrics and ' + kpis.length + ' KPIs identified. Data values required for quantitative results.';

      result = { focusArea: 'performance-analyzer', executiveId, metrics: metrics.map(function(m) { return { name: String(m), value: null, trend: null, target: null }; }), kpis, period, benchmark };
      present = [{ id: 'performance', title: 'Executive Performance Analysis', kind: 'text', body: lines.join(NL) }];
      break;
    }

    default:
      fail('error', 'Unknown focusArea: ' + focusArea, 'Invalid focusArea');
      return;
  }

  store.push(result);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  console.log(JSON.stringify({
    success: true,
    status: 'ok',
    data: result,
    error: null,
    present,
  }));
})();`;

const FEEDBACK_INPUT = createSchemaRecord({
  focusArea: SchemaProps.select(['feedback-collector', 'feedback-analysis', 'performance-analyzer'], { description: 'Feedback area', required: true }),
  executiveId: SchemaProps.text({ description: 'Executive identifier' }),
  period: SchemaProps.text({ description: 'Review period' }),
  respondents: SchemaProps.stringArray({ description: 'Respondent identifiers' }),
  dimensions: SchemaProps.stringArray({ description: 'Assessment dimensions' }),
  questions: SchemaProps.stringArray({ description: 'Survey questions' }),
  feedback: SchemaProps.objectArray(SchemaProps.object({
    text: SchemaProps.text({}),
    author: SchemaProps.text({}),
    date: SchemaProps.text({}),
  }), { description: 'Feedback entries' }),
  themes: SchemaProps.stringArray({ description: 'Feedback themes' }),
  metrics: SchemaProps.stringArray({ description: 'Performance metrics' }),
  kpis: SchemaProps.stringArray({ description: 'Key performance indicators' }),
  benchmark: SchemaProps.text({ description: 'Benchmark' }),
}, { required: ['focusArea'] });

const FEEDBACK_CONFIG = createSchemaRecord({
  executiveHome: SchemaProps.text({ description: 'Executive workspace path; defaults to EXECUTIVE_HOME' }),
});

export const FEEDBACK = createCodeSkill({
  id: 'executive-feedback',
  name: 'Feedback Collection & Analysis',
  description: 'Feedback collection planning, theme analysis from supplied text, and performance metric tracking. Derives themes from feedback text when not provided. Use focusArea to select.',
  tier: 'advise',
  domainKnowledge: '360-degree feedback, performance management, organizational development',
  manifest: { sourceCode: FEEDBACK_SOURCE, configSchema: FEEDBACK_CONFIG, persistenceEnv: 'EXECUTIVE_HOME', ui: { view: 'feedback' } },
  inputSchema: FEEDBACK_INPUT,
  outputSchema: executiveResultSchema('Feedback collection plan, analysis results, or performance metrics with derived themes'),
  triggers: [{ kind: 'user', phrase_examples: ['Collect feedback', 'Analyze feedback', 'Review performance'] }],
  isSkill: true,
});

FEEDBACK.configSchema = FEEDBACK_CONFIG;
withUxMetadata(FEEDBACK.inputSchema as SchemaRecord);
if (FEEDBACK.configSchema) withUxMetadata(FEEDBACK.configSchema);