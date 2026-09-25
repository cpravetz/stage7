import { Tool, SchemaRecord } from '../../../types'
import { createCodeSkill, createExternalActionSkill, createSchemaRecord, SchemaProps } from '../code-skill-factory'
import { ctoTeamDeliveryHealthEvaluator } from './cto-team-delivery-health-evaluator';
import { ctoDisasterRecoveryPlanner } from './cto-disaster-recovery-planner';

const INFRA_PROVIDERS = [
  'datadog',
  'aws',
  'gcp',
  'azure',
  'kubernetes',
  'service-mesh',
  'cost-optimization',
  'iac-monitoring',
  'database-operations',
  'team-metrics',
  'github-read',
];

const ENG_PROVIDERS = ['jira', 'pagerduty', 'github-write'];

const DISASTER_PROVIDERS = ['disaster-recovery'];

function infraQuerySource(): string {
  return `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
    const provider = input.provider;
    const query = input.query;

    if (!provider || !INFRA_PROVIDERS.includes(provider)) {
      throw new Error('Invalid or missing provider. Must be one of: ' + INFRA_PROVIDERS.join(', '));
    }

    return { success: false, provider, query, error: 'Not connected: provider module unavailable for ' + provider };
  })();`;
}

function engActionsSource(): string {
  return `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
    const provider = input.provider;
    const action = input.action;
    const params = input.params || {};
    const dryRun = input.dryRun !== false;

    if (!provider || !ENG_PROVIDERS.includes(provider)) {
      throw new Error('Invalid or missing provider. Must be one of: ' + ENG_PROVIDERS.join(', '));
    }

    if (!action) {
      throw new Error('Missing required action parameter');
    }

    return { success: false, provider, action, params, dryRun, error: 'Not connected: external system unavailable for ' + provider };
  })();`;
}

function disasterReadinessSource(): string {
  return `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
    const provider = input.provider;
    const config = input.config || {};

    if (!provider || !DISASTER_PROVIDERS.includes(provider)) {
      throw new Error('Invalid or missing provider. Must be one of: ' + DISASTER_PROVIDERS.join(', '));
    }

    return { success: false, provider, config, error: 'Not connected: disaster recovery module unavailable' };
  })();`;
}

function architectureAdvisorySource(): string {
  return `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
    const system = input.system;
    const requirements = input.requirements || [];
    const context = input.context || {};

    if (!system) {
      throw new Error('Missing required system parameter');
    }

    const reqList = Array.isArray(requirements) ? requirements : [];
    const teamSize = context.teamSize || 0;
    const currentStack = Array.isArray(context.currentStack) ? context.currentStack : [];
    const constraints = Array.isArray(context.constraints) ? context.constraints : [];
    const timeline = context.timeline || '';
    const scale = context.scale || '';

    const recommendations = reqList.map((req, i) => ({
      category: 'architecture',
      suggestion: 'Evaluate ' + req + ' for ' + system,
      rationale: 'Requirement ' + (i + 1) + ' of ' + reqList.length + ' for system: ' + system,
      priority: i === 0 ? 'high' : 'medium',
      effort: 'medium',
    }));

    const risks = constraints.map((c, i) => ({
      area: 'constraints',
      description: 'Constraint: ' + c,
      mitigation: 'Review and address constraint ' + (i + 1),
    }));

    const decisions = [];

    if (teamSize > 0) {
      recommendations.push({
        category: 'team',
        suggestion: 'Team size of ' + teamSize + ' supports ' + system,
        rationale: 'Team capacity assessment based on team size parameter',
        priority: 'medium',
        effort: 'medium',
      });
    }

    return { success: true, system, requirements: reqList, context, result: { recommendations, risks, decisions, teamSize, currentStack, timeline, scale } };
  })();`;
}

const CTO_TRIGGERS = [
  { kind: 'user' as const, phrase_examples: ['evaluate architecture debt', 'optimize cloud spend', 'synthesize this incident', 'dry-run engineering remediation'] },
];

