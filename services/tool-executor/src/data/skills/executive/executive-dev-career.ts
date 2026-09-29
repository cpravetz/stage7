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
const SAFETY_BOUNDARY = 'Executive advisory only: development and career plans are recommendations; do not commit organizational resources or make binding employment decisions without proper authorization.';

const DEV_CAREER_SOURCE = `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const NL = '\\n';
  const SAFETY = ${JSON.stringify(SAFETY_BOUNDARY)};

  function fail(status, message, title, extra) {
    const base = { success: false, status: status, error: message, data: null, present: [{ id: 'notice', title: title, kind: 'text', body: message + NL + NL + SAFETY }] };
    if (extra) { for (const key in extra) { base[key] = extra[key]; } }
    console.log(JSON.stringify(base));
  }

  const focusArea = input.focusArea || 'skill-gap';
  const executiveId = input.executiveId || '';
  const baseDir = process.env.EXECUTIVE_HOME || '/tmp/executive';
  const fs = require('fs');
  const path = require('path');
  const storePath = path.join(baseDir, 'dev-career.json');
  fs.mkdirSync(baseDir, { recursive: true });
  let store = fs.existsSync(storePath) ? JSON.parse(fs.readFileSync(storePath, 'utf8')) : [];
  const profile = { 
    role: input.role || '', 
    level: input.level || '', 
    currentSkills: Array.isArray(input.currentSkills) ? input.currentSkills : [], 
    targetSkills: Array.isArray(input.targetSkills) ? input.targetSkills : [], 
    interests: Array.isArray(input.interests) ? input.interests : [], 
    constraints: Array.isArray(input.constraints) ? input.constraints : [], 
    timeframe: input.timeframe || '' 
  };

  let result;
  let present;
  switch (focusArea) {
    case 'skill-gap': {
      const current = Array.isArray(profile.currentSkills) ? profile.currentSkills : [];
      const target = Array.isArray(profile.targetSkills) ? profile.targetSkills : [];
      const gaps = target.filter(function(s) { return current.indexOf(s) === -1; });

      if (!current.length && !target.length) {
        fail('not-connected', 'Not connected: no current skills or target skills provided for gap analysis', 'Input required');
        return;
      }

      const lines = [
        'Skill Gap Analysis',
        '==================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Current Role: ' + (profile.role || 'unspecified'),
        'Level: ' + (profile.level || 'unspecified'),
        'Timeframe: ' + (profile.timeframe || 'unspecified'),
        '',
        'Current Skills (' + current.length + '): ' + (current.length ? current.join(', ') : 'none'),
        '',
        'Target Skills (' + target.length + '): ' + (target.length ? target.join(', ') : 'none'),
        '',
        'Gaps Identified (' + gaps.length + '):',
      ];

      if (gaps.length > 0) {
        gaps.forEach(function(g, i) { lines.push('  ' + (i + 1) + '. ' + String(g)); });
      } else {
        lines.push('  None - all target skills are currently held');
      }
      lines.push('');

      if (current.length > 0) {
        lines.push('Strengths (skills already held):');
        current.filter(function(s) { return target.indexOf(s) !== -1; }).forEach(function(s, i) { lines.push('  ' + (i + 1) + '. ' + String(s)); });
      }

      result = { focusArea: 'skill-gap', executiveId, current, target, gaps, context: profile };
      present = [{ id: 'gap-analysis', title: 'Executive Skill Gap Analysis', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'development-plan': {
      const skills = Array.isArray(input.skills) ? input.skills : (Array.isArray(profile.targetSkills) ? profile.targetSkills : []);
      const timeframe = profile.timeframe || '6 months';

      if (!skills.length) {
        fail('not-connected', 'Not connected: no skills provided for development plan', 'Input required');
        return;
      }

      const lines = [
        'Development Plan',
        '================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Role: ' + (profile.role || 'unspecified'),
        'Timeframe: ' + timeframe,
        '',
        'Skills to develop (' + skills.length + '):',
      ];

      skills.forEach(function(s, i) {
        lines.push('  ' + (i + 1) + '. ' + String(s));
        lines.push('     Current Level: not assessed (supply current level for accuracy)');
        lines.push('     Target Level: proficient');
        lines.push('     Actions: [define specific learning actions for ' + String(s) + ']');
        lines.push('     Milestones: [define measurable milestones for ' + String(s) + ']');
        lines.push('');
      });

      lines.push('Note: Current levels, specific actions, and milestones must be supplied for a complete plan.');

      result = { focusArea: 'development-plan', executiveId, skills: skills.map(function(s) { return { skill: String(s), currentLevel: 'not assessed', targetLevel: 'proficient', actions: [], milestones: [] }; }), timeframe, context: profile };
      present = [{ id: 'dev-plan', title: 'Executive Development Plan', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'improvement-plan': {
      const areas = Array.isArray(input.areas) ? input.areas : (Array.isArray(profile.gaps) ? profile.gaps : []);
      const timeframe = profile.timeframe || '3 months';

      if (!areas.length) {
        fail('not-connected', 'Not connected: no improvement areas provided', 'Input required');
        return;
      }

      const lines = [
        'Improvement Plan',
        '================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Role: ' + (profile.role || 'unspecified'),
        'Timeframe: ' + timeframe,
        '',
        'Areas for improvement (' + areas.length + '):',
      ];

      areas.forEach(function(a, i) {
        lines.push('  ' + (i + 1) + '. ' + String(a));
        lines.push('     Current State: not assessed (supply current state for accuracy)');
        lines.push('     Target State: [define desired end state for ' + String(a) + ']');
        lines.push('     Actions: [define specific actions to improve ' + String(a) + ']');
        lines.push('     Metrics: [define how progress on ' + String(a) + ' will be measured]');
        lines.push('');
      });

      lines.push('Note: Current state, target state, actions, and metrics must be supplied for a complete plan.');

      result = { focusArea: 'improvement-plan', executiveId, areas: areas.map(function(a) { return { area: String(a), currentState: '', targetState: '', actions: [], metrics: [] }; }), context: profile };
      present = [{ id: 'improvement-plan', title: 'Executive Improvement Plan', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'career-planner': {
      const targetRoles = Array.isArray(input.targetRoles) ? input.targetRoles : [];
      const timeframe = profile.timeframe || '1-2 years';

      if (!targetRoles.length && !profile.role) {
        fail('not-connected', 'Not connected: no current role or target roles provided for career planning', 'Input required');
        return;
      }

      const lines = [
        'Career Plan',
        '===========',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Current Role: ' + (profile.role || 'unspecified'),
        'Level: ' + (profile.level || 'unspecified'),
        'Timeframe: ' + timeframe,
        'Interests: ' + (profile.interests.length ? profile.interests.join(', ') : 'none specified'),
        'Constraints: ' + (profile.constraints.length ? profile.constraints.join(', ') : 'none specified'),
        '',
        'Target Roles (' + targetRoles.length + '):',
      ];

      targetRoles.forEach(function(r, i) {
        lines.push('  ' + (i + 1) + '. ' + String(r));
        lines.push('     Feasibility: pending (requires gap analysis)');
        lines.push('     Gap Analysis: not yet performed');
        lines.push('     Steps: [define steps to transition to ' + String(r) + ']');
        lines.push('');
      });

      if (targetRoles.length === 0) {
        lines.push('  No target roles specified');
      }

      result = { focusArea: 'career-planner', executiveId, currentRole: profile.role, targetRoles: targetRoles.map(function(r) { return { role: String(r), feasibility: 'pending', gapAnalysis: null, steps: [] }; }), interests: profile.interests, constraints: profile.constraints, context: profile };
      present = [{ id: 'career-plan', title: 'Executive Career Plan', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'career-roadmap': {
      const targetRole = input.targetRole || '';
      const milestones = Array.isArray(input.milestones) ? input.milestones : [];
      const timeframe = profile.timeframe || '1-2 years';

      if (!targetRole && !milestones.length) {
        fail('not-connected', 'Not connected: no target role or milestones provided for career roadmap', 'Input required');
        return;
      }

      const lines = [
        'Career Roadmap',
        '==============',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Target Role: ' + (targetRole || 'unspecified'),
        'Timeframe: ' + timeframe,
        '',
        'Milestones (' + milestones.length + '):',
      ];

      if (milestones.length > 0) {
        milestones.forEach(function(m, i) {
          lines.push('  ' + (i + 1) + '. ' + String(m));
          lines.push('     Target Date: not specified (supply dates for timeline)');
          lines.push('     Status: pending');
          lines.push('     Dependencies: none specified');
          lines.push('     Completed: false');
          lines.push('');
        });
      } else {
        lines.push('  No milestones specified');
        lines.push('');
      }

      lines.push('Note: Target dates and dependencies must be supplied for an actionable roadmap.');

      result = { focusArea: 'career-roadmap', executiveId, targetRole, milestones: milestones.map(function(m) { return { name: String(m), targetDate: '', status: 'pending', dependencies: [], completed: false }; }), timeframe, context: profile };
      present = [{ id: 'career-roadmap', title: 'Executive Career Roadmap', kind: 'text', body: lines.join(NL) }];
      break;
    }

    case 'resource-recommender': {
      const interests = Array.isArray(profile.interests) ? profile.interests : [];
      const gaps = Array.isArray(profile.gaps) ? profile.gaps : [];

      if (!interests.length && !gaps.length) {
        fail('not-connected', 'Not connected: no interests or skill gaps provided for resource recommendations', 'Input required');
        return;
      }

      const lines = [
        'Resource Recommendations',
        '========================',
        '',
        'Executive: ' + (executiveId || 'unspecified'),
        'Interests: ' + (interests.length ? interests.join(', ') : 'none specified'),
        'Skill Gaps: ' + (gaps.length ? gaps.join(', ') : 'none identified'),
        '',
        'Categories searched: Books, Courses, Mentors, Communities, Events, Articles',
        '',
      ];

      if (gaps.length > 0) {
        lines.push('Recommended resources for skill gaps:');
        gaps.forEach(function(g, i) {
          lines.push('  ' + (i + 1) + '. ' + String(g));
          lines.push('     Books: [search for authoritative books on ' + String(g) + ']');
          lines.push('     Courses: [search for courses covering ' + String(g) + ']');
          lines.push('     Mentors: [find practitioners skilled in ' + String(g) + ']');
          lines.push('     Communities: [join communities focused on ' + String(g) + ']');
          lines.push('     Events: [attend conferences/workshops on ' + String(g) + ']');
          lines.push('     Articles: [read recent articles on ' + String(g) + ']');
          lines.push('');
        });
      }

      if (interests.length > 0) {
        lines.push('Recommended resources for interests:');
        interests.forEach(function(i, idx) {
          lines.push('  ' + (idx + 1) + '. ' + String(i));
          lines.push('     Books: [search for books on ' + String(i) + ']');
          lines.push('     Courses: [search for courses on ' + String(i) + ']');
          lines.push('     Communities: [join communities focused on ' + String(i) + ']');
          lines.push('     Events: [attend events about ' + String(i) + ']');
          lines.push('     Articles: [read recent articles on ' + String(i) + ']');
          lines.push('');
        });
      }

      lines.push('Note: This tool identifies resource categories. Specific recommendations require external search integration.');

      result = { focusArea: 'resource-recommender', executiveId, interests, gaps, resources: [], categories: ['Books', 'Courses', 'Mentors', 'Communities', 'Events', 'Articles'], context: profile };
      present = [{ id: 'resources', title: 'Executive Resource Recommendations', kind: 'text', body: lines.join(NL) }];
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

const DEV_CAREER_INPUT = createSchemaRecord({
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
}, { required: ['focusArea'] });

const DEV_CAREER_CONFIG = createSchemaRecord({
  executiveHome: SchemaProps.text({ description: 'Executive workspace path; defaults to EXECUTIVE_HOME' }),
});

export const DEV_CAREER = createCodeSkill({
  id: 'executive-dev-career',
  name: 'Development & Career Planning',
  description: 'Skill gap analysis, development plans, improvement plans, career planning, roadmaps, and resource recommendations. All outputs derived from supplied input. Use focusArea to select.',
  tier: 'advise',
  domainKnowledge: 'Career development, skill assessment, professional growth planning',
  manifest: { sourceCode: DEV_CAREER_SOURCE, configSchema: DEV_CAREER_CONFIG, persistenceEnv: 'EXECUTIVE_HOME', ui: { view: 'dev-career' } },
  inputSchema: DEV_CAREER_INPUT,
  outputSchema: executiveResultSchema('Development or career planning results derived from supplied profile and goals'),
  triggers: [{ kind: 'user', phrase_examples: ['Create a development plan', 'Analyze my skill gaps', 'Plan my career', 'Build a roadmap'] }],
  isSkill: true,
});

DEV_CAREER.configSchema = DEV_CAREER_CONFIG;
withUxMetadata(DEV_CAREER.inputSchema as SchemaRecord);
if (DEV_CAREER.configSchema) withUxMetadata(DEV_CAREER.configSchema);