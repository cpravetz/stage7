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
const SAFETY_BOUNDARY = 'Executive advisory only: coaching and assessments are for development; do not commit organizational resources or make binding decisions without proper authorization.';

const LEADERSHIP_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';
  const SAFETY = ${JSON.stringify(SAFETY_BOUNDARY)};

  function fail(status, message, title, extra) {
    const base = { success: false, status: status, error: message, data: null, present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }] };
    if (extra) { for (const key in extra) { base[key] = extra[key]; } }
    console.log(JSON.stringify(base));
  }

  const focusArea = input.focusArea || 'coaching';
  const executiveId = input.executiveId || '';
  const baseDir = process.env.EXECUTIVE_HOME || '/tmp/executive';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'leadership-advisory.json');
  fs.mkdirSync(baseDir, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  const ctx = { 
    role: input.role || '', 
    level: input.level || '', 
    strengths: Array.isArray(input.strengths) ? input.strengths : [], 
    gaps: Array.isArray(input.gaps) ? input.gaps : [], 
    goals: Array.isArray(input.goals) ? input.goals : [], 
    context: input.context || '' 
  };

  let result;
  let present;
  switch (focusArea) {
    case 'coaching': {
      const topics = Array.isArray(input.topics) ? input.topics : ['Self-awareness', 'Decision-making', 'Communication', 'Strategic thinking', 'Team leadership'];
      const sessionCount = typeof input.sessionCount === 'number' ? input.sessionCount : 4;

      const lines = [
        'Coaching Plan',
        '=============',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Role: ' + (ctx.role || 'unspecified'),
        'Level: ' + (ctx.level || 'unspecified'),
        'Sessions planned: ' + sessionCount,
        '',
        'Session topics:',
      ];

      topics.slice(0, sessionCount).forEach(function(topic, i) {
        lines.push('  Session ' + (i + 1) + ': ' + String(topic));
        lines.push('     Focus: [define specific focus for ' + String(topic) + ']');
        lines.push('     Preparation: [define pre-work for ' + String(topic) + ']');
        lines.push('     Desired outcome: [define outcome for ' + String(topic) + ']');
        lines.push('');
      });

      lines.push('Strengths to leverage: ' + (ctx.strengths.length ? ctx.strengths.join(', ') : 'not specified'));
      lines.push('Development gaps to address: ' + (ctx.gaps.length ? ctx.gaps.join(', ') : 'not specified'));
      lines.push('Goals: ' + (ctx.goals.length ? ctx.goals.join(', ') : 'not specified'));
      lines.push('');
      lines.push('Note: Specific focus, preparation, and outcomes must be defined per session.');

      result = { focusArea: 'coaching', executiveId, sessions: topics.slice(0, sessionCount).map(function(t) { return { topic: String(t), focus: '', preparation: '', outcome: '' }; }), ctx };
      present = [{ id: 'coaching-plan', title: 'Executive Coaching Plan', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'decision-framework': {
      const decision = input.decision || '';
      const options = Array.isArray(input.options) ? input.options : [];
      const criteria = Array.isArray(input.criteria) ? input.criteria : [];

      if (!decision && !options.length) {
        fail('not-connected', 'Not connected: no decision or options provided for analysis', 'Input required');
        return;
      }

      const lines = [
        'Decision Framework Analysis',
        '===========================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Decision: ' + (decision || 'unspecified'),
        'Options (' + options.length + '):',
      ];

      if (options.length > 0) {
        options.forEach(function(opt, i) {
          const label = opt && opt.label ? String(opt.label) : String(opt);
          const description = opt && opt.description ? String(opt.description) : '';
          lines.push('  ' + (i + 1) + '. ' + label + (description ? ' — ' + description : ''));
        });
      } else {
        lines.push('  No options provided');
      }
      lines.push('');

      if (criteria.length > 0) {
        lines.push('Evaluation criteria (' + criteria.length + '):');
        criteria.forEach(function(c, i) { lines.push('  ' + (i + 1) + '. ' + String(c)); });
        lines.push('');
      } else {
        lines.push('No evaluation criteria specified. Define criteria for structured comparison.');
        lines.push('');
      }

      lines.push('Recommended next steps:');
      lines.push('  1. Define or confirm evaluation criteria with weights');
      lines.push('  2. Score each option against each criterion');
      lines.push('  3. Calculate weighted scores');
      lines.push('  4. Identify risks and mitigation for top option');
      lines.push('  5. Define decision deadline and reversibility');
      lines.push('');
      lines.push('Note: This framework structures the decision. Scoring requires your judgment.');

      result = { focusArea: 'decision-framework', executiveId, decision, options, criteria, ctx };
      present = [{ id: 'decision-framework', title: 'Executive Decision Framework', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'leadership-assessment': {
      const competencies = Array.isArray(input.competencies) ? input.competencies : ['Strategic Thinking', 'Emotional Intelligence', 'Communication', 'Decision Making', 'Team Building', 'Change Management'];

      const lines = [
        'Leadership Competency Assessment',
        '================================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Role: ' + (ctx.role || 'unspecified'),
        'Level: ' + (ctx.level || 'unspecified'),
        'Competencies assessed: ' + competencies.length,
        '',
        'Assessment framework:',
      ];

      competencies.forEach(function(c, i) {
        lines.push('  ' + (i + 1) + '. ' + String(c));
        lines.push('     Self-Rating: not provided (supply 1-10 scale)');
        lines.push('     Target Rating: not provided (supply 1-10 scale)');
        lines.push('     Evidence: [provide specific examples demonstrating ' + String(c) + ']');
        lines.push('');
      });

      lines.push('Strengths identified: ' + (ctx.strengths.length ? ctx.strengths.join(', ') : 'not specified'));
      lines.push('Development gaps: ' + (ctx.gaps.length ? ctx.gaps.join(', ') : 'not specified'));
      lines.push('');
      lines.push('Note: Ratings and evidence must be supplied for a complete assessment.');

      result = { focusArea: 'leadership-assessment', executiveId, competencies: competencies.map(function(c) { return { name: String(c), selfRating: null, targetRating: null, evidence: [] }; }), ctx };
      present = [{ id: 'leadership-assessment', title: 'Executive Leadership Assessment', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'eq-assessment': {
      const dimensions = Array.isArray(input.dimensions) ? input.dimensions : ['Self-Awareness', 'Self-Regulation', 'Motivation', 'Empathy', 'Social Skill'];

      const lines = [
        'Emotional Intelligence Assessment',
        '=================================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Role: ' + (ctx.role || 'unspecified'),
        'Dimensions assessed: ' + dimensions.length,
        '',
        'Assessment framework:',
      ];

      dimensions.forEach(function(d, i) {
        lines.push('  ' + (i + 1) + '. ' + String(d));
        lines.push('     Score: not provided (supply 1-10 or validated instrument score)');
        lines.push('     Descriptor: [describe behavioral indicators for ' + String(d) + ']');
        lines.push('');
      });

      lines.push('Note: Scores and behavioral descriptors must be supplied or obtained from a validated EQ instrument.');

      result = { focusArea: 'eq-assessment', executiveId, dimensions: dimensions.map(function(d) { return { name: String(d), score: null, descriptor: '' }; }), ctx };
      present = [{ id: 'eq-assessment', title: 'Executive EQ Assessment', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'presence-analyzer': {
      const sessions = Array.isArray(input.sessions) ? input.sessions : [];
      const factors = ['Body Language', 'Vocal Tone', 'Engagement', 'Clarity', 'Authority', 'Authenticity'];

      const lines = [
        'Executive Presence Analysis',
        '===========================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Role: ' + (ctx.role || 'unspecified'),
        'Sessions analyzed: ' + sessions.length,
        'Presence factors: ' + factors.join(', '),
        '',
      ];

      if (sessions.length > 0) {
        lines.push('Session data provided:');
        sessions.forEach(function(s, i) {
          const topic = s && s.topic ? String(s.topic) : 'Session ' + (i + 1);
          const description = s && s.description ? String(s.description) : '';
          lines.push('  ' + (i + 1) + '. ' + topic + (description ? ' — ' + description : ''));
        });
        lines.push('');
        lines.push('Factor analysis (requires observation data):');
        factors.forEach(function(f) { lines.push('  ' + f + ': not assessed (supply observation notes per session)'); });
      } else {
        lines.push('No session data provided. Supply session recordings, transcripts, or observer notes for analysis.');
        lines.push('');
        lines.push('Framework for analysis when data is available:');
        factors.forEach(function(f) { lines.push('  ' + f + ': [rate 1-10 with specific behavioral observations]'); });
      }

      lines.push('');
      lines.push('Note: Presence analysis requires observational data. This framework structures the assessment.');

      result = { focusArea: 'presence-analyzer', executiveId, sessions, factors, ctx };
      present = [{ id: 'presence-analysis', title: 'Executive Presence Analysis', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'communication-analyzer': {
      const text = input.text || input.transcript || '';
      const dimensions = ['Clarity', 'Conciseness', 'Tone', 'Persuasiveness', 'Structure', 'Empathy'];

      if (!text.trim()) {
        fail('not-connected', 'Not connected: no text or transcript provided for communication analysis', 'Input required');
        return;
      }

      // Derive basic metrics from the text
      const wordCount = text.split(/\\s+/).filter(function(w) { return w.length > 0; }).length;
      const sentenceCount = text.split(/[.!?]+/).filter(function(s) { return s.trim().length > 0; }).length;
      const avgWordsPerSentence = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;
      const paragraphCount = text.split(/\\n\\s*\\n/).filter(function(p) { return p.trim().length > 0; }).length;

      const lines = [
        'Communication Analysis',
        '======================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Channel: ' + (input.channel || 'unspecified'),
        'Audience: ' + (input.audience || 'unspecified'),
        '',
        'Text metrics (derived):',
        '  Word count: ' + wordCount,
        '  Sentence count: ' + sentenceCount,
        '  Avg words/sentence: ' + avgWordsPerSentence,
        '  Paragraph count: ' + paragraphCount,
        '',
        'Dimension framework (requires your assessment):',
      ];

      dimensions.forEach(function(d, i) {
        lines.push('  ' + (i + 1) + '. ' + d + ': [rate 1-10 with specific examples from text]');
      });

      lines.push('');
      lines.push('Text excerpt (first 500 chars):');
      lines.push(text.slice(0, 500) + (text.length > 500 ? '...' : ''));
      lines.push('');
      lines.push('Note: Dimension ratings require human judgment. Metrics above are computed from the supplied text.');

      result = { focusArea: 'communication-analyzer', executiveId, text, dimensions, metrics: { wordCount, sentenceCount, avgWordsPerSentence, paragraphCount }, ctx };
      present = [{ id: 'communication-analysis', title: 'Executive Communication Analysis', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'communication-coach': {
      const message = input.message || input.draft || '';
      const channel = input.channel || 'unknown';
      const audience = input.audience || '';
      const suggestions = Array.isArray(input.suggestions) ? input.suggestions : ['Review clarity', 'Check tone', 'Strengthen opening', 'Verify audience alignment'];

      if (!message.trim()) {
        fail('not-connected', 'Not connected: no message or draft provided for coaching', 'Input required');
        return;
      }

      const wordCount = message.split(/\\s+/).filter(function(w) { return w.length > 0; }).length;
      const sentenceCount = message.split(/[.!?]+/).filter(function(s) { return s.trim().length > 0; }).length;

      const lines = [
        'Communication Coaching',
        '======================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Channel: ' + channel,
        'Audience: ' + (audience || 'unspecified'),
        'Message length: ' + wordCount + ' words, ' + sentenceCount + ' sentences',
        '',
        'Message:',
        message,
        '',
        'Coaching suggestions:',
      ];

      suggestions.forEach(function(s, i) { lines.push('  ' + (i + 1) + '. ' + String(s)); });

      lines.push('');
      lines.push('Quick checks:');
      lines.push('  - Opening: Does the first sentence state the purpose?');
      lines.push('  - Audience: Is the language appropriate for ' + (audience || 'the intended audience') + '?');
      lines.push('  - Tone: Is the tone constructive and professional?');
      lines.push('  - Call to action: Is the desired response clear?');
      lines.push('  - Length: ' + (wordCount > 200 ? 'Consider condensing' : wordCount < 50 ? 'Consider adding context' : 'Appropriate length'));
      lines.push('');
      lines.push('Note: Suggestions are general guidelines. Context-specific coaching requires your judgment.');

      result = { focusArea: 'communication-coach', executiveId, message, channel, audience, suggestions, ctx };
      present = [{ id: 'communication-coaching', title: 'Executive Communication Coaching', kind: 'text', body: lines.join(NL) }];
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

const LEADERSHIP_INPUT = createSchemaRecord({
  focusArea: SchemaProps.select(['coaching', 'decision-framework', 'leadership-assessment', 'eq-assessment', 'presence-analyzer', 'communication-analyzer', 'communication-coach'], { description: 'Leadership advisory area', required: true }),
  executiveId: SchemaProps.text({ description: 'Executive identifier' }),
  role: SchemaProps.text({ description: 'Current role' }),
  level: SchemaProps.text({ description: 'Seniority level' }),
  context: SchemaProps.text({ description: 'Additional context' }),
  strengths: SchemaProps.stringArray({ description: 'Known strengths' }),
  gaps: SchemaProps.stringArray({ description: 'Known development gaps' }),
  goals: SchemaProps.stringArray({ description: 'Goals' }),
  decision: SchemaProps.text({ description: 'Decision to analyze' }),
  options: SchemaProps.objectArray(SchemaProps.object({
    label: SchemaProps.text({}),
    description: SchemaProps.text({}),
  }), { description: 'Options to evaluate' }),
  criteria: SchemaProps.stringArray({ description: 'Decision criteria' }),
  competencies: SchemaProps.stringArray({ description: 'Competencies to assess' }),
  dimensions: SchemaProps.stringArray({ description: 'Dimensions to evaluate' }),
  text: SchemaProps.text({ description: 'Text to analyze', multiline: true }),
  transcript: SchemaProps.text({ description: 'Transcript', multiline: true }),
  message: SchemaProps.text({ description: 'Message to coach', multiline: true }),
  draft: SchemaProps.text({ description: 'Draft message', multiline: true }),
  channel: SchemaProps.text({ description: 'Communication channel' }),
  audience: SchemaProps.text({ description: 'Target audience' }),
  sessions: SchemaProps.objectArray(SchemaProps.object({
    topic: SchemaProps.text({}),
    description: SchemaProps.text({}),
  }), { description: 'Session data' }),
  topics: SchemaProps.stringArray({ description: 'Coaching topics' }),
  sessionCount: SchemaProps.integer({ description: 'Number of coaching sessions' }),
}, { required: ['focusArea'] });

const LEADERSHIP_CONFIG = createSchemaRecord({
  executiveHome: SchemaProps.text({ description: 'Executive workspace path; defaults to EXECUTIVE_HOME' }),
});

export const LEADERSHIP_ADVISORY = createCodeSkill({
  id: 'executive-leadership-advisory',
  name: 'Leadership Advisory',
  description: 'Coaching plans, decision frameworks, leadership/EQ/presence assessments, communication analysis and coaching. All outputs derived from supplied input. Use focusArea to select.',
  tier: 'advise',
  domainKnowledge: 'Executive coaching, leadership assessment, decision frameworks, communication strategy',
  manifest: { sourceCode: LEADERSHIP_SOURCE, configSchema: LEADERSHIP_CONFIG, persistenceEnv: 'EXECUTIVE_HOME', ui: { view: 'leadership-advisory' } },
  inputSchema: LEADERSHIP_INPUT,
  outputSchema: executiveResultSchema('Leadership advisory results derived from supplied context and inputs'),
  triggers: [{ kind: 'user', phrase_examples: ['Coach me on leadership', 'Help me decide', 'Assess my leadership', 'Analyze communication'] }],
  isSkill: true,
});

LEADERSHIP_ADVISORY.configSchema = LEADERSHIP_CONFIG;
withUxMetadata(LEADERSHIP_ADVISORY.inputSchema as SchemaRecord);
if (LEADERSHIP_ADVISORY.configSchema) withUxMetadata(LEADERSHIP_ADVISORY.configSchema);