const architectureWrapperSource = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const systems = Array.isArray(input.systems) ? input.systems : [];
  if (!systems.length) {
    return { success: false, error: 'Not connected: no system health inputs were supplied', data: null };
  }
  const evaluated = [];
  const errors = [];
  for (const system of systems) {
    try {
      const result = await __execute_tool('cto-architecture-advisory', {
        system: system.name || 'unnamed',
        requirements: Array.isArray(input.requirements) ? input.requirements : [],
        context: Object.assign({}, input.context || {}, {
          teamSize: system.teamSize || 0,
          currentStack: system.currentStack || [],
          constraints: system.constraints || [],
          timeline: system.timeline || '',
          scale: system.scale || '',
        }),
      });
      if (result && result.success === false) {
        errors.push({ system: system.name || 'unknown', error: result.error || 'Underlying tool returned failure' });
      }
      evaluated.push(result);
    } catch (e) {
      errors.push({ system: system.name || 'unknown', error: e instanceof Error ? e.message : String(e) });
    }
  }
  const scored = systems.map((system) => {
    const s = typeof system === 'object' ? system : {};
    const weights = { reliability: 3, security: 3, scalability: 2, maintainability: 2, cost: 1 };
    const score = Object.keys(weights).reduce((sum, key) => sum + Number(s[key] || 0) * weights[key], 0);
    return { name: s.name, score, priority: score >= 18 ? 'high' : score >= 12 ? 'medium' : 'low' };
  }).sort((a, b) => b.score - a.score);
  const roadmap = scored.map((item, index) => ({
    rank: index + 1,
    ...item,
    action: item.priority === 'high' ? 'modernize now' : item.priority === 'medium' ? 'schedule next quarter' : 'monitor',
  }));
  return { success: true, data: { systems: scored, roadmap, evaluations: evaluated, generatedAt: new Date().toISOString() }, error: errors.length ? errors : null };
})();`;

const cloudSpendWrapperSource = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const rows = Array.isArray(input.billingRows) ? input.billingRows : [];
  if (!rows.length) {
    return { success: false, error: 'Not connected: no cloud billing rows were supplied', data: null };
  }
  const recommendations = [];
  const errors = [];
  for (const row of rows) {
    try {
      const result = await __execute_tool('cto-infrastructure-query', {
        provider: 'cost-optimization',
        query: 'analyze spend for ' + (row.service || 'unknown') + ' with billing ' + (row.spend || 0) + ' and utilization ' + (row.utilization || 0),
        options: { billingRow: row },
      });
      if (result && result.success === false) {
        errors.push({ service: row.service || 'unknown', error: result.error || 'Underlying tool returned failure' });
      }
      recommendations.push(result);
    } catch (e) {
      errors.push({ service: row.service || 'unknown', error: e instanceof Error ? e.message : String(e) });
    }
  }
  const rightsizing = rows.map((row) => {
    const spend = Number(row.spend || 0);
    const utilization = Number(row.utilization || 0);
    const projectedSavings = Math.round(spend * Math.min(0.35, Math.max(0, (1 - utilization) * 0.45)) * 100) / 100;
    return { service: row.service, currentSpend: spend, utilization, projectedSavings, action: utilization < 0.3 ? 'rightsizing or shutdown review' : utilization < 0.6 ? 'reserved capacity review' : 'monitor' };
  });
  const totalProjectedSavings = rightsizing.reduce((sum, item) => sum + item.projectedSavings, 0);
  return { success: true, data: { recommendations: rightsizing, totalProjectedSavings, evaluationResults: recommendations, generatedAt: new Date().toISOString() }, error: errors.length ? errors : null };
})();`;

