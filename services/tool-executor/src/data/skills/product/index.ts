import { Tool } from '../../../types';
import { createCodeSkill, createExternalActionSkill } from '../code-skill-factory';

const PRODUCT_SKILLS: Tool[] = [
  createCodeSkill({
    id: 'create-roadmap',
    name: 'Create Roadmap',
    description: 'Generate a product roadmap with RICE-prioritized goals, topologically-sorted initiatives, capacity planning, milestones, risk assessment, theme allocation, and OKR alignment.',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `
const input = __tool_input || {};

function round2(n) { return Math.round(n * 100) / 100; }
function round4(n) { return Math.round(n * 10000) / 10000; }

const quarter = input.quarter || ('Q' + (new Date().getMonth() < 3 ? 1 : new Date().getMonth() < 6 ? 2 : new Date().getMonth() < 9 ? 3 : 4));
const goals = Array.isArray(input.goals) ? input.goals : [];
const initiatives = Array.isArray(input.initiatives) ? input.initiatives : [];
const themes = Array.isArray(input.themes) ? input.themes : [];
const timeHorizon = Math.max(1, Math.min(12, Number(input.timeHorizon) || 4));
const capacity = Math.max(1, Number(input.capacity) || 5);

const okrs = goals.map((g, i) => ({
  id: 'okr_' + (i + 1),
  goalId: 'goal_' + i,
  objective: g.text || 'Untitled Goal',
  keyResults: [
    { id: 'kr_' + (i + 1) + '_1', description: 'Deliver measurable outcome for ' + (g.text || 'Goal') + ' - completion rate', target: 100, current: 0 },
    { id: 'kr_' + (i + 1) + '_2', description: 'Stakeholder satisfaction score for ' + (g.text || 'Goal'), target: 4.0, current: 0 },
    { id: 'kr_' + (i + 1) + '_3', description: 'Revenue or adoption metric tied to ' + (g.text || 'Goal'), target: 1.0, current: 0 }
  ],
  alignment: 'aligned',
  createdAt: new Date().toISOString()
}));

const scoredGoals = goals.map((g, i) => {
  const reach = Math.max(1, Number(g.reach || (g.priority === 'high' ? 80 : g.priority === 'medium' ? 40 : 15)));
  const impact = Math.max(0.1, Number(g.impact || (g.priority === 'high' ? 3 : g.priority === 'medium' ? 2 : 0.5)));
  const confidence = Math.max(0.1, Math.min(1, Number(g.confidence || 0.8)));
  const effort = Math.max(0.1, Number(g.effort || 5));
  const rice = round4((reach * impact * confidence) / effort);
  const wsjf = round4(((reach * impact) + (confidence * 10)) / Math.max(0.1, effort));
  return {
    id: 'goal_' + i,
    text: g.text || 'Goal ' + (i + 1),
    priority: g.priority || 'medium',
    owner: g.owner || 'Unassigned',
    rice: rice,
    wsjf: wsjf,
    reach, impact, confidence, effort,
    score: Math.round((rice + wsjf) * 100) / 100,
    okrId: 'okr_' + (i + 1),
    measurableOutcome: 'Achieve ' + (g.text || 'Goal') + ' with quantifiable results within ' + timeHorizon + ' quarter(s)'
  };
});

scoredGoals.sort((a, b) => b.score - a.score);

const depGraph = {};
const indegree = {};
initiatives.forEach((init, i) => {
  const id = 'init_' + i;
  depGraph[id] = (init.dependencies || []).map(d => typeof d === 'string' ? d : (d.id || ('init_dep_' + i)));
  indegree[id] = indegree[id] || 0;
  (init.dependencies || []).forEach(d => {
    const depId = typeof d === 'string' ? d : (d.id || ('init_dep_' + i));
    if (!depGraph[depId]) { depGraph[depId] = []; indegree[depId] = 0; }
    indegree[id] = (indegree[id] || 0) + 1;
  });
});

const sortedInitiatives = [];
const queue = Object.keys(indegree).filter(k => indegree[k] === 0);
const indegreeCopy = Object.assign({}, indegree);
const queueSet = new Set(queue);
while (queue.length > 0) {
  const current = queue.shift();
  sortedInitiatives.push(current);
  (depGraph[current] || []).forEach(neighbor => {
    indegreeCopy[neighbor] = (indegreeCopy[neighbor] || 0) - 1;
    if (indegreeCopy[neighbor] === 0 && !queueSet.has(neighbor)) {
      queue.push(neighbor);
      queueSet.add(neighbor);
    }
  });
}
Object.keys(indegreeCopy).filter(k => indegreeCopy[k] > 0).forEach(k => {
  if (!sortedInitiatives.includes(k)) sortedInitiatives.push(k);
});

const initiativeData = initiatives.map((init, i) => {
  const effort = Math.max(0.5, Number(init.effort || 5));
  const riskScore = Number(init.risk || 0.3);
  const deps = Array.isArray(init.dependencies) ? init.dependencies : [];
  return {
    id: 'init_' + i,
    text: init.text || 'Initiative ' + (i + 1),
    goals: Array.isArray(init.goals) ? init.goals : [],
    effort: round2(effort),
    risk: riskScore,
    dependencies: deps.map(d => typeof d === 'string' ? d : (d.id || ('init_dep_' + i))),
    sortedIndex: sortedInitiatives.indexOf('init_' + i),
    milestones: [],
    quarter: 0,
    riskLevel: riskScore > 0.6 ? 'high' : riskScore > 0.3 ? 'medium' : 'low'
  };
});

const capacityPerQuarter = Math.max(1, capacity);
const quarterCapacity = [];
for (let q = 1; q <= timeHorizon; q++) {
  quarterCapacity.push({ quarter: q, capacity: capacityPerQuarter, used: 0, available: capacityPerQuarter });
}

const scheduledInitiatives = [];
for (const initId of sortedInitiatives) {
  const initIdx = parseInt(initId.replace('init_', ''), 10);
  if (isNaN(initIdx) || initIdx >= initiativeData.length) continue;
  const init = initiativeData[initIdx];
  const effortNeeded = init.effort;
  let assigned = false;
  for (let q = 0; q < quarterCapacity.length; q++) {
    if (quarterCapacity[q].available >= effortNeeded) {
      quarterCapacity[q].used = round2(quarterCapacity[q].used + effortNeeded);
      quarterCapacity[q].available = round2(quarterCapacity[q].capacity - quarterCapacity[q].used);
      init.quarter = q + 1;
      scheduledInitiatives.push(init);
      assigned = true;
      break;
    }
  }
  if (!assigned) {
    const lastQ = quarterCapacity.length;
    quarterCapacity[lastQ - 1].used = round2(quarterCapacity[lastQ - 1].used + effortNeeded * 0.3);
    init.quarter = lastQ;
    scheduledInitiatives.push(init);
  }
}

for (const init of initiativeData) {
  const milestoneCount = Math.max(1, Math.ceil(init.effort / 3));
  init.milestones = [];
  for (let m = 1; m <= milestoneCount; m++) {
    init.milestones.push({
      id: 'milestone_' + init.id + '_' + m,
      initiativeId: init.id,
      name: 'Milestone ' + m + ' of ' + init.text,
      deliverable: 'Key deliverable for phase ' + m + ' of ' + init.text,
      quarter: init.quarter,
      completionCriteria: 'Deliverable reviewed and accepted by stakeholders',
      status: 'planned',
      targetDate: new Date(new Date().setMonth(new Date().getMonth() + ((init.quarter - 1) * 3) + (m * 3))).toISOString()
    });
  }
}

const allDependencies = [];
for (const init of initiativeData) {
  for (const dep of init.dependencies) {
    allDependencies.push({ from: dep, to: init.id });
  }
}
const dependencyChainDepth = {};
function getDepth(nodeId, visited = new Set()) {
  if (visited.has(nodeId)) return 0;
  if (dependencyChainDepth[nodeId] !== undefined) return dependencyChainDepth[nodeId];
  visited.add(nodeId);
  const parents = allDependencies.filter(d => d.to === nodeId).map(d => d.from);
  if (parents.length === 0) { dependencyChainDepth[nodeId] = 0; return 0; }
  const maxDepth = Math.max(...parents.map(p => getDepth(p, new Set(visited)))) + 1;
  dependencyChainDepth[nodeId] = maxDepth;
  return maxDepth;
}
for (const init of initiativeData) { getDepth(init.id); }

const resourceConflicts = [];
for (let q = 0; q < quarterCapacity.length; q++) {
  if (quarterCapacity[q].used > quarterCapacity[q].capacity) {
    resourceConflicts.push({
      type: 'overcapacity',
      quarter: q + 1,
      severity: 'high',
      description: 'Quarter ' + (q + 1) + ' exceeds capacity by ' + round2(quarterCapacity[q].used - quarterCapacity[q].capacity) + ' effort units'
    });
  }
}
for (let i = 0; i < initiativeData.length; i++) {
  for (let j = i + 1; j < initiativeData.length; j++) {
    if (initiativeData[i].quarter === initiativeData[j].quarter) {
      const sharedDeps = initiativeData[i].dependencies.filter(d => initiativeData[j].dependencies.includes(d));
      if (sharedDeps.length > 0) {
        resourceConflicts.push({
          type: 'resource_conflict',
          quarter: initiativeData[i].quarter,
          severity: 'medium',
          initiatives: [initiativeData[i].id, initiativeData[j].id],
          description: initiativeData[i].text + ' and ' + initiativeData[j].text + ' share dependencies and run in same quarter'
        });
      }
    }
  }
}

const risks = [];
for (const init of initiativeData) {
  if (init.riskLevel === 'high') {
    risks.push({
      id: 'risk_' + init.id,
      initiativeId: init.id,
      title: 'High risk in ' + init.text,
      probability: init.risk,
      impact: 'High',
      mitigation: 'Break into smaller chunks, add buffer capacity, increase monitoring frequency',
      dependencyChainDepth: dependencyChainDepth[init.id] || 0
    });
  }
}
for (const dc of Object.values(dependencyChainDepth)) {
  if (dc >= 3) {
    risks.push({
      id: 'risk_dep_chain_' + dc,
      type: 'dependency_chain',
      title: 'Deep dependency chain (depth ' + dc + ')',
      probability: 0.5,
      impact: 'Medium',
      mitigation: 'Identify critical path and front-load upstream deliverables'
    });
    break;
  }
}
if (resourceConflicts.length > 0) {
  risks.push({
    id: 'risk_capacity',
    type: 'capacity',
    title: 'Resource capacity conflicts detected',
    probability: 0.7,
    impact: 'High',
    mitigation: 'Re-sequence initiatives or increase team capacity',
    conflicts: resourceConflicts
  });
}

const themeAllocation = themes.map((theme, i) => {
  const themeInits = scheduledInitiatives.filter(init => {
    const initData = initiativeData[parseInt(init.id.replace('init_', ''), 10)];
    return initData && Array.isArray(initData.goals) && initData.goals.length > 0;
  });
  return {
    id: 'theme_' + (i + 1),
    name: theme,
    initiativeCount: Math.max(1, Math.ceil(scheduledInitiatives.length / Math.max(1, themes.length))),
    priority: i === 0 ? 'primary' : 'supporting',
    balanceScore: round2(1 - Math.abs(i - (themes.length - 1) / 2) / Math.max(1, (themes.length - 1) / 2))
  };
});

if (themes.length === 0) {
  themeAllocation.push({
    id: 'theme_1',
    name: 'Strategic Focus',
    initiativeCount: scheduledInitiatives.length,
    priority: 'primary',
    balanceScore: 1.0
  });
}

const roadmap = {
  id: 'roadmap_' + Date.now(),
  quarter,
  timeHorizon,
  capacity: { teamSize: capacity, perQuarter: capacityPerQuarter },
  goals: scoredGoals,
  initiatives: initiativeData.sort((a, b) => (a.quarter || 0) - (b.quarter || 0) || (a.sortedIndex || 0) - (b.sortedIndex || 0)),
  themes: themeAllocation,
  milestones: initiativeData.flatMap(i => i.milestones),
  riskAssessment: {
    risks,
    dependencyChains: Object.keys(dependencyChainDepth).length,
    maxDependencyDepth: Math.max(0, ...Object.values(dependencyChainDepth)),
    resourceConflicts,
    criticalPath: scheduledInitiatives.filter(i => (dependencyChainDepth[i.id] || 0) >= 2).map(i => i.id)
  },
  okrs,
  metrics: {
    totalGoals: scoredGoals.length,
    totalInitiatives: initiativeData.length,
    totalMilestones: initiativeData.reduce((sum, i) => sum + i.milestones.length, 0),
    totalRisks: risks.length,
    averageRice: scoredGoals.length > 0 ? round2(scoredGoals.reduce((s, g) => s + g.rice, 0) / scoredGoals.length) : 0,
    capacityUtilization: quarterCapacity.map(qc => ({
      quarter: qc.quarter,
      utilization: qc.capacity > 0 ? round4(qc.used / qc.capacity) : 0
    }))
  },
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  source: 'algorithmic'
};

console.log(JSON.stringify({ success: true, data: roadmap }));
return roadmap;
`,
    },
    inputSchema: {
      type: 'object',
      properties: {
        quarter: { type: 'string', description: 'Roadmap quarter (e.g., Q1 2026)' },
        goals: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Goal description' },
              priority: { type: 'string', enum: ['high', 'medium', 'low'], description: 'Goal priority' },
              owner: { type: 'string', description: 'Goal owner' },
              reach: { type: 'number', description: 'RICE reach estimate (users affected)' },
              impact: { type: 'number', description: 'RICE impact (0.25-3 scale)' },
              confidence: { type: 'number', description: 'RICE confidence (0-1)' },
              effort: { type: 'number', description: 'RICE effort (person-weeks)' }
            }
          },
          description: 'Business/product goals to prioritize'
        },
        initiatives: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              text: { type: 'string', description: 'Initiative name' },
              goals: { type: 'array', items: { type: 'string' }, description: 'Goals this initiative supports' },
              effort: { type: 'number', description: 'Estimated effort in person-weeks' },
              dependencies: { type: 'array', items: { type: 'string' }, description: 'Initiative IDs this depends on' },
              risk: { type: 'number', description: 'Risk score (0-1)' }
            }
          },
          description: 'Initiatives to sequence and schedule'
        },
        themes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Strategic themes to allocate across'
        },
        timeHorizon: { type: 'number', description: 'Number of quarters to plan' },
        capacity: { type: 'number', description: 'Team size (capacity per quarter)' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the roadmap was generated' },
        roadmap: { type: 'object', description: 'Generated roadmap with RICE-scored goals, sequenced initiatives, capacity plan, milestones, risks, OKRs, and themes' },
        okrs: { type: 'array', description: 'OKR objects aligned to each goal' },
        metrics: { type: 'object', description: 'Summary metrics' }
      },
      required: ['success', 'roadmap'],
    },
  triggers: [
    { kind: 'user', phrase_examples: ["Create a roadmap", "Plan a release", "Check roadmap status"] },
    { kind: 'schedule', cadence: "Weekly roadmap review" },
    { kind: 'schedule', cadence: "Monthly portfolio review" },
    { kind: 'event', on: "Milestone completed" },
    { kind: 'event', on: "Roadmap updated" },
    { kind: 'event', on: "New requirement added" },
    { kind: 'data', condition: "Roadmap coverage gap detected" },
    { kind: 'data', condition: "Dependency overdue" },
  ],
  }),
  createCodeSkill({
    id: 'write-prd',
    name: 'Write PRD',
    description: 'Generate a structured product requirements document with INVEST user stories, Given/When/Then acceptance criteria, technical requirements, data model, UX flows, and phased rollout plan.',
    manifest: {
      language: 'javascript',
      entrypoint: 'index.js',
      sourceCode: `
const input = __tool_input || {};

const title = input.title || 'Untitled PRD';
const problem = input.problem || '';
const scope = input.scope || '';
const goals = Array.isArray(input.goals) ? input.goals : [];
const successMetrics = Array.isArray(input.successMetrics) ? input.successMetrics : [];
const nonGoals = Array.isArray(input.nonGoals) ? input.nonGoals : [];
const openQuestions = Array.isArray(input.openQuestions) ? input.openQuestions : [];
const targetUsers = Array.isArray(input.targetUsers) ? input.targetUsers : [];
const userStories = Array.isArray(input.userStories) ? input.userStories : [];
const constraints = Array.isArray(input.constraints) ? input.constraints : [];
const assumptions = Array.isArray(input.assumptions) ? input.assumptions : [];
const risks = Array.isArray(input.risks) ? input.risks : [];

const storyCount = Math.max(3, Math.min(15, userStories.length >= 3 ? userStories.length : Math.ceil(problem.length / 40) + 2));
const generatedStories = [];
const storyTemplates = [
  'As a [user type], I want [action] so that [benefit]',
  'As a [stakeholder], I need [capability] so that [outcome]',
  'As a [role], I wish to [task] so that [value]'
];
const userTypes = targetUsers.length > 0 ? targetUsers : ['end user', 'administrator', 'viewer'];

const problemKeywords = problem.split(/[\\s,.!?]+/).filter(w => w.length > 3);
const verbPatterns = {
  discover: 'find and explore relevant information',
  manage: 'create, update, and organize items',
  track: 'monitor progress and receive updates',
  analyze: 'view insights and generate reports',
  collaborate: 'work together with team members',
  automate: 'reduce manual effort through automation',
  configure: 'customize settings and preferences',
  integrate: 'connect with existing tools and services'
};

for (let i = 0; i < storyCount; i++) {
  const userType = userTypes[i % userTypes.length];
  let storyText;
  if (userStories[i]) {
    storyText = userStories[i];
  } else {
    const pattern = storyTemplates[i % storyTemplates.length];
    const keywords = problemKeywords.slice(i, i + 3);
    const action = keywords.length > 0 ? keywords.join(' and ') : ' accomplish tasks efficiently';
    const benefit = problem.length > 50 ? 'solve the core problem effectively' : 'improve the overall experience';
    storyText = pattern.replace('[user type]', userType).replace('[action]', action).replace('[benefit]', benefit).replace('[stakeholder]', userType).replace('[capability]', action).replace('[outcome]', benefit).replace('[role]', userType).replace('[task]', action).replace('[value]', benefit);
  }

  const words = storyText.split(/\\s+/);
  const isSmall = words.length <= 25;
  const isTestable = /(can|should|must|will|able to)/i.test(storyText);
  const isValuable = /(so that|benefit|improve|enable|reduce|increase)/i.test(storyText);
  const investScore = ((isSmall ? 1 : 0) + (isTestable ? 1 : 0) + (isValuable ? 1 : 0)) / 3;

  const givenParts = ['Given the user is on the main interface', 'Given the system is initialized', 'Given valid input data is provided'];
  const whenParts = ['When the user performs the primary action', 'When the user triggers the feature', 'When the system processes the request'];
  const thenParts = ['Then the expected result is displayed', 'Then the data is persisted correctly', 'Then appropriate feedback is shown to the user'];

  const acceptanceCriteria = [];
  for (let j = 0; j < 3; j++) {
    acceptanceCriteria.push({
      id: 'ac_' + i + '_' + j,
      storyIndex: i,
      format: 'Given/When/Then',
      given: givenParts[j],
      when: whenParts[j],
      then: thenParts[j],
      passed: false,
      priority: j === 0 ? 'must' : 'should'
    });
  }

  generatedStories.push({
    id: 'story_' + (i + 1),
    text: storyText,
    userType: userTypes[i % userTypes.length],
    invest: {
      independent: true,
      negotiable: true,
      valuable: isValuable,
      estimable: true,
      small: isSmall,
      testable: isTestable,
      score: round2(investScore * 100) + '%'
    },
    acceptanceCriteria,
    definitionOfDone: 'Code reviewed, all acceptance criteria pass, unit tests written and passing, documentation updated'
  });
}

const functionalRequirements = [
  { id: 'fr_1', category: 'authentication', description: 'System must authenticate users via secure authentication mechanism', priority: 'must', type: 'functional' },
  { id: 'fr_2', category: 'authorization', description: 'System must enforce role-based access control per user permissions', priority: 'must', type: 'functional' },
  { id: 'fr_3', category: 'data_persistence', description: 'All user actions and data changes must be persisted with timestamps', priority: 'must', type: 'functional' },
  { id: 'fr_4', category: 'search', description: 'System must provide search with filtering and sorting capabilities', priority: 'should', type: 'functional' },
  { id: 'fr_5', category: 'notifications', description: 'System must notify users of relevant state changes and updates', priority: 'should', type: 'functional' },
  { id: 'fr_6', category: 'audit', description: 'All critical operations must be logged for audit trail purposes', priority: 'must', type: 'functional' },
];

const nonFunctionalRequirements = [
  { id: 'nfr_1', category: 'performance', description: 'Page load time must be under 2 seconds for 95th percentile of users', priority: 'must', type: 'non-functional' },
  { id: 'nfr_2', category: 'availability', description: 'System uptime must be 99.9% during business hours', priority: 'must', type: 'non-functional' },
  { id: 'nfr_3', category: 'scalability', description: 'System must support 10x current user load with horizontal scaling', priority: 'should', type: 'non-functional' },
  { id: 'nfr_4', category: 'security', description: 'All data transmission must use TLS 1.2+ encryption', priority: 'must', type: 'non-functional' },
  { id: 'nfr_5', category: 'accessibility', description: 'UI must meet WCAG 2.1 AA compliance standards', priority: 'must', type: 'non-functional' },
  { id: 'nfr_6', category: 'compatibility', description: 'Must support latest 2 versions of Chrome, Firefox, Safari, Edge', priority: 'should', type: 'non-functional' },
];

const entityDefinitions = [
  { id: 'entity_user', name: 'User', attributes: [{ name: 'id', type: 'UUID', required: true, unique: true }, { name: 'email', type: 'string', required: true, unique: true }, { name: 'name', type: 'string', required: true }, { name: 'role', type: 'enum', required: true }, { name: 'createdAt', type: 'timestamp', required: true } ], privacy: 'PII', retention: 'active_period' },
  { id: 'entity_entity', name: 'Primary Entity', attributes: [{ name: 'id', type: 'UUID', required: true, unique: true }, { name: 'ownerId', type: 'UUID', required: true, foreignKey: 'user.id' }, { name: 'name', type: 'string', required: true }, { name: 'status', type: 'enum', required: true }, { name: 'metadata', type: 'json', required: false } ], privacy: 'business', retention: 'active_period' },
  { id: 'entity_action', name: 'Action Log', attributes: [{ name: 'id', type: 'UUID', required: true, unique: true }, { name: 'entityId', type: 'UUID', required: true, foreignKey: 'entity.id' }, { name: 'userId', type: 'UUID', required: true, foreignKey: 'user.id' }, { name: 'action', type: 'string', required: true }, { name: 'timestamp', type: 'timestamp', required: true } ], privacy: 'audit', retention: '7_years' },
];
const relationships = [
  { id: 'rel_1', from: 'entity_user', to: 'entity_entity', type: 'one-to-many', description: 'User owns many entities' },
  { id: 'rel_2', from: 'entity_entity', to: 'entity_action', type: 'one-to-many', description: 'Entity has many action logs' },
  { id: 'rel_3', from: 'entity_user', to: 'entity_action', type: 'one-to-many', description: 'User performs many actions' },
];
const dataRequirements = { entities: entityDefinitions, relationships, privacy: { piiFields: ['user.email', 'user.name'], encryption: 'at_rest_and_transit', retentionPolicy: 'per_entity_retention', anonymization: 'automatic_after_retention' } };

const userFlows = [
  { id: 'flow_1', name: 'Primary User Flow', entryPoint: 'Application entry point', steps: ['Authenticate', 'Access main interface', 'Perform primary action', 'Review results', 'Save or discard'], exitPoint: 'Logged out or session expired', errorHandling: 'Display error message with recovery option', states: ['idle', 'loading', 'success', 'error', 'authenticated'] },
  { id: 'flow_2', name: 'Secondary Flow', entryPoint: 'Navigation menu', steps: ['Select section', 'Review data', 'Apply filters', 'Export or share'], exitPoint: 'Return to main interface', errorHandling: 'Show validation errors inline', states: ['idle', 'loading', 'editing', 'viewing'] },
];

const uiRequirements = [
  { id: 'ui_1', component: 'Main Dashboard', description: 'Display key metrics and quick actions', accessibility: 'WCAG 2.1 AA', states: ['loading', 'empty', 'populated', 'error'], responsive: true },
  { id: 'ui_2', component: 'Data Table', description: 'Display sortable and filterable data with pagination', accessibility: 'WCAG 2.1 AA', states: ['loading', 'empty', 'populated', 'editing'], responsive: true },
  { id: 'ui_3', component: 'Settings Panel', description: 'Allow user to configure preferences', accessibility: 'WCAG 2.1 AA', states: ['viewing', 'editing', 'saving', 'saved'], responsive: false },
];

const rolloutPhases = [
  { id: 'phase_1', name: 'Alpha', targetUsers: 'Internal team', featureFlags: ['prd_core_v1'], criteria: 'All acceptance criteria pass, internal beta tested', duration: '2 weeks', rollback: 'Disable prd_core_v1 flag' },
  { id: 'phase_2', name: 'Beta', targetUsers: 'Limited external users (5-10%)', featureFlags: ['prd_core_v1', 'prd_analytics_v1'], criteria: '95% acceptance criteria pass, no P0 bugs', duration: '4 weeks', rollback: 'Disable prd_analytics_v1 flag, notify beta users' },
  { id: 'phase_3', name: 'General Availability', targetUsers: 'All users', featureFlags: ['prd_core_v1', 'prd_analytics_v1', 'prd_notifications_v1'], criteria: 'All acceptance criteria pass, monitoring dashboards active', duration: 'Ongoing', rollback: 'Disable all feature flags, deploy previous version' },
];

const internalDependencies = [
  { id: 'int_dep_1', type: 'service', description: 'Authentication service must be available', status: 'required' },
  { id: 'int_dep_2', type: 'data', description: 'User data schema must be migrated', status: 'required' },
  { id: 'int_dep_3', type: 'api', description: 'Core API endpoints must be deployed', status: 'required' },
];
const externalDependencies = [
  { id: 'ext_dep_1', type: 'third_party', description: 'Identity provider integration', status: 'pending', impact: 'blocks' },
  { id: 'ext_dep_2', type: 'infrastructure', description: 'Cloud infrastructure provisioning', status: 'pending', impact: 'blocks' },
];

const prd = {
  id: 'prd_' + Date.now(),
  title,
  structure: {
    problem: problem,
    scope: scope,
    solution: { summary: 'Solution derived from problem statement and user stories', approaches: generatedStories.map(s => s.text) },
    requirements: { functional: functionalRequirements, nonFunctional: nonFunctionalRequirements },
    metrics: successMetrics.map((m, i) => ({ id: 'metric_' + (i + 1), text: m, target: 'Defined during sprint planning', baseline: 'Current state measurement' })),
    risks: risks.map((r, i) => ({ id: 'risk_' + (i + 1), text: r, mitigation: 'TBD - risk assessment during planning', severity: 'medium' }))
  },
  userStories: generatedStories,
  acceptanceCriteria: generatedStories.flatMap(s => s.acceptanceCriteria),
  technicalRequirements: { functional: functionalRequirements, nonFunctional: nonFunctionalRequirements },
  dataRequirements: dataRequirements,
  uxRequirements: { flows: userFlows, uiComponents: uiRequirements, accessibility: 'WCAG 2.1 AA', states: userFlows.flatMap(f => f.states) },
  releaseCriteria: { definitionOfDone: 'All acceptance criteria pass, code reviewed, tested, documented, and deployed to production with monitoring', featureFlags: rolloutPhases[rolloutPhases.length - 1].featureFlags },
  dependencies: { internal: internalDependencies, external: externalDependencies },
  rolloutPlan: {
    phases: rolloutPhases,
    strategy: 'Phased rollout with feature flags for gradual exposure and easy rollback',
    rollbackPlan: 'Disable relevant feature flags and redeploy previous version',
    criteriaPerPhase: rolloutPhases.map(p => ({ phase: p.name, criteria: p.criteria }))
  },
  assumptions: assumptions.map((a, i) => ({ id: 'assumption_' + (i + 1), text: a, validated: false })),
  nonGoals: nonGoals.map((n, i) => ({ id: 'nongoal_' + (i + 1), text: n })),
  openQuestions: openQuestions.map((q, i) => ({ id: 'question_' + (i + 1), text: q, status: 'open', resolution: null })),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  source: 'algorithmic'
};

console.log(JSON.stringify({ success: true, data: prd }));
return prd;
`,
    },
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Title of the PRD' },
        problem: { type: 'string', description: 'Problem statement describing the user or business need' },
        scope: { type: 'string', description: 'Scope and boundaries of the product or feature' },
        goals: { type: 'array', items: { type: 'string' }, description: 'Goals the product should achieve' },
        successMetrics: { type: 'array', items: { type: 'string' }, description: 'Measurable indicators of success' },
        nonGoals: { type: 'array', items: { type: 'string' }, description: 'Items explicitly excluded' },
        openQuestions: { type: 'array', items: { type: 'string' }, description: 'Unresolved questions needing follow-up' },
        targetUsers: { type: 'array', items: { type: 'string' }, description: 'Target user personas' },
        userStories: { type: 'array', items: { type: 'string' }, description: 'Existing user stories' },
        constraints: { type: 'array', items: { type: 'string' }, description: 'Technical or business constraints' },
        assumptions: { type: 'array', items: { type: 'string' }, description: 'Assumptions made' },
        risks: { type: 'array', items: { type: 'string' }, description: 'Identified risks' }
      }
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', description: 'Whether the PRD was generated' },
        prd: { type: 'object', description: 'The structured PRD with all sections, stories, criteria, requirements, data model, UX, and rollout plan' },
        userStories: { type: 'array', description: 'Generated INVEST user stories with acceptance criteria' },
        acceptanceCriteria: { type: 'array', description: 'Given/When/Then acceptance criteria' },
        rolloutPlan: { type: 'object', description: 'Phased rollout with feature flags and rollback' }
      },
      required: ['success', 'prd'],
    },
  triggers: [
    { kind: 'user', phrase_examples: ["Write a PRD", "Update requirements", "Review requirements"] },
    { kind: 'schedule', cadence: "Sprint planning cycle" },
    { kind: 'schedule', cadence: "Monthly PRD quality review" },
    { kind: 'event', on: "Requirements changed" },
    { kind: 'event', on: "Stakeholder feedback received" },
    { kind: 'event', on: "PRD approved" },
    { kind: 'data', condition: "Requirement coverage below threshold" },
    { kind: 'data', condition: "Scope creep detected" },
  ],
  }),
  createExternalActionSkill({
    id: 'product-jira',
    name: 'Jira Integration',
    description: 'Create, update, and query Jira issues and sprints. Uses configurable Jira instance with endpoint and auth.',
    system: 'jira',
    action: 'manage_issue',
    endpoint: {
      method: 'POST',
      envVar: 'JIRA_BASE_URL',
    },
    auth: {
      type: 'basic',
      credentialEnvKeyMap: {
        username: { envVar: 'JIRA_EMAIL' },
        password: { envVar: 'JIRA_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Jira base URL' },
        email: { type: 'string', description: 'Jira user email' },
        apiToken: { type: 'string', description: 'Jira API token' },
        projectKey: { type: 'string', description: 'Default project key' },
        issueType: { type: 'string', description: 'Default issue type' },
        workflowSchemes: { type: 'object', description: 'Jira workflow scheme mappings' },
        customFields: { type: 'object', description: 'Custom field configurations' },
        automationRules: { type: 'array', items: { type: 'object' }, description: 'Automation rule definitions' },
        permissionSchemes: { type: 'object', description: 'Permission scheme assignments' },
      },
      required: ['baseUrl', 'email', 'apiToken'],
    },
    credentialSource: {
      username: { envVar: 'JIRA_EMAIL' },
      password: { envVar: 'JIRA_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'update', 'get'], description: 'Jira operation to perform' },
        projectKey: { type: 'string', description: 'Jira project key' },
        issueType: { type: 'string', description: 'Jira issue type (for example, Bug, Task, or Story)' },
        summary: { type: 'string', description: 'Issue summary or title' },
        description: { type: 'string', description: 'Issue description' },
        issueId: { type: 'string', description: 'Jira issue ID or key to update or retrieve' },
        fields: { type: 'object', description: 'Additional Jira issue fields as key-value pairs' },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
          properties: {
            input: { type: 'object' },
            endpoint: { type: 'string' },
            method: { type: 'string' },
            headers: { type: 'object' },
          },
        },
        response: {
          type: ['object', 'null'],
          properties: {
            status: { type: 'number' },
            data: { type: ['object', 'string', 'null'] },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 30000,
  triggers: [
    { kind: 'user', phrase_examples: ["Create Jira ticket", "Update ticket", "Search tickets"] },
    { kind: 'schedule', cadence: "Daily sync with Jira" },
    { kind: 'schedule', cadence: "Weekly ticket health review" },
    { kind: 'event', on: "Ticket created" },
    { kind: 'event', on: "Ticket transitioned" },
    { kind: 'event', on: "Comment added" },
    { kind: 'data', condition: "Ticket backlog grows" },
    { kind: 'data', condition: "Velocity drops" },
  ],
  }),
  createExternalActionSkill({
    id: 'product-confluence',
    name: 'Confluence Integration',
    description: 'Create and update Confluence pages and spaces. Uses configurable Confluence instance with endpoint and auth.',
    system: 'confluence',
    action: 'manage_page',
    endpoint: {
      method: 'POST',
      envVar: 'CONFLUENCE_BASE_URL',
    },
    auth: {
      type: 'basic',
      credentialEnvKeyMap: {
        username: { envVar: 'CONFLUENCE_EMAIL' },
        password: { envVar: 'CONFLUENCE_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Confluence base URL' },
        email: { type: 'string', description: 'Confluence user email' },
        apiToken: { type: 'string', description: 'Confluence API token' },
        spaceKey: { type: 'string', description: 'Default space key' },
        ancestorId: { type: 'string', description: 'Parent page ID' },
        pageTemplates: { type: 'object', description: 'Confluence page templates' },
        blueprints: { type: 'object', description: 'Confluence blueprint configurations' },
        macroConfigs: { type: 'object', description: 'Macro configuration settings' },
        spacePermissions: { type: 'object', description: 'Space permission rules' },
      },
      required: ['baseUrl', 'email', 'apiToken'],
    },
    credentialSource: {
      username: { envVar: 'CONFLUENCE_EMAIL' },
      password: { envVar: 'CONFLUENCE_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'update', 'get'], description: 'Confluence operation to perform' },
        spaceKey: { type: 'string', description: 'Confluence space key' },
        title: { type: 'string', description: 'Page title' },
        body: { type: 'string', description: 'Page body content in the specified representation format' },
        pageId: { type: 'string', description: 'Confluence page ID to update or retrieve' },
        ancestorId: { type: 'string', description: 'Parent page ID for page hierarchy' },
        representation: { type: 'string', enum: ['storage', 'wiki', 'markdown'], description: 'Storage format representation (storage, wiki, or markdown)' },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
          properties: {
            input: { type: 'object' },
            endpoint: { type: 'string' },
            method: { type: 'string' },
            headers: { type: 'object' },
          },
        },
        response: {
          type: ['object', 'null'],
          properties: {
            status: { type: 'number' },
            data: { type: ['object', 'string', 'null'] },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 30000,
  triggers: [
    { kind: 'user', phrase_examples: ["Create Confluence page", "Search docs", "Update documentation"] },
    { kind: 'schedule', cadence: "Weekly doc review" },
    { kind: 'schedule', cadence: "Monthly knowledge audit" },
    { kind: 'event', on: "Page created" },
    { kind: 'event', on: "Page updated" },
    { kind: 'event', on: "Page commented" },
    { kind: 'data', condition: "Stale pages detected" },
    { kind: 'data', condition: "Doc coverage gap" },
  ],
  }),
  createExternalActionSkill({
    id: 'product-data-analysis',
    name: 'Product Data Analysis',
    description: 'Analyze product metrics, adoption, retention, and funnels. Uses configurable analytics or BI endpoints.',
    system: 'product_analytics',
    action: 'analyze_metrics',
    endpoint: {
      method: 'POST',
      envVar: 'PRODUCT_ANALYTICS_API_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'PRODUCT_ANALYTICS_API_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        baseUrl: { type: 'string', description: 'Analytics service base URL' },
        apiToken: { type: 'string', description: 'Bearer token for analytics API' },
        dataset: { type: 'string', description: 'Default dataset or table' },
        cohortDefinitions: { type: 'object', description: 'Cohort analysis definitions' },
        retentionModels: { type: 'object', description: 'Retention model configurations' },
        funnelTemplates: { type: 'array', items: { type: 'object' }, description: 'Funnel analysis templates' },
        alertConfigs: { type: 'object', description: 'Alert configuration settings' },
      },
      required: ['baseUrl', 'apiToken'],
    },
    credentialSource: {
      token: { envVar: 'PRODUCT_ANALYTICS_API_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Metric to analyze' },
        dimensions: { type: 'array', items: { type: 'string' }, description: 'Dimensions to group the metric by' },
        filters: { type: 'object', description: 'Filter conditions as key-value pairs' },
        startDate: { type: 'string', description: 'Start date for the analysis period (ISO 8601)' },
        endDate: { type: 'string', description: 'End date for the analysis period (ISO 8601)' },
        granularity: { type: 'string', enum: ['day', 'week', 'month', 'quarter'], description: 'Time granularity for the analysis' },
      },
      required: ['metric'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
          properties: {
            input: { type: 'object' },
            endpoint: { type: 'string' },
            method: { type: 'string' },
            headers: { type: 'object' },
          },
        },
        response: {
          type: ['object', 'null'],
          properties: {
            status: { type: 'number' },
            data: { type: ['object', 'string', 'null'] },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 60000,
  triggers: [
    { kind: 'user', phrase_examples: ["Analyze product data", "Run report", "Check metrics"] },
    { kind: 'schedule', cadence: "Daily metrics digest" },
    { kind: 'schedule', cadence: "Weekly product analytics" },
    { kind: 'schedule', cadence: "Monthly deep dive" },
    { kind: 'event', on: "Data source connected" },
    { kind: 'event', on: "Report generated" },
    { kind: 'event', on: "Data quality issue" },
    { kind: 'data', condition: "Metric anomaly detected" },
    { kind: 'data', condition: "Data freshness below threshold" },
  ],
  }),
  createExternalActionSkill({
    id: 'product-slack',
    name: 'Slack Integration',
    description: 'Send messages, create channels, and interact with Slack. Uses configurable Slack workspace with endpoint and auth.',
    system: 'slack',
    action: 'send_message',
    endpoint: {
      method: 'POST',
      envVar: 'SLACK_BASE_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        token: { envVar: 'SLACK_BOT_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        botToken: { type: 'string', description: 'Slack bot token (xoxb-...)' },
        channel: { type: 'string', description: 'Default channel ID or name' },
        botScopes: { type: 'array', items: { type: 'string' }, description: 'Bot scope permissions' },
        channelTemplates: { type: 'object', description: 'Channel template configurations' },
        notificationRules: { type: 'array', items: { type: 'object' }, description: 'Notification rule definitions' },
        commandRegistry: { type: 'object', description: 'Slash command registry' },
      },
      required: ['botToken'],
    },
    credentialSource: {
      token: { envVar: 'SLACK_BOT_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['postMessage', 'updateMessage', 'deleteMessage', 'listChannels', 'createChannel'], description: 'Slack operation to perform' },
        channel: { type: 'string', description: 'Channel ID or name to post to or interact with' },
        text: { type: 'string', description: 'Message text content' },
        ts: { type: 'string', description: 'Message timestamp (for updateMessage or deleteMessage)' },
        channelName: { type: 'string', description: 'Name for new channel (for createChannel)' },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
          properties: {
            input: { type: 'object' },
            endpoint: { type: 'string' },
            method: { type: 'string' },
            headers: { type: 'object' },
          },
        },
        response: {
          type: ['object', 'null'],
          properties: {
            status: { type: 'number' },
            data: { type: ['object', 'string', 'null'] },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 15000,
  triggers: [
    { kind: 'user', phrase_examples: ["Post to Slack", "Send message", "Check notifications"] },
    { kind: 'schedule', cadence: "Daily message review" },
    { kind: 'schedule', cadence: "Weekly channel summary" },
    { kind: 'event', on: "Message posted" },
    { kind: 'event', on: "Reaction added" },
    { kind: 'event', on: "Thread updated" },
    { kind: 'data', condition: "Response time exceeds SLA" },
    { kind: 'data', condition: "Unread messages spike" },
  ],
  }),
  createExternalActionSkill({
    id: 'product-calendar',
    name: 'Calendar Integration',
    description: 'Schedule product reviews, sync events, and manage calendars. Uses configurable calendar API with endpoint and auth.',
    system: 'calendar',
    action: 'schedule_event',
    endpoint: {
      method: 'POST',
      envVar: 'CALENDAR_API_URL',
    },
    auth: {
      type: 'bearer',
      credentialEnvKeyMap: {
        accessToken: { envVar: 'CALENDAR_ACCESS_TOKEN' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string', description: 'OAuth access token' },
        refreshToken: { type: 'string', description: 'OAuth refresh token' },
        calendarId: { type: 'string', description: 'Default calendar ID' },
        recurrenceRules: { type: 'object', description: 'Recurrence rule definitions' },
        reminderConfigs: { type: 'object', description: 'Reminder configuration settings' },
        timezoneHandling: { type: 'string', description: 'Timezone handling mode' },
        syncProviders: { type: 'array', items: { type: 'string' }, description: 'Enabled sync providers' },
      },
      required: ['accessToken'],
    },
    credentialSource: {
      accessToken: { envVar: 'CALENDAR_ACCESS_TOKEN' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['create', 'update', 'delete', 'list'], description: 'Calendar operation to perform' },
        summary: { type: 'string', description: 'Event summary or title' },
        description: { type: 'string', description: 'Event description' },
        startTime: { type: 'string', description: 'Event start time (ISO 8601)' },
        endTime: { type: 'string', description: 'Event end time (ISO 8601)' },
        attendees: { type: 'array', items: { type: 'string' }, description: 'List of attendee email addresses' },
        calendarId: { type: 'string', description: 'Calendar ID to schedule against' },
        event: { type: 'string', description: 'Event ID to update or delete' },
      },
      required: ['operation'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
          properties: {
            input: { type: 'object' },
            endpoint: { type: 'string' },
            method: { type: 'string' },
            headers: { type: 'object' },
          },
        },
        response: {
          type: ['object', 'null'],
          properties: {
            status: { type: 'number' },
            data: { type: ['object', 'string', 'null'] },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 30000,
  triggers: [
    { kind: 'user', phrase_examples: ["Check calendar", "Schedule review", "Find meeting times"] },
    { kind: 'schedule', cadence: "Daily calendar sync" },
    { kind: 'schedule', cadence: "Weekly planning review" },
    { kind: 'event', on: "Event created" },
    { kind: 'event', on: "Event cancelled" },
    { kind: 'event', on: "Conflict detected" },
    { kind: 'data', condition: "Calendar sync fails" },
    { kind: 'data', condition: "Scheduling backlog grows" },
  ],
  }),
  createExternalActionSkill({
    id: 'product-markdown-parsing',
    name: 'Markdown Parsing',
    description: 'Parse product docs and PRDs from markdown into structured data. Uses configurable parsing endpoint or local helper logic.',
    system: 'markdown_parser',
    action: 'parse_document',
    endpoint: {
      method: 'POST',
      envVar: 'MARKDOWN_PARSER_API_URL',
    },
    auth: {
      type: 'api_key',
      credentialEnvKeyMap: {
        apiKey: { envVar: 'MARKDOWN_PARSER_API_KEY' },
      },
    },
    configSchema: {
      type: 'object',
      properties: {
        apiUrl: { type: 'string', description: 'Parser service base URL' },
        apiKey: { type: 'string', description: 'API key for parser service' },
        format: { type: 'string', description: 'Output format: json, yaml, html' },
        parserPlugins: { type: 'array', items: { type: 'string' }, description: 'Parser plugin names' },
        outputSchemas: { type: 'object', description: 'Output schema definitions' },
        sectionRules: { type: 'object', description: 'Section extraction rules' },
        linkResolvers: { type: 'object', description: 'Link resolution configurations' },
      },
      required: ['apiUrl'],
    },
    credentialSource: {
      apiKey: { envVar: 'MARKDOWN_PARSER_API_KEY' },
    },
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Markdown content to parse' },
        sourceUrl: { type: 'string', description: 'Optional source URL' },
        extractSections: { type: 'array', items: { type: 'string' }, description: 'Section names to extract from the document' },
        format: { type: 'string', enum: ['json', 'yaml', 'html'], description: 'Output format for the parsed document' },
      },
      required: ['content'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        mode: { type: 'string' },
        system: { type: 'string' },
        action: { type: 'string' },
        request: {
          type: 'object',
          properties: {
            input: { type: 'object' },
            endpoint: { type: 'string' },
            method: { type: 'string' },
            headers: { type: 'object' },
          },
        },
        response: {
          type: ['object', 'null'],
          properties: {
            status: { type: 'number' },
            data: { type: ['object', 'string', 'null'] },
          },
        },
        error: { type: 'string' },
      },
      required: ['success', 'mode', 'system', 'action', 'request', 'response', 'error'],
    },
    timeoutMs: 20000,
  triggers: [
    { kind: 'user', phrase_examples: ["Parse markdown", "Convert document", "Extract content"] },
    { kind: 'schedule', cadence: "Weekly parsing quality review" },
    { kind: 'event', on: "Document uploaded" },
    { kind: 'event', on: "Parse error" },
    { kind: 'event', on: "Format changed" },
    { kind: 'data', condition: "Parse failure rate high" },
    { kind: 'data', condition: "Unsupported format detected" },
  ],
  }),
];


// Product Operations orchestrator — higher-order skill that dispatches to the 5 external system integrations
const PRODUCT_OPERATIONS = createCodeSkill({
  id: 'product-operations',
  name: 'Product Operations',
  description: 'Unified interface for backlog management, documentation, team communication, scheduling, and document parsing. Dispatches to Jira, Confluence, Slack, calendar, or Markdown based on the selected operation.',
  manifest: {
    language: 'javascript',
    entrypoint: 'index.js',
    sourceCode: `(async () => {
  const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const operation = input.operation || '';
  const data = input.data || {};
  const toolMap = {
    jira: 'product-jira',
    confluence: 'product-confluence',
    slack: 'product-slack',
    calendar: 'product-calendar',
    'markdown-parsing': 'product-markdown-parsing',
  };
  const toolId = toolMap[operation];
  if (!toolId) {
    console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Unknown operation: ' + operation }));
    return;
  }
  const result = await __execute_tool(toolId, data);
  console.log(JSON.stringify(result));
})()`,
    lowerOrderTools: ['product-jira', 'product-confluence', 'product-slack', 'product-calendar', 'product-markdown-parsing'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['jira', 'confluence', 'slack', 'calendar', 'markdown-parsing'], description: 'Which external system to operate on' },
      data: { type: ['object', 'null'] as const, description: 'Parameters forwarded to the selected system' },
    },
    required: ['operation'],
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      system: { type: 'string' },
      action: { type: 'string' },
      result: { type: 'object' },
      error: { type: 'string' },
    },
    required: ['success', 'system', 'action'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['Update Jira ticket', 'Create Confluence page', 'Post to Slack', 'Schedule meeting', 'Parse markdown'] },
    { kind: 'schedule', cadence: 'Weekly product operations sync' },
  ],
});
PRODUCT_OPERATIONS.tier = 'represent';
PRODUCT_OPERATIONS.confirmBeforeSend = true;
PRODUCT_OPERATIONS.domainKnowledge = 'Product management frameworks (RICE, WSJF, Jobs-to-be-Done), Agile/Scrum methodologies, user telemetry interpretation';

// Mark the 5 external integrations as lower-order base tools (isSkill:false)
const PRODUCT_EXTERNAL_TOOL_IDS = new Set([
  'product-jira', 'product-confluence', 'product-slack', 'product-calendar', 'product-markdown-parsing',
]);
for (const s of PRODUCT_SKILLS) {
  if (PRODUCT_EXTERNAL_TOOL_IDS.has(s.id)) {
    s.isSkill = false;
  }
}

// Set Advise/Aid/Represent tiers and confirmBeforeSend for all Product skills
const PRODUCT_TIER: Record<string, 'advise' | 'aid' | 'represent'> = {
  'create-roadmap': 'advise',
  'write-prd': 'aid',
  'product-data-analysis': 'advise',
  'product-jira': 'represent',
  'product-confluence': 'aid',
  'product-slack': 'represent',
  'product-calendar': 'represent',
  'product-markdown-parsing': 'aid',
  'product-operations': 'represent',
};
const PRODUCT_DOMAIN_KNOWLEDGE = 'Product management frameworks (RICE, WSJF, Jobs-to-be-Done), Agile/Scrum methodologies, user telemetry interpretation';
for (const s of PRODUCT_SKILLS) {
  if (PRODUCT_TIER[s.id]) {
    (s as Tool).tier = PRODUCT_TIER[s.id];
  }
  if (PRODUCT_DOMAIN_KNOWLEDGE) {
    (s as Tool).domainKnowledge = PRODUCT_DOMAIN_KNOWLEDGE;
  }
  // Represent-tier skills require confirmBeforeSend
  if ((s as Tool).tier === 'represent' && (s as Tool).confirmBeforeSend === undefined) {
    (s as Tool).confirmBeforeSend = true;
  }
}

PRODUCT_SKILLS.push(PRODUCT_OPERATIONS);

export const productSkills = PRODUCT_SKILLS;

export interface WorkflowStage {
  name: string;
  description: string;
  skills: Tool[];
}

export interface AssistantWorkflow {
  assistant: string;
  productObject: string;
  flow: string;
  stages: WorkflowStage[];
}

PRODUCT_SKILLS.forEach((s) => {
  if (s.id === 'create-roadmap') s.manifest.workflowStage = 'plan';
  else if (s.id === 'write-prd') s.manifest.workflowStage = 'specify';
  else if (s.id === 'product-data-analysis') s.manifest.workflowStage = 'analyze';
  else if (s.id === 'product-operations') s.manifest.workflowStage = 'deliver';
  else s.manifest.workflowStage = 'deliver';
});

export const productWorkflow: AssistantWorkflow = {
  assistant: 'Product',
  productObject: 'product / order',
  flow: 'plan → specify → analyze → deliver',
  stages: [
    { name: 'plan', description: 'Roadmap and strategic planning', skills: PRODUCT_SKILLS.filter((s) => s.manifest.workflowStage === 'plan') },
    { name: 'specify', description: 'Requirements specification (PRD)', skills: PRODUCT_SKILLS.filter((s) => s.manifest.workflowStage === 'specify') },
    { name: 'analyze', description: 'Product analytics and insights', skills: PRODUCT_SKILLS.filter((s) => s.manifest.workflowStage === 'analyze') },
    { name: 'deliver', description: 'Delivery execution: Jira, docs, Slack, calendar, parsing', skills: PRODUCT_SKILLS.filter((s) => s.manifest.workflowStage === 'deliver') },
  ],
};
