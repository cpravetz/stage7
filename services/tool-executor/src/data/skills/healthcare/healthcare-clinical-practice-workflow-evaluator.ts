import { Tool, SchemaRecord } from '../../../types'
import { createCodeSkill, SchemaProps, createSchemaRecord } from '../code-skill-factory'

function withUxMetadata(schema: SchemaRecord): SchemaRecord {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined
  if (!properties) return schema
  Object.entries(properties).forEach(([key, property], index) => {
    if (!property || typeof property !== 'object') return
    property.title = property.title || key.replace(/([A-Z])/g, ' $1').replace(/^./, (character) => character.toUpperCase())
    property.order = typeof property.order === 'number' ? property.order : index + 1
    property.hint = property.hint || property.description || 'See the tool documentation for details.'
  })
  return schema
}

const HEALTHCARE_HOME = process.env.HEALTHCARE_HOME || '/tmp/healthcare'
const SAFETY_BOUNDARY = 'Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician must review all outputs.'
const metadata = { domain: 'healthcare', persistenceEnv: 'HEALTHCARE_HOME', HEALTHCARE_HOME, homeEnv: 'HEALTHCARE_HOME', healthcareHome: HEALTHCARE_HOME, clinicalSafetyBoundary: SAFETY_BOUNDARY }
const triggers = [
  { kind: 'user' as const, phrase_examples: ['evaluate clinic workflow', 'review this clinical case', 'create a care plan', 'stage intake dispatch'] },
  { kind: 'schedule' as const, cadence: 'daily clinical operations review' },
  { kind: 'event' as const, on: 'intake submission, appointment change, care-plan request, or guideline update' },
  { kind: 'data' as const, condition: 'workflow, evidence, education, or intake data is available for review' },
]

const workflowSource = `(async () => {   const input = typeof __tool_input !== 'undefined' ? __tool_input : {};   const healthcareHome = process.env.HEALTHCARE_HOME || '/tmp/healthcare';   const rows = Array.isArray(input.workflowRows) ? input.workflowRows : [];   if (!rows.length) {     console.log(JSON.stringify({ success: false, mode: 'not-connected', error: 'Not connected: no workflow records were supplied' }));     return;   }   const accessThreshold = Number(input.accessWaitThresholdMinutes ?? 30);   const billingThreshold = Number(input.billingDelayThresholdDays ?? 7);   const metrics = rows.map((row, index) => {     const item = row && typeof row === 'object' ? row : {};     const scheduled = Math.max(0, Number(item.scheduled ?? item.scheduledCount ?? 0));     const completed = Math.max(0, Number(item.completed ?? 0));     const noShows = Math.max(0, Number(item.noShows ?? 0));     const avgWait = Math.max(0, Number(item.avgWaitMinutes ?? item.waitMinutes ?? 0));     const billingDelay = Math.max(0, Number(item.billingDelayDays ?? 0));     const utilization = scheduled > 0 ? Math.round(completed / scheduled * 10000) / 100 : 0;     const noShowRate = scheduled > 0 ? Math.round(noShows / scheduled * 10000) / 100 : 0;     const bottleneck = avgWait > accessThreshold ? 'access' : billingDelay > billingThreshold ? 'billing' : noShowRate > 15 ? 'retention' : 'none identified';     return { rowId: item.id || ('row_' + (index + 1)), facility: item.facility || 'unspecified', scheduled, completed, noShows, utilization, noShowRate, avgWaitMinutes: avgWait, billingDelayDays: billingDelay, bottleneck };   });   const sum = (values) => values.reduce((total, value) => total + value, 0);   const recommendations = [];   if (metrics.some((item) => item.bottleneck === 'access')) recommendations.push('Review access capacity and wait-time handoffs.');   if (metrics.some((item) => item.bottleneck === 'billing')) recommendations.push('Review billing-cycle delays and follow-up ownership.');   if (metrics.some((item) => item.bottleneck === 'retention')) recommendations.push('Review no-show outreach and scheduling flexibility.');   console.log(JSON.stringify({     success: true,     mode: 'local',     data: {       metrics,       summary: {         totalScheduled: sum(metrics.map((item) => item.scheduled)),         totalCompleted: sum(metrics.map((item) => item.completed)),         totalNoShows: sum(metrics.map((item) => item.noShows)),         avgUtilization: metrics.length ? Math.round(sum(metrics.map((item) => item.utilization)) / metrics.length * 100) / 100 : 0,         avgNoShowRate: metrics.length ? Math.round(sum(metrics.map((item) => item.noShowRate)) / metrics.length * 100) / 100 : 0,         avgWaitMinutes: metrics.length ? Math.round(sum(metrics.map((item) => item.avgWaitMinutes)) / metrics.length * 100) / 100 : 0,         avgBillingDelayDays: metrics.length ? Math.round(sum(metrics.map((item) => item.billingDelayDays)) / metrics.length * 100) / 100 : 0,         bottlenecks: metrics.filter((item) => item.bottleneck !== 'none identified').map((item) => item.bottleneck),       },       recommendations,       safetyBoundary: 'Decision support and education only: do not diagnose, prescribe, change treatment, or make autonomous clinical decisions; use only authorized minimum-necessary data and approved secure endpoints for PHI; a qualified clinician must review all outputs.'     }   })); })();`