const incidentWrapperSource = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const signals = Array.isArray(input.signals) ? input.signals : [];
  if (!signals.length) {
    return { success: false, error: 'Not connected: no telemetry, log, alert, or deployment signals were supplied', data: null };
  }
  const readinessResults = [];
  const errors = [];
  for (const signal of signals) {
    try {
      const result = await __execute_tool('cto-incident-disaster-readiness', {
        provider: 'disaster-recovery',
        config: { signal, context: input.context || {} },
      });
      if (result && result.success === false) {
        errors.push({ source: signal.source || 'unknown', error: result.error || 'Underlying tool returned failure' });
      }
      readinessResults.push(result);
    } catch (e) {
      errors.push({ source: signal.source || 'unknown', error: e instanceof Error ? e.message : String(e) });
    }
  }
  const hypotheses = signals.map((signal) => ({
    source: signal.source,
    evidence: signal.evidence,
    hypothesis: signal.hypothesis || 'Correlate with the nearest deployment or dependency change',
    confidence: Number(signal.confidence || 0),
  }));
  const mitigations = hypotheses.slice(0, 3).map((item, index) => ({
    priority: index + 1,
    action: item.confidence > 0.7 ? 'rollback or isolate the suspected change' : 'collect additional telemetry before changing production',
    owner: 'incident commander',
  }));
  const stakeholderUpdate = 'Incident review in progress; production changes require explicit approval.';
  return { success: true, data: { hypotheses, mitigations, stakeholderUpdate, readinessResults, generatedAt: new Date().toISOString() }, error: errors.length ? errors : null };
})();`;

const remediationSource = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
  const endpointUrl = input.endpointUrl;
  if (!endpointUrl) {
    return { success: false, error: 'not-connected: CTO engineering endpoint is not configured', data: null };
  }
  const dryRun = input.dryRun !== false;
  const confirmation = input.confirmation === true;
  if (!dryRun && !confirmation) {
    return { success: false, error: 'Explicit confirmation is required for live remediation', data: null };
  }
  try {
    const response = await fetch(endpointUrl, {
      method: input.method || 'POST',
      headers: { 'Content-Type': 'application/json', ...(input.token ? { Authorization: 'Bearer ' + input.token } : {}) },
      body: JSON.stringify(input.payload || {}),
    });
    const data = await response.json().catch(async () => ({ text: await response.text() }));
    return { success: response.ok, data: { response: { status: response.status, data } }, error: null };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error), data: null };
  }
})();`;

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

