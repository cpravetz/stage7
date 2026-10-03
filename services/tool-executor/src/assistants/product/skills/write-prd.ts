// @ts-nocheck
import { createDeclarativeCodeSkill } from '../../../adk/code-skill-factory';

export const WRITE_PRD = createDeclarativeCodeSkill({
    id: 'write-prd',
    name: 'Write PRD',
    description: 'Generate a structured product requirements document with INVEST user stories, Given/When/Then acceptance criteria, technical requirements, data model, UX flows, and phased rollout plan.',
    persistenceEnvVar: 'STORAGE_DIR',
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
    triggers: [{ kind: 'user', phrase_examples: ["Write a PRD", "Update requirements", "Review requirements"] }],
    manifest: {},
    handler: async function handler(input, ctx) {
        function round2(n) { return Math.round(n * 100) / 100; }
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

        const problemKeywords = problem.split(/[\s,.!?]+/).filter(w => w.length > 3);
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

          const words = storyText.split(/\s+/);
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

        return prd;
      }
    });