const workflowConfig = createSchemaRecord({
  healthcareHome: SchemaProps.text({ description: 'Healthcare workspace path or base URL; defaults to HEALTHCARE_HOME' }),
  accessWaitThresholdMinutes: SchemaProps.number({ description: 'Wait-time threshold in minutes for an access bottleneck', default: 30 }),
  billingDelayThresholdDays: SchemaProps.number({ description: 'Billing-delay threshold in days for a billing bottleneck', default: 7 }),
})

export const healthcareClinicalPracticeWorkflowEvaluator = createCodeSkill({
  id: 'healthcare-clinical-practice-workflow-evaluator',
  name: 'Clinical Practice & Workflow Evaluator',
  description: 'Evaluate supplied scheduling, completion, no-show, wait-time, and billing-delay records to identify deterministic operational bottlenecks without making clinical claims.',
  manifest: { sourceCode: workflowSource, configSchema: workflowConfig, persistenceEnv: 'HEALTHCARE_HOME', healthcareHome: HEALTHCARE_HOME, ui: { view: 'clinical-operations' }, metadata },
  inputSchema: createSchemaRecord({
    workflowRows: SchemaProps.objectArray(SchemaProps.object({
      id: SchemaProps.text({ description: 'Optional workflow row identifier' }),
      facility: SchemaProps.text({ description: 'Facility or practice identifier' }),
      scheduled: SchemaProps.integer({ description: 'Scheduled encounters' }),
      completed: SchemaProps.integer({ description: 'Completed encounters' }),
      noShows: SchemaProps.integer({ description: 'No-show encounters' }),
      avgWaitMinutes: SchemaProps.number({ description: 'Average wait time in minutes' }),
      billingDelayDays: SchemaProps.number({ description: 'Average billing delay in days' }),
    }), { description: 'Practice workflow records' }),
    accessWaitThresholdMinutes: SchemaProps.number({ description: 'Wait-time threshold in minutes', default: 30 }),
    billingDelayThresholdDays: SchemaProps.number({ description: 'Billing-delay threshold in days', default: 7 }),
  }, { required: ['workflowRows'] }),
  outputSchema: createSchemaRecord({
    success: SchemaProps.boolean({ description: 'Whether the workflow evaluation completed' }),
    mode: SchemaProps.text({ description: 'Execution mode' }),
    data: SchemaProps.object({}, { description: 'Workflow metrics, summary, and safety boundary' }),
    error: SchemaProps.text({ description: 'Failure message' }),
  }, { required: ['success', 'mode', 'data'] }),
  triggers,
})

healthcareClinicalPracticeWorkflowEvaluator.configSchema = workflowConfig
withUxMetadata(healthcareClinicalPracticeWorkflowEvaluator.inputSchema as SchemaRecord)
withUxMetadata(healthcareClinicalPracticeWorkflowEvaluator.outputSchema as SchemaRecord)
if (healthcareClinicalPracticeWorkflowEvaluator.configSchema) withUxMetadata(healthcareClinicalPracticeWorkflowEvaluator.configSchema)