export const ctoSkills: Tool[] = [

  (() => { const t = createCodeSkill({
  id: 'cto-infrastructure-query',
  name: 'Infrastructure Query',
  description: 'Read-only queries across infrastructure providers (Datadog, AWS, GCP, Azure, Kubernetes, Service Mesh, Cost Optimization, IaC Monitoring, Database Operations, Team Metrics, GitHub Read)',
  manifest: {
    sourceCode: infraQuerySource(),
    persistenceEnv: 'CTO_HOME',
  },
  inputSchema: createSchemaRecord({
    provider: SchemaProps.select(INFRA_PROVIDERS, {
      description: 'Infrastructure provider to query',
      required: true,
    }),
    query: SchemaProps.text({
      description: 'Query string or structured query object for the provider',
      required: true,
    }),
    options: SchemaProps.object({}, {
      description: 'Additional provider-specific options',
      additionalProperties: true,
    }),
  }, { required: ['provider', 'query'] }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the query succeeded' }),
    provider: SchemaProps.text({ description: 'Provider that was queried' }),
    query: SchemaProps.text({ description: 'Original query' }),
    result: SchemaProps.object({}, { description: 'Query result data', additionalProperties: true }),
    error: SchemaProps.text({ description: 'Error message if failed' }),
  }),
  tier: 'advise',
  }); (t as any).isSkill = false; return t; })(),

  (() => { const t = createExternalActionSkill({
  id: 'cto-engineering-actions',
  name: 'Engineering Actions',
  description: 'Mutating actions against external engineering systems (Jira, PagerDuty, GitHub Write). Requires confirmation before execution.',
  system: 'engineering',
  action: 'execute',
  inputSchema: createSchemaRecord({
    provider: SchemaProps.select(ENG_PROVIDERS, {
      description: 'External engineering system to act upon',
      required: true,
    }),
    action: SchemaProps.text({
      description: 'Specific action to perform (e.g., create-issue, acknowledge-incident, create-pr)',
      required: true,
    }),
    params: SchemaProps.object({}, {
      description: 'Action-specific parameters',
      additionalProperties: true,
    }),
    dryRun: SchemaProps.boolean({
      description: 'If true, simulate the action without making changes',
      default: true,
    }),
  }, { required: ['provider', 'action'] }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the action succeeded' }),
    system: SchemaProps.text({ description: 'System that was targeted' }),
    action: SchemaProps.text({ description: 'Action that was performed' }),
    request: SchemaProps.object({
      input: SchemaProps.object({}, { additionalProperties: true }),
      endpoint: SchemaProps.text({}),
      method: SchemaProps.text({}),
      headers: SchemaProps.object({}, { additionalProperties: true }),
    }, { description: 'Request details' }),
    response: SchemaProps.object({
      status: SchemaProps.number({}),
      data: SchemaProps.object({}, { additionalProperties: true }),
    }, { description: 'Response from the external system' }),
    error: SchemaProps.text({ description: 'Error message if failed' }),
  }),
  configSchema: createSchemaRecord({
    confirmBeforeSend: SchemaProps.boolean({
      description: 'Require explicit confirmation before sending mutating requests',
      default: true,
    }),
  }),
  manifest: {
    confirmBeforeSend: true,
    persistenceEnv: 'CTO_HOME',
  },
  tier: 'represent',
  confirmBeforeSend: true,
  }); (t as any).isSkill = false; return t; })(),

  (() => { const t = createCodeSkill({
  id: 'cto-incident-disaster-readiness',
  name: 'Incident & Disaster Readiness',
  description: 'Hybrid skill for disaster recovery operations and incident readiness checks',
  manifest: {
    sourceCode: disasterReadinessSource(),
    persistenceEnv: 'CTO_HOME',
  },
  inputSchema: createSchemaRecord({
    provider: SchemaProps.select(DISASTER_PROVIDERS, {
      description: 'Disaster recovery provider to use',
      required: true,
    }),
    config: SchemaProps.object({}, {
      description: 'Operation-specific configuration',
      additionalProperties: true,
    }),
  }, { required: ['provider', 'config'] }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the operation succeeded' }),
    provider: SchemaProps.text({ description: 'Provider that was used' }),
    config: SchemaProps.object({}, { description: 'Configuration used', additionalProperties: true }),
    result: SchemaProps.object({}, { description: 'Operation result data', additionalProperties: true }),
    error: SchemaProps.text({ description: 'Error message if failed' }),
  }),
  tier: 'aid',
  }); (t as any).isSkill = false; return t; })(),

  (() => { const t = createCodeSkill({
  id: 'cto-architecture-advisory',
  name: 'Architecture & Tech Stack Advisory',
  description: 'Reasoning-based architectural guidance and tech stack recommendations',
  manifest: {
    sourceCode: architectureAdvisorySource(),
    reasoningConfig: {
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000,
    },
    persistenceEnv: 'CTO_HOME',
  },
  inputSchema: createSchemaRecord({
    system: SchemaProps.text({
      description: 'Name or description of the system being architected',
      required: true,
    }),
    requirements: SchemaProps.objectArray(SchemaProps.text({}), {
      description: 'List of functional and non-functional requirements',
      minItems: 1,
    }),
    context: SchemaProps.object({
      teamSize: SchemaProps.integer({ description: 'Number of engineers on the team' }),
      currentStack: SchemaProps.stringArray({ description: 'Currently used technologies' }),
      constraints: SchemaProps.stringArray({ description: 'Technical, budget, or organizational constraints' }),
      timeline: SchemaProps.text({ description: 'Expected timeline for implementation' }),
      scale: SchemaProps.text({ description: 'Expected scale (users, requests, data volume)' }),
    }, {
      description: 'Additional context for the advisory',
      additionalProperties: true,
    }),
  }, { required: ['system', 'requirements'] }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the advisory completed' }),
    system: SchemaProps.text({ description: 'System that was analyzed' }),
    requirements: SchemaProps.objectArray(SchemaProps.text({}), { description: 'Requirements that were considered' }),
    context: SchemaProps.object({}, { description: 'Context that was provided', additionalProperties: true }),
    result: SchemaProps.object({
      recommendations: SchemaProps.objectArray(SchemaProps.object({
        category: SchemaProps.text({}),
        suggestion: SchemaProps.text({}),
        rationale: SchemaProps.text({}),
        priority: SchemaProps.select(['high', 'medium', 'low'], {}),
        effort: SchemaProps.select(['low', 'medium', 'high'], {}),
      }), {}),
      risks: SchemaProps.objectArray(SchemaProps.object({
        area: SchemaProps.text({}),
        description: SchemaProps.text({}),
        mitigation: SchemaProps.text({}),
      }), {}),
      decisions: SchemaProps.objectArray(SchemaProps.object({
        topic: SchemaProps.text({}),
        decision: SchemaProps.text({}),
        alternatives: SchemaProps.stringArray({}),
      }), {}),
    }, { description: 'Structured advisory output', additionalProperties: true }),
    error: SchemaProps.text({ description: 'Error message if failed' }),
  }),
  tier: 'advise',
  }); (t as any).isSkill = false; return t; })(),

  createCodeSkill({
    id: 'cto-architecture-tech-debt-evaluator',
    name: 'Architecture & Tech Debt Evaluator',
    description: 'Evaluate supplied system health scores and produce a prioritized architecture modernization roadmap.',
    manifest: {
      sourceCode: architectureWrapperSource,
      persistenceEnv: 'CTO_HOME',
      ui: { view: 'architecture-roadmap' },
    },
    inputSchema: createSchemaRecord({
      systems: SchemaProps.objectArray(SchemaProps.object({
        name: SchemaProps.text({ description: 'System or service name' }),
        reliability: SchemaProps.number({ description: 'Reliability score from 0 to 5' }),
        security: SchemaProps.number({ description: 'Security posture score from 0 to 5' }),
        scalability: SchemaProps.number({ description: 'Scalability score from 0 to 5' }),
        maintainability: SchemaProps.number({ description: 'Maintainability score from 0 to 5' }),
        cost: SchemaProps.number({ description: 'Cost pressure score from 0 to 5' }),
      }), { description: 'System health and trade-off inputs' }),
      requirements: SchemaProps.objectArray(SchemaProps.text({}), { description: 'Requirements to evaluate per system' }),
      context: SchemaProps.object({}, { description: 'Additional context passed to underlying architecture advisory', additionalProperties: true }),
    }, { required: ['systems'] }),
    outputSchema: createSchemaRecord({
      success: SchemaProps.boolean({ description: 'Whether evaluation completed' }),
      data: SchemaProps.object({}, { description: 'Scored systems and prioritized roadmap' }),
      error: SchemaProps.text({ description: 'Failure message' }),
    }),
    triggers: CTO_TRIGGERS,
    tier: 'advise',
  }),

  createCodeSkill({
    id: 'cto-cloud-spend-infrastructure-optimizer',
    name: 'Cloud Spend & Infrastructure Optimizer',
    description: 'Analyze supplied cloud billing and utilization rows to recommend rightsizing and capacity actions.',
    manifest: {
      sourceCode: cloudSpendWrapperSource,
      persistenceEnv: 'CTO_HOME',
      ui: { view: 'cloud-cost-optimizer' },
    },
    inputSchema: createSchemaRecord({
      billingRows: SchemaProps.objectArray(SchemaProps.object({
        service: SchemaProps.text({ description: 'Cloud service or account name' }),
        spend: SchemaProps.number({ description: 'Billing amount for the period' }),
        utilization: SchemaProps.number({ description: 'Average resource utilization from 0 to 1' }),
      }), { description: 'Cloud billing and utilization records' }),
      context: SchemaProps.object({}, { description: 'Additional context for cost analysis', additionalProperties: true }),
    }, { required: ['billingRows'] }),
    outputSchema: createSchemaRecord({
      success: SchemaProps.boolean({ description: 'Whether optimization completed' }),
      data: SchemaProps.object({}, { description: 'Recommendations and savings estimate' }),
      error: SchemaProps.text({ description: 'Failure message' }),
    }),
    triggers: CTO_TRIGGERS,
    tier: 'advise',
  }),

  createCodeSkill({
    id: 'cto-incident-war-room-synthesizer',
    name: 'Incident War Room Synthesizer',
    description: 'Correlate supplied telemetry, logs, alerts, and deployment signals into hypotheses and mitigation steps.',
    manifest: {
      sourceCode: incidentWrapperSource,
      persistenceEnv: 'CTO_HOME',
      ui: { view: 'incident-timeline' },
    },
    inputSchema: createSchemaRecord({
      signals: SchemaProps.objectArray(SchemaProps.object({
        source: SchemaProps.text({ description: 'Telemetry, log, alert, or deployment source' }),
        evidence: SchemaProps.text({ description: 'Observed evidence' }),
        hypothesis: SchemaProps.text({ description: 'Optional root-cause hypothesis' }),
        confidence: SchemaProps.number({ description: 'Confidence from 0 to 1' }),
      }), { description: 'Incident signals to correlate' }),
      context: SchemaProps.object({}, { description: 'Additional incident context', additionalProperties: true }),
    }, { required: ['signals'] }),
    outputSchema: createSchemaRecord({
      success: SchemaProps.boolean({ description: 'Whether synthesis completed' }),
      data: SchemaProps.object({}, { description: 'Hypotheses and mitigations' }),
      error: SchemaProps.text({ description: 'Failure message' }),
    }),
    triggers: CTO_TRIGGERS,
    tier: 'aid',
  }),

  createCodeSkill({
    id: 'cto-engineering-action-iac-drift-remediation',
    name: 'Engineering Action & IaC Drift Remediation',
    description: 'Dry-run and, after explicit confirmation, apply approved engineering or IaC remediation through a configured endpoint.',
    manifest: {
      sourceCode: remediationSource,
      persistenceEnv: 'CTO_HOME',
      confirmBeforeSend: true,
      ui: { view: 'remediation-approval' },
      configSchema: createSchemaRecord({
        endpointUrl: SchemaProps.url({ description: 'Configured engineering or IaC remediation endpoint' }),
        token: SchemaProps.password({ description: 'Bearer token for the remediation endpoint' }),
      }, { required: ['endpointUrl', 'token'] }),
    },
    inputSchema: createSchemaRecord({
      payload: SchemaProps.object({}, { description: 'Approved remediation payload' }),
      dryRun: SchemaProps.boolean({ description: 'Validate without applying; defaults to true', default: true }),
      confirmation: SchemaProps.boolean({ description: 'Explicit approval for live execution', default: false }),
    }, { required: [] }),
    outputSchema: createSchemaRecord({
      success: SchemaProps.boolean({ description: 'Whether action completed' }),
      data: SchemaProps.object({}, { description: 'Remote response when available' }),
      error: SchemaProps.text({ description: 'Failure or governance message' }),
    }),
    triggers: CTO_TRIGGERS,
    tier: 'represent',
    confirmBeforeSend: true,
  }),
];

