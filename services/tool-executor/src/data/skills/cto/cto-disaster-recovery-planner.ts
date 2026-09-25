import { Tool, SchemaRecord } from '../../../types';
import { createCodeSkill, SchemaProps } from '../code-skill-factory';

const DR_CONFIG_SCHEMA: SchemaRecord = {
  type: 'object',
  properties: {
    rtoTargetMinutes: SchemaProps.integer({ description: 'Recovery Time Objective target in minutes', default: 60 }),
    rpoTargetMinutes: SchemaProps.integer({ description: 'Recovery Point Objective target in minutes', default: 15 }),
    failoverAuto: SchemaProps.boolean({ description: 'Allow automated failover during DR testing', default: false }),
    includeTeams: SchemaProps.boolean({ description: 'Include team notification in DR readiness assessment', default: true }),
  },
  description: 'Disaster recovery RTO/RPO targets and configuration',
};

const source = `(async () => {
const input = typeof __tool_input !== 'undefined' ? __tool_input : {};
const config = input.config || input.configSchema || {};
const rtoTarget = config.rtoTargetMinutes != null ? config.rtoTargetMinutes : 60;
const rpoTarget = config.rpoTargetMinutes != null ? config.rpoTargetMinutes : 15;

const readinessResult = await __execute_tool('cto-incident-disaster-readiness', {
  provider: 'disaster-recovery',
  config: { rtoTarget, rpoTarget, failoverAuto: config.failoverAuto !== false, context: input.context || {} },
});

if (!readinessResult || readinessResult.success === false) {
  console.log(JSON.stringify({
    success: false,
    error: readinessResult && readinessResult.error ? readinessResult.error : 'Not connected: disaster recovery module unavailable; ensure cto-incident-disaster-readiness is connected',
    rtoTarget,
    rpoTarget,
  }));
  return;
}

const checkData = readinessResult.result || readinessResult.data || {};
const systems = Array.isArray(checkData.systems) ? checkData.systems : [];
const assessments = systems.map((system) => {
  const actualRto = system.rto != null ? system.rto : system.currentRto != null ? system.currentRto : rtoTarget;
  const actualRpo = system.rpo != null ? system.rpo : system.currentRpo != null ? system.currentRpo : rpoTarget;
  const rtoMet = actualRto <= rtoTarget;
  const rpoMet = actualRpo <= rpoTarget;
  return {
    name: system.name || 'unnamed',
    rtoActual: actualRto,
    rpoActual: actualRpo,
    rtoMet,
    rpoMet,
    status: rtoMet && rpoMet ? 'ready' : 'needs-action',
    backupVerified: system.backupVerified || false,
    lastTested: system.lastTested || 'unknown',
  };
});

const readyCount = assessments.filter((a) => a.status === 'ready').length;
const overallStatus = assessments.length > 0 && readyCount === assessments.length ? 'ready' : readyCount > assessments.length / 2 ? 'partial' : 'not-ready';
const recommendations = assessments.filter((a) => a.status !== 'ready').map((a) => ({
  system: a.name,
  actions: [...(!a.rtoMet ? ['Reduce recovery time to meet RTO target of ' + rtoTarget + ' minutes'] : []), ...(!a.rpoMet ? ['Reduce data loss tolerance to meet RPO target of ' + rpoTarget + ' minutes'] : [])],
}));

console.log(JSON.stringify({
  success: true,
  data: {
    readiness: { overallStatus, readySystems: readyCount, totalSystems: assessments.length, rtoTarget, rpoTarget, includeTeams: config.includeTeams !== false },
    assessments,
    recommendations,
    generatedAt: new Date().toISOString(),
  },
  delegatedTo: 'cto-incident-disaster-readiness',
}));
})()`;

export const ctoDisasterRecoveryPlanner = createCodeSkill({
  id: 'cto-disaster-recovery-planner',
  name: 'Disaster Recovery Planner',
  description: 'Incident readiness planner using disaster recovery checks with configurable RTO/RPO targets.',
  manifest: {
    sourceCode: source,
    persistenceEnv: 'CTO_HOME',
    configSchema: DR_CONFIG_SCHEMA,
    lowerOrderTools: ['cto-incident-disaster-readiness'],
  },
  inputSchema: {
    type: 'object',
    properties: {
      systems: SchemaProps.objectArray(SchemaProps.object({ name: SchemaProps.text({ description: 'System or service name' }), rto: SchemaProps.number({ description: 'Current RTO in minutes' }), rpo: SchemaProps.number({ description: 'Current RPO in minutes' }), backupVerified: SchemaProps.boolean({ description: 'Whether backups are verified' }), lastTested: SchemaProps.text({ description: 'Last DR test date' }) }), { description: 'Systems to assess for disaster recovery' }),
      context: SchemaProps.object({}, { description: 'Additional incident context', additionalProperties: true }),
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      success: SchemaProps.boolean({ description: 'Whether readiness check completed' }),
      data: SchemaProps.object({}, { additionalProperties: true, description: 'DR readiness assessment' }),
      error: SchemaProps.text({ description: 'Failure message' }),
    },
    required: ['success', 'data'],
  },
  triggers: [
    { kind: 'user', phrase_examples: ['check disaster recovery readiness', 'assess RTO RPO compliance', 'DR failover test', 'incident readiness review'] }
  ],
  tier: 'advise',
});

ctoDisasterRecoveryPlanner.configSchema = DR_CONFIG_SCHEMA;

export default ctoDisasterRecoveryPlanner;
