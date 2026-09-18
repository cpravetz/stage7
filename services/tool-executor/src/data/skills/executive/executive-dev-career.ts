import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const EXECUTIVE_HOME = process.env.EXECUTIVE_HOME || '/tmp/executive';

const DEV_CAREER_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const focusArea = input.focusArea || 'skill-gap';
  const executiveId = input.executiveId || '';
  const baseDir = process.env.EXECUTIVE_HOME || '${EXECUTIVE_HOME}';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'dev-career.json');
  fs.mkdirSync(baseDir, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  const profile = { role: input.role || '', level: input.level || '', currentSkills: input.currentSkills || [], targetSkills: input.targetSkills || [], interests: input.interests || [], constraints: input.constraints || [], timeframe: input.timeframe || '' };

  let result;
  switch (focusArea) {
    case 'skill-gap':
      result = { focusArea: 'skill-gap', executiveId, current: profile.currentSkills, target: profile.targetSkills, gaps: profile.targetSkills.filter(s => !profile.currentSkills.includes(s)), context: profile };
      break;
    case 'development-plan':
      result = { focusArea: 'development-plan', executiveId, skills: (input.skills || profile.targetSkills).map(s => ({ skill: s, currentLevel: 'unknown', targetLevel: 'proficient', actions: [], milestones: [] })), timeframe: profile.timeframe, context: profile };
      break;
    case 'improvement-plan':
      result = { focusArea: 'improvement-plan', executiveId, areas: (input.areas || profile.gaps || []).map(a => ({ area: a, currentState: '', targetState: '', actions: [], metrics: [] })), context: profile };
      break;
    case 'career-planner':
      result = { focusArea: 'career-planner', executiveId, currentRole: profile.role, targetRoles: (input.targetRoles || []).map(r => ({ role: r, feasibility: 'pending', gapAnalysis: null, steps: [] })), interests: profile.interests, constraints: profile.constraints, context: profile };
      break;
    case 'career-roadmap':
      result = { focusArea: 'career-roadmap', executiveId, targetRole: input.targetRole || '', milestones: (input.milestones || []).map(m => ({ name: m, targetDate: '', status: 'pending', dependencies: [], completed: false })), timeframe: profile.timeframe, context: profile };
      break;
    case 'resource-recommender':
      result = { focusArea: 'resource-recommender', executiveId, interests: profile.interests, gaps: profile.gaps || [], resources: [], categories: ['Books', 'Courses', 'Mentors', 'Communities', 'Events', 'Articles'], context: profile };
      break;
    default: throw new Error('Unknown focusArea: ' + focusArea);
  }
  store.push(result);
  fs.writeFileSync(storePath, JSON.stringify(store, null, 2));
  console.log(JSON.stringify({ success: true, focusArea, data: result, storePath }));
})();`;

const DEV_CAREER_INPUT = {
  type: 'object',
  properties: {
    focusArea: SchemaProps.select(['skill-gap', 'development-plan', 'improvement-plan', 'career-planner', 'career-roadmap', 'resource-recommender'], { description: 'Development and career area', required: true }),
    executiveId: SchemaProps.text({ description: 'Executive identifier' }),
    role: SchemaProps.text({ description: 'Current role' }),
    level: SchemaProps.text({ description: 'Seniority level' }),
    timeframe: SchemaProps.text({ description: 'Planning timeframe' }),
    currentSkills: SchemaProps.stringArray({ description: 'Current skills' }),
    targetSkills: SchemaProps.stringArray({ description: 'Target skills' }),
    interests: SchemaProps.stringArray({ description: 'Career interests' }),
    constraints: SchemaProps.stringArray({ description: 'Constraints' }),
    skills: SchemaProps.stringArray({ description: 'Skills to plan for' }),
    areas: SchemaProps.stringArray({ description: 'Areas to improve' }),
    targetRoles: SchemaProps.stringArray({ description: 'Target roles' }),
    targetRole: SchemaProps.text({ description: 'Target role' }),
    milestones: SchemaProps.stringArray({ description: 'Career milestones' }),
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

const DEV_CAREER = createCodeSkill({
  id: 'executive-dev-career',
  name: 'Development & Career Planning',
  description: 'Unified development and career planning: skill gaps, development plans, improvement plans, career planning, roadmaps, and resource recommendations. Use focusArea to select.',
  manifest: { language: 'javascript', entrypoint: 'index.js', sourceCode: DEV_CAREER_SOURCE },
  inputSchema: DEV_CAREER_INPUT,
  outputSchema: COMMON_OUTPUT,
  triggers: [{ kind: 'user', phrase_examples: ['Create a development plan', 'Analyze my skill gaps', 'Plan my career', 'Build a roadmap'] }, { kind: 'schedule', cadence: 'Quarterly career review' }],
});

export { DEV_CAREER };