export const ctoCanonicalSkills = ctoSkills.filter((s) => s.isSkill !== false);

ctoSkills.forEach((s) => {
  if (s.id === 'cto-infrastructure-query') s.manifest.workflowStage = 'monitor';
  else if (s.id === 'cto-engineering-actions') s.manifest.workflowStage = 'execute';
  else if (s.id === 'cto-incident-disaster-readiness') s.manifest.workflowStage = 'diagnose';
  else if (s.id === 'cto-architecture-advisory') s.manifest.workflowStage = 'diagnose';
  else if (s.id === 'cto-architecture-tech-debt-evaluator') s.manifest.workflowStage = 'plan';
  else if (s.id === 'cto-cloud-spend-infrastructure-optimizer') s.manifest.workflowStage = 'plan';
  else if (s.id === 'cto-incident-war-room-synthesizer') s.manifest.workflowStage = 'diagnose';
  else if (s.id === 'cto-engineering-action-iac-drift-remediation') s.manifest.workflowStage = 'approve';
});

export const ctoWorkflow: AssistantWorkflow = {
  assistant: 'CTO',
  productObject: 'system / incident',
  flow: 'monitor → diagnose → plan → approve → execute',
  stages: [
    { name: 'monitor', description: 'Read-only infrastructure and system health monitoring', skills: ctoSkills.filter((s) => s.manifest.workflowStage === 'monitor') },
    { name: 'diagnose', description: 'Architecture, incident, and disaster readiness analysis', skills: ctoSkills.filter((s) => s.manifest.workflowStage === 'diagnose') },
    { name: 'plan', description: 'Roadmap, cost optimization, and modernization planning', skills: ctoSkills.filter((s) => s.manifest.workflowStage === 'plan') },
    { name: 'approve', description: 'Approval-gated change review before execution', skills: ctoSkills.filter((s) => s.manifest.workflowStage === 'approve') },
    { name: 'execute', description: 'Mutating engineering and remediation actions', skills: ctoSkills.filter((s) => s.manifest.workflowStage === 'execute') },
  ],
};
