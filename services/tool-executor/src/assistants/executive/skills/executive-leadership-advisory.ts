// @ts-nocheck

import { Tool, SchemaRecord } from '../../../types';
import { createDeclarativeCodeSkill, SchemaProps, createSchemaRecord } from '../../../adk/code-skill-factory';
import { executiveResultSchema } from '../executive-contract';

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

const LEADERSHIP_INPUT = createSchemaRecord({
  // Labelled options: the stored values stay stable identifiers while the select
  // shows wording the user can act on. "Eq assessment" told the user nothing.
  focusArea: SchemaProps.select([
    { value: 'coaching', label: 'Coaching conversation' },
    { value: 'decision-framework', label: 'Work through a decision' },
    { value: 'leadership-assessment', label: 'Assess my leadership' },
    { value: 'eq-assessment', label: 'Assess my emotional intelligence' },
    { value: 'presence-analyzer', label: 'How I come across' },
    { value: 'communication-analyzer', label: 'Analyse something I wrote or said' },
    { value: 'communication-coach', label: 'Improve a draft message' },
  ], { description: 'What you want help with', required: true }),
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

/**
 * Leadership advisory.
 *
 * Every branch structures supplied material and nothing more. Assessments return null
 * ratings instead of invented scores, the coaching plan leaves per-session focus and
 * outcomes unset for the executive to complete, and the decision framework is not scored
 * because scoring needs a human judgement the skill cannot make. The only numbers computed
 * here are word and sentence counts derived from text the caller actually supplied.
 */
const leadershipAdvisory = createDeclarativeCodeSkill({
  id: 'executive-leadership-advisory',
  name: 'Leadership Advisory',
  description: 'Coaching plans, decision frameworks, leadership/EQ/presence assessments, communication analysis and coaching. All outputs derived from supplied input. Use focusArea to select.',
  tier: 'advise',
  domainKnowledge: 'Executive coaching, leadership assessment, decision frameworks, communication strategy',
  persistenceEnvVar: 'EXECUTIVE_HOME',
  manifest: {
    persistenceEnv: 'EXECUTIVE_HOME',
    executiveHome: 'EXECUTIVE_HOME',
    ui: { view: 'leadership-advisory' },
  },
  configSchema: LEADERSHIP_CONFIG,
  inputSchema: LEADERSHIP_INPUT,
  outputSchema: executiveResultSchema('Leadership advisory results derived from supplied context and inputs'),
  triggers: [{ kind: 'user', phrase_examples: ['Coach me on leadership', 'Help me decide', 'Assess my leadership', 'Analyze communication'] }],
  isSkill: true,
  async handler(input, ctx) {
    const SAFETY =
      'Executive advisory only: coaching and assessments are for development; do not commit organizational resources or make binding decisions without proper authorization.';

    const data: any = input && typeof input === 'object' ? input : {};

    function fail(status: string, message: string, title: string, extra?: Record<string, unknown>) {
      const base: any = {
        success: false,
        status: status,
        error: message,
        data: null,
        present: [ctx.render.text('notice', title, [message, '', SAFETY])],
      };
      if (extra) {
        Object.keys(extra).forEach(function (key: string) {
          base[key] = extra[key];
        });
      }
      return base;
    }

    const focusArea = data.focusArea || 'coaching';
    const profile: any = {
      role: data.role || '',
      level: data.level || '',
      strengths: Array.isArray(data.strengths) ? data.strengths : [],
      gaps: Array.isArray(data.gaps) ? data.gaps : [],
      goals: Array.isArray(data.goals) ? data.goals : [],
      context: data.context || '',
    };

    let result: any = null;
    let lines: string[] = [];

    switch (focusArea) {
      case 'coaching': {
        const topics = Array.isArray(data.topics)
          ? data.topics
          : ['Self-awareness', 'Decision-making', 'Communication', 'Strategic thinking', 'Team leadership'];
        const sessionCount = typeof data.sessionCount === 'number' ? data.sessionCount : 4;
        const selected = topics.slice(0, sessionCount);

        lines = [
          'Coaching Plan',
          '=============',
          '',
          'Role: ' + (profile.role || 'unspecified'),
          'Level: ' + (profile.level || 'unspecified'),
          'Sessions planned: ' + selected.length,
          '',
          'Session topics:',
        ];

        selected.forEach(function (topic: any, i: number) {
          lines.push('  Session ' + (i + 1) + ': ' + String(topic));
          lines.push('     Focus: not set — define a specific focus for ' + String(topic));
          lines.push('     Preparation: not set — define pre-work for ' + String(topic));
          lines.push('     Desired outcome: not set — define the outcome for ' + String(topic));
          lines.push('');
        });

        lines.push('Strengths to leverage: ' + (profile.strengths.length ? profile.strengths.join(', ') : 'not specified'));
        lines.push('Development gaps to address: ' + (profile.gaps.length ? profile.gaps.join(', ') : 'not specified'));
        lines.push('Goals: ' + (profile.goals.length ? profile.goals.join(', ') : 'not specified'));
        lines.push('');
        lines.push('Note: Focus, preparation, and outcomes are left unset because they are yours to define.');

        result = {
          focusArea: 'coaching',
          sessionCount: selected.length,
          topicsSupplied: topics.length,
          sessions: selected.map(function (t: any) {
            return { topic: String(t), focus: null, preparation: null, outcome: null };
          }),
          strengths: profile.strengths,
          gaps: profile.gaps,
          goals: profile.goals,
          context: profile,
        };
        break;
      }

      case 'decision-framework': {
        const decision = data.decision || '';
        const options = Array.isArray(data.options) ? data.options : [];
        const criteria = Array.isArray(data.criteria) ? data.criteria : [];

        if (!decision && !options.length) {
          return fail('not-connected', 'Not connected: no decision or options provided for analysis', 'Input required', {
            data: { focusArea: 'decision-framework', missing: ['decision', 'options'] },
          });
        }

        lines = [
          'Decision Framework Analysis',
          '===========================',
          '',
          'Decision: ' + (decision || 'unspecified'),
          'Options (' + options.length + '):',
        ];

        if (options.length > 0) {
          options.forEach(function (opt: any, i: number) {
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
          criteria.forEach(function (c: any, i: number) {
            lines.push('  ' + (i + 1) + '. ' + String(c));
          });
          lines.push('');
        } else {
          lines.push('No evaluation criteria specified. Supply criteria for a structured comparison.');
          lines.push('');
        }

        lines.push('Recommended next steps:');
        lines.push('  1. Define or confirm evaluation criteria with weights');
        lines.push('  2. Score each option against each criterion');
        lines.push('  3. Calculate weighted scores');
        lines.push('  4. Identify risks and mitigation for top option');
        lines.push('  5. Define decision deadline and reversibility');
        lines.push('');
        lines.push('Note: This framework structures the decision. Scoring requires your judgment; no option');
        lines.push('is recommended here and none was preferred automatically.');

        result = {
          focusArea: 'decision-framework',
          decision: decision,
          options: options,
          criteria: criteria,
          scored: false,
          recommendation: null,
          context: profile,
        };
        break;
      }

      case 'leadership-assessment': {
        const competencies = Array.isArray(data.competencies)
          ? data.competencies
          : ['Strategic Thinking', 'Emotional Intelligence', 'Communication', 'Decision Making', 'Team Building', 'Change Management'];

        lines = [
          'Leadership Competency Assessment',
          '================================',
          '',
          'Role: ' + (profile.role || 'unspecified'),
          'Level: ' + (profile.level || 'unspecified'),
          'Competencies assessed: ' + competencies.length,
          '',
          'Assessment framework:',
        ];

        competencies.forEach(function (c: any, i: number) {
          lines.push('  ' + (i + 1) + '. ' + String(c));
          lines.push('     Self-Rating: not provided (supply 1-10 scale)');
          lines.push('     Target Rating: not provided (supply 1-10 scale)');
          lines.push('     Evidence: not provided — supply specific examples demonstrating ' + String(c));
          lines.push('');
        });

        lines.push('Strengths identified: ' + (profile.strengths.length ? profile.strengths.join(', ') : 'not specified'));
        lines.push('Development gaps: ' + (profile.gaps.length ? profile.gaps.join(', ') : 'not specified'));
        lines.push('');
        lines.push('Note: Ratings and evidence must be supplied for a complete assessment. None were invented here.');

        result = {
          focusArea: 'leadership-assessment',
          competencies: competencies.map(function (c: any) {
            return { name: String(c), selfRating: null, targetRating: null, evidence: [] };
          }),
          strengths: profile.strengths,
          gaps: profile.gaps,
          context: profile,
        };
        break;
      }

      case 'eq-assessment': {
        const dimensions = Array.isArray(data.dimensions)
          ? data.dimensions
          : ['Self-Awareness', 'Self-Regulation', 'Motivation', 'Empathy', 'Social Skill'];

        lines = [
          'Emotional Intelligence Assessment',
          '=================================',
          '',
          'Role: ' + (profile.role || 'unspecified'),
          'Dimensions assessed: ' + dimensions.length,
          '',
          'Assessment framework:',
        ];

        dimensions.forEach(function (d: any, i: number) {
          lines.push('  ' + (i + 1) + '. ' + String(d));
          lines.push('     Score: not provided (supply 1-10 or a validated instrument score)');
          lines.push('     Descriptor: not provided — describe behavioral indicators for ' + String(d));
          lines.push('');
        });

        lines.push('Note: Scores and behavioral descriptors must be supplied or obtained from a validated EQ');
        lines.push('instrument. No score was estimated for you.');

        result = {
          focusArea: 'eq-assessment',
          dimensions: dimensions.map(function (d: any) {
            return { name: String(d), score: null, descriptor: null };
          }),
          context: profile,
        };
        break;
      }

      case 'presence-analyzer': {
        const sessions = Array.isArray(data.sessions) ? data.sessions : [];
        const factors = ['Body Language', 'Vocal Tone', 'Engagement', 'Clarity', 'Authority', 'Authenticity'];

        lines = [
          'Executive Presence Analysis',
          '===========================',
          '',
          'Role: ' + (profile.role || 'unspecified'),
          'Sessions analyzed: ' + sessions.length,
          'Presence factors: ' + factors.join(', '),
          '',
        ];

        if (sessions.length > 0) {
          lines.push('Session data provided:');
          sessions.forEach(function (s: any, i: number) {
            const topic = s && s.topic ? String(s.topic) : 'Session ' + (i + 1);
            const description = s && s.description ? String(s.description) : '';
            lines.push('  ' + (i + 1) + '. ' + topic + (description ? ' — ' + description : ''));
          });
          lines.push('');
          lines.push('Factor analysis (requires observation data):');
          factors.forEach(function (f: string) {
            lines.push('  ' + f + ': not assessed (supply observation notes per session)');
          });
        } else {
          lines.push('No session data provided. Supply session recordings, transcripts, or observer notes for analysis.');
          lines.push('');
          lines.push('Framework for analysis when data is available:');
          factors.forEach(function (f: string) {
            lines.push('  ' + f + ': not rated (supply a 1-10 rating with specific behavioral observations)');
          });
        }

        lines.push('');
        lines.push('Note: Presence analysis requires observational data. This framework structures the');
        lines.push('assessment and reports no presence rating of its own.');

        result = {
          focusArea: 'presence-analyzer',
          sessionCount: sessions.length,
          sessions: sessions,
          factors: factors,
          ratings: {},
          context: profile,
        };
        break;
      }

      case 'communication-analyzer': {
        const text = data.text || data.transcript || '';
        const dimensions = ['Clarity', 'Conciseness', 'Tone', 'Persuasiveness', 'Structure', 'Empathy'];

        if (!text.trim()) {
          return fail('not-connected', 'Not connected: no text or transcript provided for communication analysis', 'Input required', {
            data: { focusArea: 'communication-analyzer', missing: ['text', 'transcript'] },
          });
        }

        // Derived strictly from the supplied text; these counts carry no quality judgement.
        const wordCount = text.split(/\s+/).filter(function (w: string) { return w.length > 0; }).length;
        const sentenceCount = text.split(/[.!?]+/).filter(function (s: string) { return s.trim().length > 0; }).length;
        const avgWordsPerSentence = sentenceCount > 0 ? Math.round(wordCount / sentenceCount) : 0;
        const paragraphCount = text.split(/\n\s*\n/).filter(function (p: string) { return p.trim().length > 0; }).length;

        lines = [
          'Communication Analysis',
          '======================',
          '',
          'Channel: ' + (data.channel || 'unspecified'),
          'Audience: ' + (data.audience || 'unspecified'),
          '',
          'Text metrics (derived from your text):',
          '  Word count: ' + wordCount,
          '  Sentence count: ' + sentenceCount,
          '  Avg words/sentence: ' + avgWordsPerSentence,
          '  Paragraph count: ' + paragraphCount,
          '',
          'Dimension framework (requires your assessment):',
        ];

        dimensions.forEach(function (d: string, i: number) {
          lines.push('  ' + (i + 1) + '. ' + d + ': not rated (supply 1-10 with specific examples from the text)');
        });

        lines.push('');
        lines.push('Text excerpt (first 500 chars):');
        lines.push(text.slice(0, 500) + (text.length > 500 ? '...' : ''));
        lines.push('');
        lines.push('Note: Dimension ratings require human judgment. The metrics above are computed from the');
        lines.push('supplied text only; no dimension was scored here.');

        result = {
          focusArea: 'communication-analyzer',
          channel: data.channel || null,
          audience: data.audience || null,
          text: text,
          dimensions: dimensions,
          ratings: {},
          metrics: {
            wordCount: wordCount,
            sentenceCount: sentenceCount,
            avgWordsPerSentence: avgWordsPerSentence,
            paragraphCount: paragraphCount,
          },
          context: profile,
        };
        break;
      }

      case 'communication-coach': {
        const message = data.message || data.draft || '';
        const channel = data.channel || 'unknown';
        const audience = data.audience || '';
        const suggestions = Array.isArray(data.suggestions)
          ? data.suggestions
          : ['Review clarity', 'Check tone', 'Strengthen opening', 'Verify audience alignment'];

        if (!message.trim()) {
          return fail('not-connected', 'Not connected: no message or draft provided for coaching', 'Input required', {
            data: { focusArea: 'communication-coach', missing: ['message', 'draft'] },
          });
        }

        const wordCount = message.split(/\s+/).filter(function (w: string) { return w.length > 0; }).length;
        const sentenceCount = message.split(/[.!?]+/).filter(function (s: string) { return s.trim().length > 0; }).length;

        lines = [
          'Communication Coaching',
          '======================',
          '',
          'Channel: ' + channel,
          'Audience: ' + (audience || 'unspecified'),
          'Message length: ' + wordCount + ' words, ' + sentenceCount + ' sentences',
          '',
          'Message:',
          message,
          '',
          'Coaching suggestions:',
        ];

        suggestions.forEach(function (s: any, i: number) { lines.push('  ' + (i + 1) + '. ' + String(s)); });

        lines.push('');
        lines.push('Quick checks:');
        lines.push('  - Opening: Does the first sentence state the purpose?');
        lines.push('  - Audience: Is the language appropriate for ' + (audience || 'the intended audience') + '?');
        lines.push('  - Tone: Is the tone constructive and professional?');
        lines.push('  - Call to action: Is the desired response clear?');
        lines.push('  - Length: ' + (wordCount > 200 ? 'Consider condensing' : wordCount < 50 ? 'Consider adding context' : 'Appropriate length'));
        lines.push('');
        lines.push('Note: Suggestions are general guidelines. Context-specific coaching requires your');
        lines.push('judgment; no rewrite of your message was produced.');

        result = {
          focusArea: 'communication-coach',
          message: message,
          channel: channel,
          audience: audience || null,
          suggestions: suggestions,
          rewrittenMessage: null,
          metrics: { wordCount: wordCount, sentenceCount: sentenceCount },
          context: profile,
        };
        break;
      }

      default:
        return fail('error', 'Unknown focusArea: ' + focusArea, 'Invalid focusArea', {
          data: {
            focusArea: focusArea,
            supported: [
              'coaching',
              'decision-framework',
              'leadership-assessment',
              'eq-assessment',
              'presence-analyzer',
              'communication-analyzer',
              'communication-coach',
            ],
          },
        });
    }

    // History is a convenience only: an unreachable store never costs the caller their report.
    const stored = ctx.store.load('leadership-advisory', []);
    const history: any[] = Array.isArray(stored) ? stored : [];
    history.push(Object.assign({ createdAt: new Date().toISOString() }, result));
    ctx.store.save('leadership-advisory', history);

    return {
      success: true,
      status: 'ok',
      data: Object.assign(
        { persisted: true, storeKey: 'leadership-advisory', recordCount: history.length, storePath: ctx.store.getFilePath('leadership-advisory') },
        result,
      ),
      error: null,
      present: [ctx.render.text('leadership-advisory', 'Leadership advisory', lines)],
    };
  },
});

const LEADERSHIP_ADVISORY: Tool = leadershipAdvisory;

LEADERSHIP_ADVISORY.configSchema = LEADERSHIP_CONFIG;
withUxMetadata(LEADERSHIP_ADVISORY.inputSchema as SchemaRecord);
if (LEADERSHIP_ADVISORY.configSchema) withUxMetadata(LEADERSHIP_ADVISORY.configSchema);

export { LEADERSHIP_ADVISORY };
