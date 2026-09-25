import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const DORA_CONFIG_SCHEMA: SchemaRecord = {
  type: 'object',
  properties: {
    deploymentFrequencyThreshold: SchemaProps.number({ description: 'Minimum acceptable deployment frequency (deployments per week)', default: 1 }),
    leadTimeThresholdDays: SchemaProps.number({ description: 'Maximum acceptable lead time for changes in days', default: 7 }),
    changeFailureRateThreshold: SchemaProps.number({ description: 'Maximum acceptable change failure rate as decimal (0.0-1.0)', default: 0.15 }),
    mttrThresholdHours: SchemaProps.number({ description: 'Maximum acceptable time to restore service in hours', default: 24 }),
  },
  description: 'DORA metric evaluation thresholds',
};

const source = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const config = input.config || input.configSchema || {};
const thresholds = {
  deploymentFrequency: config.deploymentFrequencyThreshold != null ? config.deploymentFrequencyThreshold : 1,
  leadTimeDays: config.leadTimeThresholdDays != null ? config.leadTimeThresholdDays : 7,
  changeFailureRate: config.changeFailureRateThreshold != null ? config.changeFailureRateThreshold : 0.15,
  mttrHours: config.mttrThresholdHours != null ? config.mttrThresholdHours : 24,
};

const teamMetricsResult = await __execute_tool('cto-infrastructure-query', {
  provider: 'team-metrics',
  query: 'calculate_dora_metrics team-capacity sprint-velocity',
  options: { evaluationPeriod: input.period || 'month', systems: input.systems || [] },
});

if (!teamMetricsResult || teamMetricsResult.success === false) {
  console.log(JSON.stringify({
    success: false,
    error: 'Not connected: team-metrics provider unavailable; ensure cto-infrastructure-query is connected with team-metrics provider',
    thresholds,
  }));
  return;
}

const metrics = teamMetricsResult.result || teamMetricsResult.data || {};
const deployments = Array.isArray(metrics.deployments) ? metrics.deployments : [];
const teamMembers = Array.isArray(metrics.teamMembers) ? metrics.teamMembers : [];
const sprints = Array.isArray(metrics.sprints) ? metrics.sprints : [];
const doraRaw = metrics.dora || {};

const deploymentFrequency = deployments.length;
const leadTimeDays = deployments.length ? deployments.reduce((sum, d) => sum + (d.leadTimeDays || 0), 0) / deployments.length : 0;
const changeFailureRate = deployments.length ? deployments.filter((d) => d.failed).length / deployments.length : 0;
const mttrHours = doraRaw.mttr || doraRaw.timeToRestore || 0;

const doraAssessment = {
  deploymentFrequency: { value: deploymentFrequency, threshold: thresholds.deploymentFrequency, status: deploymentFrequency >= thresholds.deploymentFrequency ? 'elite' : 'limited' },
  leadTime: { value: Math.round(leadTimeDays * 100) / 100, threshold: thresholds.leadTimeDays, status: leadTimeDays <= thresholds.leadTimeDays ? 'elite' : 'limited' },
  changeFailureRate: { value: Math.round(changeFailureRate * 10000) / 10000, threshold: thresholds.changeFailureRate, status: changeFailureRate <= thresholds.changeFailureRate ? 'elite' : 'limited' },
  timeToRestore: { value: Math.round(mttrHours * 100) / 100, threshold: thresholds.mttrHours, status: mttrHours <= thresholds.mttrHours ? 'elite' : 'limited' },
};

const capacity = teamMembers.map((member) => ({
  name: member.name || 'unnamed',
  role: member.role || 'engineer',
  capacity: member.capacity != null ? member.capacity : member.utilization || 0,
  availableHours: (member.capacity != null ? member.capacity : member.utilization || 0) * 40,
  status: (member.capacity != null ? member.capacity : member.utilization || 0) > 0.85 ? 'overloaded' : (member.capacity != null ? member.capacity : member.utilization || 0) > 0.7 ? 'at-capacity' : 'available',
}));

const velocity = sprints.map((sprint) => ({
  sprint: sprint.name || sprint.id || 'unknown',
  plannedPoints: sprint.plannedPoints || sprint.plan || 0,
  completedPoints: sprint.completedPoints || sprint.actual || 0,
  velocity: (sprint.completedPoints || sprint.actual || 0) / Math.max(sprint.plannedPoints || sprint.plan || 1, 1),
}));

const avgVelocity = velocity.length ? velocity.reduce((sum, v) => sum + v.velocity, 0) / velocity.length : 0;

console.log(JSON.stringify({
  success: true,
  data: {
    doraAssessment,
    teamCapacity: { members: capacity, totalCapacity: capacity.reduce((sum, m) => sum + (m.capacity || 0), 0), avgCapacity: capacity.length ? capacity.reduce((sum, m) => sum + (m.capacity || 0), 0) / capacity.length : 0 },
    sprintVelocity: { sprints: velocity, averageVelocity: Math.round(avgVelocity * 100) / 100, trend: velocity.length >= 2 ? (velocity[velocity.length - 1].velocity > velocity[0].velocity ? 'improving' : velocity[velocity.length - 1].velocity < velocity[0].velocity ? 'declining' : 'stable') : 'insufficient-data' },
    thresholds,
    generatedAt: new Date().toISOString(),
  },
  delegatedTo: 'cto-infrastructure-query (team-metrics)',
  calculate_dora_metrics: true,
}));
})()`;

export const ctoTeamDeliveryHealthEvaluator = createCodeSkill({
  id: 'cto-team-delivery-health-evaluator',
  name: 'Team Delivery Health Evaluator',
  description: 'Evaluate DORA metrics, team capacity, and sprint velocity using team-metrics data to assess engineering delivery health.',
  manifest: {
    sourceCode: source,
    persistenceEnv: 'CTO_HOME',
    configSchema: DORA_CONFIG_SCHEMA,
    lowerOrderTools: ['cto-infrastructure-query'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      systems: SchemaProps.objectArray(SchemaProps.text({ description: 'System or team name to evaluate' }), { description: 'Teams or systems to assess' }),
      period: SchemaProps.select(['week', 'month', 'quarter'], { description: 'Evaluation period', default: 'month' }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: SchemaProps.boolean({ description: 'Whether evaluation completed' }),
      data: SchemaProps.object({}, { additionalProperties: true, description: 'DORA assessment, team capacity, and sprint velocity' }),
      error: SchemaProps.text({ description: 'Failure message' }),
    },
    required: ['success', 'data'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['evaluate team delivery health', 'check DORA metrics', 'assess sprint velocity', 'team capacity review'] }
  ],
  tier: 'advise',
isSkill: true,
});

ctoTeamDeliveryHealthEvaluator.configSchema = DORA_CONFIG_SCHEMA;

export default ctoTeamDeliveryHealthEvaluator;
