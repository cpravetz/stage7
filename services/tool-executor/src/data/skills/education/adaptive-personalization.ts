import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const EDUCATION_HOME = process.env.EDUCATION_HOME || '/tmp/education';

export const ADAPTIVE_PERSONALIZATION = createCodeSkill({
  id: 'education_adaptive_personalization',
  name: 'Adaptive Personalization Advisory',
  description: 'Recommend instructional adaptations and engagement strategies based on Learner Insight output. Reasoning-only: consumes learner analytics to suggest differentiation, pacing, and interventions.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const learnerId = input.learnerId || '';
const insightData = input.insightData || {};
const courseContext = input.courseContext || {};
const teacherGoals = input.teacherGoals || [];

const baseDir = process.env.EDUCATION_HOME || path.join('/tmp/education');
const storePath = path.join(baseDir, 'adaptations.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

if (!learnerId) {
  console.log(JSON.stringify({ success: false, error: 'learnerId is required' }));
  return;
}

const learningStyle = insightData.learningStyle || 'multimodal';
const performanceLevel = insightData.performanceLevel || 'on-track';
const progressRate = insightData.progressRate || 'steady';
const motivationLevel = insightData.motivationLevel || 'moderate';
const engagementScore = insightData.engagementScore || 50;
const riskFlags = insightData.riskFlags || [];

const adaptations = {
  pacing: [],
  content: [],
  process: [],
  product: [],
  environment: [],
  engagement: [],
};

if (performanceLevel === 'below' || riskFlags.includes('academic-struggle')) {
  adaptations.pacing.push('Slow pace: pre-teach vocabulary, chunk instruction, increase guided practice');
  adaptations.content.push('Scaffolded materials: graphic organizers, sentence frames, worked examples');
  adaptations.process.push('More frequent check-ins, explicit modeling, step-by-step directions');
  adaptations.product.push('Alternative assessments: oral response, visual representation, reduced scope');
}

if (performanceLevel === 'above') {
  adaptations.pacing.push('Accelerate: compact curriculum, offer extension menus, independent inquiry');
  adaptations.content.push('Enrichment: advanced texts, cross-curricular connections, real-world problems');
  adaptations.process.push('Self-directed learning, peer teaching, flexible grouping');
  adaptations.product.push('Choice boards, creative synthesis, portfolio artifacts');
}

const styleAdaptations = {
  visual: { content: ['Diagrams, charts, color-coding, mind maps', 'Video demos, visual anchors'], process: ['Graphic organizers for note-taking', 'Visual schedules'], product: ['Infographics, posters, slides'] },
  auditory: { content: ['Podcasts, read-alouds, verbal explanations'], process: ['Think-pair-share, discussions', 'Audio recordings of lessons'], product: ['Oral presentations, podcasts, debates'] },
  kinesthetic: { content: ['Manipulatives, models, movement breaks'], process: ['Station rotations, labs, simulations'], product: ['Built models, acted scenarios, coded projects'] },
  reading: { content: ['Annotated texts, guided notes, summaries'], process: ['Close reading, written reflections'], product: ['Essays, journals, written explanations'] },
  multimodal: { content: ['Mix of all modalities'], process: ['Choice in how to learn'], product: ['Choice in how to demonstrate'] },
};

const styleAdapt = styleAdaptations[learningStyle] || styleAdaptations.multimodal;
adaptations.content.push(...styleAdapt.content);
adaptations.process.push(...styleAdapt.process);
adaptations.product.push(...styleAdapt.product);

if (motivationLevel === 'low' || engagementScore < 40) {
  adaptations.engagement.push('Gamification: points, badges, progress bars');
  adaptations.engagement.push('Relevance: connect to interests, real-world applications');
  adaptations.engagement.push('Autonomy: choice in topics, products, partners');
  adaptations.engagement.push('Relationship: mentor check-ins, peer buddies, family contact');
}

if (progressRate === 'slow') {
  adaptations.pacing.push('Mastery-based: require 80% before advancing, spiral review');
  adaptations.process.push('Intervention blocks, targeted skill practice, progress monitoring weekly');
}

const recommendations = {
  immediate: adaptations.pacing.slice(0, 2).concat(adaptations.content.slice(0, 2)),
  shortTerm: adaptations.process.slice(0, 2).concat(adaptations.engagement.slice(0, 2)),
  longTerm: adaptations.product.slice(0, 2).concat(adaptations.environment.slice(0, 2)),
  monitoring: ['Weekly progress check on target skills', 'Bi-weekly engagement survey', 'Monthly learning style re-assessment'],
};

const adaptation = {
  learnerId,
  timestamp: new Date().toISOString(),
  insightSummary: { learningStyle, performanceLevel, progressRate, motivationLevel, engagementScore, riskFlags },
  adaptations,
  recommendations,
  rationale: 'Based on ' + learningStyle + ' learning style, ' + performanceLevel + ' performance, ' + motivationLevel + ' motivation. ' + (riskFlags.length ? 'Risk flags: ' + riskFlags.join(', ') : 'No risk flags.'),
  teacherNotes: 'Review with learner, co-create 1-2 goals, schedule follow-up in 2 weeks.',
};

store.push(adaptation);
fs.writeFileSync(storePath, JSON.stringify(store, null, 2));

console.log(JSON.stringify({ success: true, data: { adaptation, storePath } }));
`,
  },
  inputSchema: {
    type: 'object',
    properties: {
      learnerId: SchemaProps.text({ description: 'Student/learner identifier' }),
      insightData: { type: 'object', description: 'Output from Learner Insight skill: learningStyle, performanceLevel, progressRate, motivationLevel, engagementScore, riskFlags' },
      courseContext: { type: 'object', description: 'Course info: subject, grade, current unit, upcoming assessments' },
      teacherGoals: SchemaProps.stringArray({ description: 'Teacher priorities for this learner' }),
    },
    required: ['learnerId'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether personalized recommendations were generated and stored' },
      data: { type: 'object', description: 'Tiered pacing, content, process, product, and engagement adaptations' },
      error: { type: 'string', description: 'Validation or adaptation error when unsuccessful' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Recommend learner adaptations', 'Create an intervention plan', 'Adjust pacing for a student'] },
    { kind: 'schedule', cadence: 'Weekly learner adaptation review' },
    { kind: 'event', on: 'New learner insight, assessment result, or teacher goal is available' },
    { kind: 'data', condition: 'Learner risk, engagement, or mastery threshold requires an instructional response' },
  ],
});
