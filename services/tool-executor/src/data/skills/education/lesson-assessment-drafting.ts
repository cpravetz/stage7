import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const EDUCATION_HOME = process.env.EDUCATION_HOME || '/tmp/education';

export const LESSON_ASSESSMENT_DRAFTING = createCodeSkill({
  id: 'education-lesson-assessment-drafting',
  name: 'Lesson & Assessment Drafting',
  description: 'Draft lesson plans, quizzes, activities, and multimedia-integrated content for teacher review. Runs as reasoning-only on the assistant model using curriculum standards and learner context.',
tier: 'advise',
domainKnowledge: 'Curriculum standards alignment, lesson design, assessment authoring, and rubric construction for teacher review',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `
const input = __tool_input || {};
const fs = require('fs');
const path = require('path');

const task = input.task || 'lesson-plan';
const subject = input.subject || '';
const grade = input.grade || '';
const topic = input.topic || '';
const duration = input.duration || 60;
const standards = input.standards || [];
const objectives = input.objectives || [];
const learnerProfile = input.learnerProfile || {};
const quizType = input.quizType || 'mixed';
const questionCount = input.questionCount || 10;
const difficulty = input.difficulty || 'medium';
const activityType = input.activityType || 'discussion';
const multimedia = input.multimedia || [];

const baseDir = process.env.EDUCATION_HOME || path.join('/tmp/education');
const storePath = path.join(baseDir, 'drafts.json');
fs.mkdirSync(baseDir, { recursive: true });
const store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];

let draft = { id: 'edu_draft_' + Date.now(), task, subject, grade, topic, duration, standards, objectives, createdAt: new Date().toISOString(), source: 'reasoning' };

const bloomLevels = ['Remember', 'Understand', 'Apply', 'Analyze', 'Evaluate', 'Create'];
const bloomsVerbs = {
  Remember: ['list', 'define', 'identify', 'recall', 'name', 'state'],
  Understand: ['explain', 'describe', 'summarize', 'interpret', 'classify', 'compare'],
  Apply: ['solve', 'demonstrate', 'use', 'illustrate', 'construct', 'execute'],
  Analyze: ['analyze', 'differentiate', 'organize', 'attribute', 'deconstruct', 'examine'],
  Evaluate: ['evaluate', 'critique', 'justify', 'defend', 'assess', 'rank'],
  Create: ['design', 'construct', 'produce', 'invent', 'formulate', 'generate'],
};

if (task === 'lesson-plan') {
  const phases = [
    { name: 'Warm-up / Hook', minutes: Math.max(5, Math.floor(duration * 0.1)), description: 'Activate prior knowledge, pose essential question' },
    { name: 'Direct Instruction', minutes: Math.max(10, Math.floor(duration * 0.25)), description: 'Model new concept, think-aloud, guided examples' },
    { name: 'Guided Practice', minutes: Math.max(15, Math.floor(duration * 0.35)), description: 'Students practice with scaffolding, teacher feedback' },
    { name: 'Independent Practice', minutes: Math.max(15, Math.floor(duration * 0.2)), description: 'Students apply independently, differentiation options' },
    { name: 'Closure / Exit Ticket', minutes: Math.max(5, Math.floor(duration * 0.1)), description: 'Check understanding, preview next lesson' },
  ];

  const materials = ['Whiteboard/projector', 'Student notebooks', 'Handouts/worksheets', ...multimedia];
  if (multimedia.length) materials.push(...multimedia.map(m => \`Multimedia: \${m}\`));

  draft.lessonPlan = {
    title: \`\${subject} - \${grade}: \${topic}\`,
    grade,
    subject,
    duration: \`\${duration} minutes\`,
    standards,
    objectives: objectives.length ? objectives : bloomLevels.slice(0, 3).map((level, i) => \`\${bloomsVerbs[level][0].charAt(0).toUpperCase() + bloomsVerbs[level][0].slice(1)} \${topic} (\${level})\`),
    phases,
    materials,
    differentiation: {
      support: ['Sentence frames', 'Visual aids', 'Peer pairing', 'Chunked instructions'],
      extension: ['Challenge problems', 'Real-world application', 'Peer teaching', 'Creative synthesis'],
    },
    assessment: 'Formative: exit ticket + observation. Summative: aligned quiz/project.',
    homework: \`Practice \${topic} with \${activityType} activity\`,
    reflection: 'Post-lesson: What worked? What needs adjustment? Student engagement level?',
  };
} else if (task === 'quiz') {
  const questionTypes = {
    'multiple-choice': { count: Math.floor(questionCount * 0.4), template: (i) => (\`Q\${i}: Which of the following best describes \${topic}? A) ... B) ... C) ... D) ...\`) },
    'true-false': { count: Math.floor(questionCount * 0.2), template: (i) => (\`Q\${i}: True or False — \${topic} statement.\`) },
    'short-answer': { count: Math.floor(questionCount * 0.2), template: (i) => (\`Q\${i}: Explain \${topic} in 2-3 sentences.\`) },
    'essay': { count: Math.floor(questionCount * 0.1), template: (i) => (\`Q\${i}: Analyze the impact of \${topic} on [context]. Support with evidence.\`) },
    'matching': { count: Math.floor(questionCount * 0.1), template: (i) => (\`Q\${i}: Match each term related to \${topic} with its definition.\`) },
  };

  const questions = [];
  let qNum = 1;
  for (const [type, config] of Object.entries(questionTypes)) {
    for (let j = 0; j < config.count; j++, qNum++) {
      questions.push({
        number: qNum,
        type,
        bloomLevel: bloomLevels[Math.min(Math.floor(qNum / 2), bloomLevels.length - 1)],
        stem: config.template(qNum),
        points: type === 'essay' ? 10 : type === 'short-answer' ? 5 : 2,
      });
    }
  }

  while (questions.length < questionCount) {
    questions.push({
      number: ++qNum,
      type: 'short-answer',
      bloomLevel: 'Understand',
      stem: \`Q\${qNum}: Describe one key concept about \${topic}.\`,
      points: 5,
    });
  }

  draft.quiz = {
    title: \`\${subject} Quiz: \${topic}\`,
    grade,
    subject,
    questionCount: questions.length,
    type: quizType,
    difficulty,
    questions: questions.slice(0, questionCount),
    answerKey: 'Available in teacher version',
    timeLimit: \`\${Math.ceil(questionCount * 1.5)} minutes\`,
  };
} else if (task === 'activity') {
  const activityTemplates = {
    discussion: { name: 'Socratic Seminar', steps: ['Pose open-ended question', 'Small group prep', 'Whole class dialogue', 'Reflection writing'], grouping: 'whole-class then small groups' },
    'group-work': { name: 'Jigsaw Activity', steps: ['Expert groups form', 'Research assigned subtopic', 'Teach home group', 'Synthesize'], grouping: 'expert groups → home groups' },
    lab: { name: 'Inquiry Lab', steps: ['Observe phenomenon', 'Form hypothesis', 'Design experiment', 'Collect data', 'Draw conclusions'], grouping: 'lab partners' },
    'project-based': { name: 'Mini-PBL', steps: ['Define driving question', 'Plan inquiry', 'Create product', 'Present findings', 'Reflect'], grouping: 'project teams' },
    game: { name: 'Review Game', steps: ['Form teams', 'Answer questions', 'Earn points', 'Debrief misconceptions'], grouping: 'competitive teams' },
    simulation: { name: 'Role-Play Simulation', steps: ['Assign roles', 'Brief scenario', 'Act out', 'Debrief decisions'], grouping: 'role-based groups' },
    writing: { name: 'Structured Writing', steps: ['Brainstorm', 'Outline', 'Draft', 'Peer review', 'Revise'], grouping: 'individual then pairs' },
    'digital-creation': { name: 'Multimedia Project', steps: ['Plan storyboard', 'Gather assets', 'Create in tool', 'Peer feedback', 'Publish/share'], grouping: 'individual or pairs' },
  };

  const template = activityTemplates[activityType] || activityTemplates.discussion;

  draft.activity = {
    title: \`\${activityType.charAt(0).toUpperCase() + activityType.slice(1)}: \${topic}\`,
    type: activityType,
    subject,
    grade,
    duration: \`\${Math.floor(duration * 0.6)}-\${Math.floor(duration * 0.8)} minutes\`,
    objectives: objectives.length ? objectives : [\`Engage with \${topic}\`, 'Collaborate with peers', 'Demonstrate understanding'],
    materials: ['Activity handout', 'Timer', ...(multimedia.length ? multimedia : ['Whiteboard'])],
    steps: template.steps.map((step, i) => (\`\${i + 1}. \${step}\`)),
    grouping: template.grouping,
    differentiation: {
      support: ['Graphic organizer', 'Sentence starters', 'Reduced complexity', 'Teacher check-ins'],
      extension: ['Add research component', 'Create extension product', 'Teach a peer', 'Connect to real world'],
    },
    assessment: 'Observation checklist + exit slip',
  };
} else if (task === 'content') {
  draft.content = {
    title: \`\${subject} Resource: \${topic}\`,
    type: 'instructional-material',
    format: input.contentFormat || 'handout',
    grade,
    subject,
    sections: [
      'Key Vocabulary (5-7 terms with definitions)',
      'Concept Explanation (clear, grade-appropriate language)',
      'Worked Examples (2-3 with step-by-step)',
      'Practice Problems (5-8, scaffolded difficulty)',
      'Real-World Connection',
      'Self-Check / Answer Key',
    ],
    readability: \`Grade \${grade} appropriate (Lexile estimate: \${grade * 100 + 200}L)\`,
    standards,
  };
} else if (task === 'multimedia') {
  const mediaPlan = [];
  if (multimedia.includes('video')) mediaPlan.push({ type: 'video', purpose: 'Concept introduction or demonstration', duration: '3-5 min', source: 'Curated or teacher-created' });
  if (multimedia.includes('simulation')) mediaPlan.push({ type: 'simulation', purpose: 'Interactive exploration', tool: 'PhET, Gizmos, or custom', integration: 'Embedded in LMS' });
  if (multimedia.includes('audio')) mediaPlan.push({ type: 'audio', purpose: 'Podcast/reading for accessibility', duration: '5-10 min', use: 'Differentiated instruction' });
  if (multimedia.includes('interactive')) mediaPlan.push({ type: 'interactive', purpose: 'Formative practice', tool: 'Nearpod, Pear Deck, Kahoot', timing: 'During guided practice' });
  if (multimedia.includes('vr-ar')) mediaPlan.push({ type: 'vr-ar', purpose: 'Immersive experience', tool: 'Google Expeditions, CoSpaces', note: 'Requires hardware access' });

  draft.multimediaPlan = {
    topic,
    subject,
    grade,
    media: mediaPlan.length ? mediaPlan : [{ type: 'video', purpose: 'Concept demo', duration: '3-5 min' }],
    integrationPoints: ['Warm-up hook', 'Direct instruction supplement', 'Station rotation', 'Homework flip'],
    accessibility: ['Closed captions', 'Transcripts', 'Audio descriptions', 'Keyboard navigation'],
  };
} else {
  console.log(JSON.stringify({ success: false, error: 'Invalid task. Use "lesson-plan", "quiz", "activity", "content", or "multimedia".' }));
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
      task: SchemaProps.select(['lesson-plan', 'quiz', 'activity', 'content', 'multimedia'], { description: 'What to draft' }),
      subject: SchemaProps.text({ description: 'Subject area (e.g., Mathematics, Science, ELA, History)' }),
      grade: SchemaProps.text({ description: 'Grade level (e.g., "5", "9-10", "11-12")' }),
      topic: SchemaProps.text({ description: 'Specific topic or unit' }),
      duration: SchemaProps.number({ description: 'Lesson duration in minutes', default: 60 }),
      standards: SchemaProps.stringArray({ description: 'Curriculum standards codes (e.g., CCSS.MATH.CONTENT.5.NF.A.1)' }),
      objectives: SchemaProps.stringArray({ description: 'Learning objectives (will generate from Bloom\'s if empty)' }),
      learnerProfile: { type: 'object', description: 'Learner context: reading level, interests, accommodations, prior knowledge' },
      quizType: SchemaProps.select(['multiple-choice', 'mixed', 'formative', 'summative'], { description: 'Quiz format', default: 'mixed' }),
      questionCount: SchemaProps.number({ description: 'Number of questions', default: 10 }),
      difficulty: SchemaProps.select(['easy', 'medium', 'hard', 'mixed'], { description: 'Difficulty level', default: 'medium' }),
      activityType: SchemaProps.select(['discussion', 'group-work', 'lab', 'project-based', 'game', 'simulation', 'writing', 'digital-creation'], { description: 'Activity type', default: 'discussion' }),
      multimedia: SchemaProps.stringArray({ description: 'Multimedia elements to integrate: video, simulation, audio, interactive, vr-ar' }),
      contentFormat: SchemaProps.select(['handout', 'slide-deck', 'worksheet', 'study-guide', 'anchor-chart'], { description: 'Content format', default: 'handout' }),
    },
    required: ['task', 'subject', 'topic'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean', description: 'Whether the draft was generated and stored' },
      data: { type: 'object', description: 'Generated lesson, assessment, activity, content, or multimedia draft' },
      error: { type: 'string', description: 'Validation or generation error when unsuccessful' },
    },
    required: ['success'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Draft a lesson plan', 'Create a quiz', 'Design a classroom activity', 'Prepare course content'] },
    { kind: 'schedule', cadence: 'Weekly curriculum and assessment review' },
    { kind: 'event', on: 'Curriculum unit, objective, or assessment requirement changes' },
    { kind: 'data', condition: 'Required subject, topic, standards, or learner context is missing' },
  ],
});
